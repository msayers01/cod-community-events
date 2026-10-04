import { createServer, type Server as HttpServer } from "node:http";
import { Redis } from "ioredis";
import { Server } from "socket.io";
import {
  REDIS_CHANNEL,
  isRoom,
  parseEnvelope,
  rooms,
  type ClientEvents,
  type ServerEvents,
} from "@cod/realtime";

export interface RealtimeOptions {
  redisUrl: string;
  /** Allowed browser origins (the web app). */
  corsOrigins: string[];
  /**
   * Optional check that an overlay key exists before letting a socket join its
   * room. Keeps unknown keys from accumulating rooms; the key itself is the secret.
   */
  overlayKeyExists?: (key: string) => Promise<boolean>;
}

export interface RealtimeServer {
  http: HttpServer;
  io: Server<ClientEvents, ServerEvents>;
  close(): Promise<void>;
}

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Socket.IO server. It owns no state: publishers (web, worker) write envelopes
 * to a Redis channel, every instance subscribes and relays to its local rooms.
 * Clients only ever join rooms; they cannot emit to each other.
 */
export function createRealtimeServer(opts: RealtimeOptions): RealtimeServer {
  const http = createServer((req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "text/plain" }).end("ok");
      return;
    }
    res.writeHead(404).end();
  });

  const io = new Server<ClientEvents, ServerEvents>(http, {
    cors: { origin: opts.corsOrigins, methods: ["GET", "POST"] },
    serveClient: false,
    // Overlays sit in OBS for hours; keep pings generous.
    pingInterval: 20_000,
    pingTimeout: 30_000,
  });

  io.on("connection", (socket) => {
    socket.on("join.event", (eventId) => {
      if (typeof eventId === "string" && ID_RE.test(eventId))
        void socket.join(rooms.event(eventId));
    });
    socket.on("join.overlay", async (key) => {
      if (typeof key !== "string" || !ID_RE.test(key)) return;
      if (opts.overlayKeyExists && !(await opts.overlayKeyExists(key))) return;
      void socket.join(rooms.overlay(key));
    });
  });

  const sub = new Redis(opts.redisUrl, { maxRetriesPerRequest: null });
  sub.on("error", (err) => console.error(`[realtime] redis: ${err.message}`));
  void sub.subscribe(REDIS_CHANNEL);
  sub.on("message", (_channel, raw) => {
    const env = parseEnvelope(raw);
    if (!env || !isRoom(env.room)) return;
    if (env.event === "event.updated") io.to(env.room).emit("event.updated", env.data);
    else io.to(env.room).emit("overlay.state", env.data);
  });

  return {
    http,
    io,
    async close() {
      await new Promise<void>((resolve) => io.close(() => resolve()));
      await sub.quit().catch(() => undefined);
    },
  };
}

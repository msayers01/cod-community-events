import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { io as connect, type Socket } from "socket.io-client";
import {
  createPublisher,
  rooms,
  type EventUpdated,
  type OverlayState,
  type Publisher,
} from "@cod/realtime";
import { createRealtimeServer, type RealtimeServer } from "../src/server.js";

const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
let server: RealtimeServer;
let publisher: Publisher;
let url: string;

beforeAll(async () => {
  server = createRealtimeServer({
    redisUrl,
    corsOrigins: ["http://localhost:3000"],
    overlayKeyExists: async (key) => key === "known-key",
  });
  await new Promise<void>((r) => server.http.listen(0, r));
  const addr = server.http.address();
  url = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  publisher = createPublisher(redisUrl);
  // give the subscriber a moment to attach
  await new Promise((r) => setTimeout(r, 200));
});

afterAll(async () => {
  await publisher.close();
  await server.close();
});

function client(): Promise<Socket> {
  return new Promise((resolve) => {
    const s = connect(url, { transports: ["websocket"] });
    s.on("connect", () => resolve(s));
  });
}

function waitFor<T>(socket: Socket, event: string, ms = 3000): Promise<T | "timeout"> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve("timeout"), ms);
    socket.once(event, (data: T) => {
      clearTimeout(t);
      resolve(data);
    });
  });
}

const update: EventUpdated = {
  eventId: "ev1",
  status: "OPEN",
  confirmedCount: 3,
  waitlistCount: 1,
  checkedInCount: 0,
  reason: "registration",
};

describe("realtime server", () => {
  it("relays event updates only to sockets in that event's room", async () => {
    const inRoom = await client();
    const other = await client();
    inRoom.emit("join.event", "ev1");
    other.emit("join.event", "ev2");
    await new Promise((r) => setTimeout(r, 100));

    const [got, notGot] = await Promise.all([
      waitFor<EventUpdated>(inRoom, "event.updated"),
      waitFor<EventUpdated>(other, "event.updated", 800),
      publisher.publish({ room: rooms.event("ev1"), event: "event.updated", data: update }),
    ]);
    expect(got).toEqual(update);
    expect(notGot).toBe("timeout");
    inRoom.close();
    other.close();
  });

  it("only lets sockets join overlay rooms for keys that exist", async () => {
    const good = await client();
    const bad = await client();
    good.emit("join.overlay", "known-key");
    bad.emit("join.overlay", "unknown-key");
    await new Promise((r) => setTimeout(r, 150));

    const state: OverlayState = {
      eventId: "ev1",
      title: "T",
      status: "LIVE",
      teamSize: 2,
      pool: ["a", "b"],
      round: null,
      spin: null,
    };
    const [got, notGot] = await Promise.all([
      waitFor<OverlayState>(good, "overlay.state"),
      waitFor<OverlayState>(bad, "overlay.state", 800),
      publisher.publish({ room: rooms.overlay("known-key"), event: "overlay.state", data: state }),
      publisher.publish({
        room: rooms.overlay("unknown-key"),
        event: "overlay.state",
        data: state,
      }),
    ]);
    expect(got).toEqual(state);
    expect(notGot).toBe("timeout");
    good.close();
    bad.close();
  });

  it("answers health checks", async () => {
    const res = await fetch(`${url}/healthz`);
    expect(res.status).toBe(200);
  });

  it("relays leaderboard updates to sockets that joined the leaderboards room", async () => {
    const watching = await client();
    const elsewhere = await client();
    watching.emit("join.leaderboards");
    elsewhere.emit("join.event", "ev1");
    await new Promise((r) => setTimeout(r, 100));
    const data = { period: "MONTH", periodKey: "2026-10" };
    const [got, notGot] = await Promise.all([
      waitFor(watching, "leaderboard.updated"),
      waitFor(elsewhere, "leaderboard.updated", 800),
      publisher.publish({ room: rooms.leaderboards(), event: "leaderboard.updated", data }),
    ]);
    expect(got).toEqual(data);
    expect(notGot).toBe("timeout");
    watching.close();
    elsewhere.close();
  });
});

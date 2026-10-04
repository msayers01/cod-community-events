"use client";
import { io, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "@cod/realtime";

export type RealtimeSocket = Socket<ServerEvents, ClientEvents>;

let socket: RealtimeSocket | null = null;

/** Lazily created, shared connection to the real-time server. Null when no URL is configured. */
export function getRealtimeSocket(): RealtimeSocket | null {
  const url = process.env.NEXT_PUBLIC_REALTIME_URL;
  if (!url) return null;
  if (!socket) {
    socket = io(url, {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionDelayMax: 10_000,
    });
  }
  return socket;
}

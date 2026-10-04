"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import type { EventUpdated } from "@cod/realtime";

/**
 * Keeps a server-rendered event page fresh. Joins the event's room and
 * re-renders the page from the server whenever the event changes. Falls back
 * to a slow poll when the real-time server is unreachable.
 */
export function LiveEvent({
  eventId,
  fallbackMs = 15_000,
}: {
  eventId: string;
  fallbackMs?: number;
}) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const socket = getRealtimeSocket();
    let poll: ReturnType<typeof setInterval> | null = null;

    const startPoll = () => {
      if (!poll) poll = setInterval(() => router.refresh(), fallbackMs);
    };
    const stopPoll = () => {
      if (poll) clearInterval(poll);
      poll = null;
    };

    if (!socket) {
      startPoll();
      return stopPoll;
    }

    const join = () => socket.emit("join.event", eventId);
    const onConnect = () => {
      setConnected(true);
      stopPoll();
      join();
      router.refresh(); // catch up on anything missed while disconnected
    };
    const onDisconnect = () => {
      setConnected(false);
      startPoll();
    };
    const onUpdate = (u: EventUpdated) => {
      if (u.eventId === eventId) router.refresh();
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("event.updated", onUpdate);
    if (socket.connected) onConnect();
    else startPoll();

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("event.updated", onUpdate);
      stopPoll();
    };
  }, [eventId, fallbackMs, router]);

  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted"
      title={
        connected ? "Live updates connected" : "Live updates unavailable, refreshing periodically"
      }
    >
      <span className={`inline-block h-2 w-2 rounded-full ${connected ? "bg-ok" : "bg-muted"}`} />
      {connected ? "live" : "polling"}
    </span>
  );
}

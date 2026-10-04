"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getRealtimeSocket } from "@/lib/realtime-client";
import type { LeaderboardUpdated } from "@cod/realtime";

/**
 * Re-reads the (pre-calculated) board when the worker says it was recalculated.
 * Refreshes are debounced so a burst of verified matches causes one re-render.
 */
export function LiveLeaderboard({ period, periodKey }: { period: string; periodKey: string }) {
  const router = useRouter();
  useEffect(() => {
    const socket = getRealtimeSocket();
    if (!socket) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const join = () => socket.emit("join.leaderboards");
    const onUpdate = (u: LeaderboardUpdated) => {
      if (u.period !== period || u.periodKey !== periodKey) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 1500);
    };
    socket.on("connect", join);
    socket.on("leaderboard.updated", onUpdate);
    if (socket.connected) join();
    return () => {
      if (timer) clearTimeout(timer);
      socket.off("connect", join);
      socket.off("leaderboard.updated", onUpdate);
    };
  }, [period, periodKey, router]);
  return null;
}

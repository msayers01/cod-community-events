/** Pure countdown formatting, so the rules are testable without a browser. */

export type LifecycleBadge =
  | { kind: "countdown"; ms: number }
  | { kind: "due" } // start time reached but the host hasn't gone live yet
  | { kind: "started" }
  | { kind: "ended" }
  | { kind: "cancelled" };

/** What to show for an event given its status and how long until its start time. */
export function badgeFor(status: string, startsAtMs: number, nowMs: number): LifecycleBadge {
  if (status === "CANCELLED") return { kind: "cancelled" };
  if (status === "LIVE" || status === "PAUSED") return { kind: "started" };
  if (status === "COMPLETED" || status === "ARCHIVED") return { kind: "ended" };
  const ms = startsAtMs - nowMs;
  return ms > 0 ? { kind: "countdown", ms } : { kind: "due" };
}

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * "3d 04h 12m" while it's days away, "04:12:09" inside the last day, "12:09" inside the last
 * hour. Rounds up so the clock never shows 00:00 before the start time.
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(totalSeconds / 86_400);
  const h = Math.floor((totalSeconds % 86_400) / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (d > 0) return `${d}d ${pad(h)}h ${pad(m)}m`;
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`;
  return `${pad(m)}:${pad(s)}`;
}

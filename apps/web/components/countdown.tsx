"use client";
import { useSyncExternalStore } from "react";
import { badgeFor, formatCountdown } from "@/lib/countdown";

// One shared 1s clock for every countdown on the page.
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!timer) {
    timer = setInterval(() => {
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
const snapshot = () => Math.floor(Date.now() / 1000) * 1000;
const serverSnapshot = () => 0;

/**
 * Live countdown to an event's start, or an indicator once it has started, ended or been
 * cancelled. Renders a stable placeholder on the server and during hydration, then ticks.
 */
export function Countdown({
  startsAt,
  status,
  className = "",
}: {
  startsAt: Date | string;
  status: string;
  className?: string;
}) {
  const t = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const startMs = new Date(startsAt).getTime();
  // Statuses that don't depend on the clock can render before hydration too.
  const b = badgeFor(status, startMs, t || startMs);

  if (b.kind === "cancelled")
    return <span className={`font-medium text-warn ${className}`}>Cancelled</span>;
  if (b.kind === "started")
    return (
      <span className={`inline-flex items-center gap-1.5 font-medium text-ok ${className}`}>
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-ok" />
        {status === "PAUSED" ? "Started · paused" : "Started"}
      </span>
    );
  if (b.kind === "ended") return <span className={`text-muted ${className}`}>Ended</span>;
  if (t === 0)
    return (
      <span className={`text-muted ${className}`} aria-hidden>
        &nbsp;
      </span>
    );
  if (b.kind === "due")
    return (
      <span className={`text-accent ${className}`}>Start time reached · waiting for the host</span>
    );
  return (
    <span className={className} role="timer" aria-label={`Starts in ${formatCountdown(b.ms)}`}>
      <span className="text-muted">Starts in </span>
      <span className="font-mono font-medium tabular-nums text-accent">
        {formatCountdown(b.ms)}
      </span>
    </span>
  );
}

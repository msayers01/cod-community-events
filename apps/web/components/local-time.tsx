"use client";
import { useClientValue } from "@/lib/use-client-value";

/** Renders a UTC timestamp in the viewer's timezone; the server renders UTC to avoid hydration mismatch. */
export function LocalTime({ date, withZone = true }: { date: Date | string; withZone?: boolean }) {
  const iso = typeof date === "string" ? new Date(date).toISOString() : date.toISOString();
  const text = useClientValue(
    () =>
      new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: withZone ? "short" : undefined,
      }).format(new Date(iso)),
    iso.replace("T", " ").slice(0, 16) + " UTC",
  );
  return <time dateTime={iso}>{text}</time>;
}

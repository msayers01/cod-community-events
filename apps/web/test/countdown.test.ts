import { describe, expect, it } from "vitest";
import { badgeFor, formatCountdown } from "@/lib/countdown";

const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("countdown formatting", () => {
  it("counts days, then hours, then minutes", () => {
    expect(formatCountdown(3 * DAY + 4 * HOUR + 12 * MIN + 5 * SEC)).toBe("3d 04h 12m");
    expect(formatCountdown(4 * HOUR + 12 * MIN + 9 * SEC)).toBe("04:12:09");
    expect(formatCountdown(12 * MIN + 9 * SEC)).toBe("12:09");
    expect(formatCountdown(9 * SEC)).toBe("00:09");
  });
  it("rounds up so it never shows zero before the start", () => {
    expect(formatCountdown(1)).toBe("00:01");
    expect(formatCountdown(59_001)).toBe("01:00");
    expect(formatCountdown(DAY)).toBe("1d 00h 00m");
    expect(formatCountdown(-5000)).toBe("00:00");
  });
});

describe("lifecycle badge", () => {
  const start = Date.parse("2030-01-01T20:00:00Z");
  it("counts down before the start time", () => {
    expect(badgeFor("OPEN", start, start - HOUR)).toEqual({ kind: "countdown", ms: HOUR });
    expect(badgeFor("CHECK_IN", start, start - 1)).toEqual({ kind: "countdown", ms: 1 });
    expect(badgeFor("DRAFT", start, start - HOUR).kind).toBe("countdown");
  });
  it("says the start time was reached when the host hasn't gone live", () => {
    expect(badgeFor("OPEN", start, start)).toEqual({ kind: "due" });
    expect(badgeFor("CHECK_IN", start, start + HOUR)).toEqual({ kind: "due" });
  });
  it("shows started for live and paused events, whatever the clock says", () => {
    expect(badgeFor("LIVE", start, start - HOUR)).toEqual({ kind: "started" });
    expect(badgeFor("PAUSED", start, start + HOUR)).toEqual({ kind: "started" });
  });
  it("shows cancelled and ended regardless of the clock", () => {
    expect(badgeFor("CANCELLED", start, start - DAY)).toEqual({ kind: "cancelled" });
    expect(badgeFor("COMPLETED", start, start + DAY)).toEqual({ kind: "ended" });
    expect(badgeFor("ARCHIVED", start, start + DAY)).toEqual({ kind: "ended" });
  });
});

import { describe, expect, it } from "vitest";
import { SWEEP_SCHEDULE } from "../src/jobs.js";

describe("worker schedule", () => {
  it("schedules every recurring sweep exactly once", () => {
    const kinds = SWEEP_SCHEDULE.map((s) => s.kind).sort();
    expect(kinds).toEqual([
      "sweep-blacklist-expiry",
      "sweep-check-in",
      "sweep-leaderboards",
      "sweep-payout-reminders",
      "sweep-screenshot-readings",
      "sweep-verification-windows",
    ]);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
  it("runs result verification often enough that the 24h window closes promptly", () => {
    const every = SWEEP_SCHEDULE.find((s) => s.kind === "sweep-verification-windows")!.every;
    expect(every).toBeLessThanOrEqual(5 * 60_000);
  });
});

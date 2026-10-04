import { describe, expect, it } from "vitest";
import { computeStandings, monthKey, monthWindow, POINTS } from "../src/leaderboards/standings.js";

const r = (userId: string, won: boolean, kills = 5, deaths = 5) => ({ userId, won, kills, deaths });

describe("standings", () => {
  it("scores wins above losses and ranks by points", () => {
    const s = computeStandings([
      ...[true, true, false].map((w) => r("a", w)), // 7
      ...[true, true, true].map((w) => r("b", w)), // 9
      ...[false, false, false].map((w) => r("c", w)), // 3
    ]);
    expect(s.map((x) => [x.userId, x.rank, x.points])).toEqual([
      ["b", 1, 3 * POINTS.win],
      ["a", 2, 2 * POINTS.win + POINTS.loss],
      ["c", 3, 3 * POINTS.loss],
    ]);
  });
  it("leaves out players with too few matches", () => {
    const s = computeStandings([r("a", true), r("a", true)]);
    expect(s).toEqual([]);
    expect(computeStandings([r("a", true), r("a", true)], 2)).toHaveLength(1);
  });
  it("breaks ties on wins, then K/D, deterministically", () => {
    const s = computeStandings([
      // x: 2W 0L... same points as y: 1W+3L = 6 ; use equal points differently
      r("x", true, 20, 5),
      r("x", false, 20, 5),
      r("x", false, 20, 5), // 5 pts, 1 win, kd high
      r("y", true, 5, 20),
      r("y", false, 5, 20),
      r("y", false, 5, 20), // 5 pts, 1 win, kd low
    ]);
    expect(s.map((x) => x.userId)).toEqual(["x", "y"]);
    expect(
      computeStandings([
        ...[1, 2, 3].map(() => r("m", true)),
        ...[1, 2, 3].map(() => r("n", true)),
      ]).map((x) => x.userId),
    ).toEqual(["m", "n"]);
  });
  it("month keys and windows round-trip in UTC", () => {
    expect(monthKey(new Date("2026-10-31T23:59:59Z"))).toBe("2026-10");
    const w = monthWindow("2026-12")!;
    expect(w.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(w.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(monthWindow("2026-13")).toBeNull();
    expect(monthWindow("all")).toBeNull();
  });
});

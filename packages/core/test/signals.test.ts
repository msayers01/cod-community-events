import { describe, expect, it } from "vitest";
import {
  baselineLossRate,
  binomialUpperTail,
  eventLossStreak,
  killShare,
  performanceDrop,
  teammateLossPattern,
} from "../src/throw-detection/signals.js";

const steady = Array.from({ length: 20 }, (_, i) => ({ kills: 9 + (i % 3), deaths: 6 + (i % 2) }));

describe("binomial tail", () => {
  it("matches known values", () => {
    expect(binomialUpperTail(10, 0, 0.5)).toBe(1);
    expect(binomialUpperTail(10, 11, 0.5)).toBe(0);
    expect(binomialUpperTail(10, 10, 0.5)).toBeCloseTo(1 / 1024, 8);
    expect(binomialUpperTail(4, 2, 0.5)).toBeCloseTo(11 / 16, 8);
    expect(binomialUpperTail(20, 15, 0.3)).toBeLessThan(0.001);
  });
});

describe("performance drop", () => {
  it("flags a collapse against the player's own baseline, only in a loss", () => {
    const awful = { kills: 0, deaths: 14 };
    const flag = performanceDrop({ history: steady, current: awful, teamLost: true });
    expect(flag).not.toBeNull();
    expect(flag!.z).toBeLessThan(-2.5);
    expect(flag!.observedShare).toBeLessThan(flag!.baselineShare);
    expect(performanceDrop({ history: steady, current: awful, teamLost: false })).toBeNull();
  });
  it("ignores an ordinary bad game", () => {
    expect(
      performanceDrop({ history: steady, current: { kills: 6, deaths: 8 }, teamLost: true }),
    ).toBeNull();
  });
  it("needs enough history", () => {
    expect(
      performanceDrop({
        history: steady.slice(0, 4),
        current: { kills: 0, deaths: 14 },
        teamLost: true,
      }),
    ).toBeNull();
  });
  it("does not blow up for a very consistent player", () => {
    const flat = Array.from({ length: 20 }, () => ({ kills: 10, deaths: 10 }));
    expect(
      performanceDrop({ history: flat, current: { kills: 9, deaths: 11 }, teamLost: true }),
    ).toBeNull();
    expect(killShare(10, 10)).toBeCloseTo(0.5, 5);
  });
});

describe("loss patterns", () => {
  const even = { matches: 30, losses: 15 };
  it("flags an unusually long losing run in one event", () => {
    const p = eventLossStreak({ matches: 8, losses: 8, prior: even });
    expect(p).not.toBeNull();
    expect(p!.probability).toBeLessThan(0.01);
  });
  it("does not flag a normal losing event or too few matches", () => {
    expect(eventLossStreak({ matches: 8, losses: 5, prior: even })).toBeNull();
    expect(eventLossStreak({ matches: 4, losses: 4, prior: even })).toBeNull();
  });
  it("a player who usually loses is held to their own, shrunk, baseline", () => {
    const loser = { matches: 100, losses: 90 };
    expect(baselineLossRate(loser.matches, loser.losses)).toBeLessThanOrEqual(0.7);
    expect(eventLossStreak({ matches: 8, losses: 7, prior: loser })).toBeNull();
  });
  it("flags losing every time with one teammate, with a stricter bar than events", () => {
    expect(teammateLossPattern({ matches: 8, losses: 8, prior: even })).not.toBeNull();
    expect(teammateLossPattern({ matches: 7, losses: 7, prior: even })).toBeNull();
    expect(teammateLossPattern({ matches: 5, losses: 4, prior: even })).toBeNull();
    expect(teammateLossPattern({ matches: 3, losses: 3, prior: even })).toBeNull();
  });
});

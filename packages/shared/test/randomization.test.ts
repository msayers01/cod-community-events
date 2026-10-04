import { describe, expect, it } from "vitest";
import {
  commit,
  deriveResult,
  hashPool,
  pairCounts,
  skillRating,
  verifySpin,
  DEFAULT_RATING,
  type SpinPool,
} from "../src/index.js";

const ids = Array.from({ length: 12 }, (_, i) => `p${String(i).padStart(2, "0")}`);
const secret = (n: number) => n.toString(16).padStart(64, "0");

describe("fully random pools are unchanged", () => {
  it("keeps the original pool hash shape so old commitments verify", () => {
    const a = hashPool({ playerIds: ["b", "a"], teamSize: 2 });
    const b = hashPool({ playerIds: ["a", "b"], teamSize: 2, mode: "RANDOM" });
    expect(a).toBe(b);
  });
});

describe("skill-balanced", () => {
  // p00 strongest ... p11 weakest
  const ratings = ids.map((id, i) => [id, 1400 - i * 50] as const);
  const pool: SpinPool = { playerIds: ids, teamSize: 3, mode: "SKILL_BALANCED", ratings };
  const rating = new Map(ratings);
  const sum = (team: readonly string[]) => team.reduce((a, id) => a + rating.get(id)!, 0);

  it("spreads strength: no team holds two of the top four", () => {
    for (let n = 0; n < 200; n++) {
      const r = deriveResult(secret(n), pool);
      expect(r.teams).toHaveLength(4);
      const top = new Set(["p00", "p01", "p02", "p03"]);
      for (const t of r.teams) expect(t.filter((p) => top.has(p)).length).toBe(1);
    }
  });
  it("is much tighter than random and still varies between spins", () => {
    const spread = (mode?: SpinPool["mode"]) => {
      let total = 0;
      const seen = new Set<string>();
      for (let n = 0; n < 200; n++) {
        const r = deriveResult(secret(n), { ...pool, mode: mode ?? "RANDOM" });
        const sums = r.teams.map(sum);
        total += Math.max(...sums) - Math.min(...sums);
        seen.add(JSON.stringify(r.teams.map((t) => [...t].sort()).sort()));
      }
      return { avg: total / 200, distinct: seen.size };
    };
    const balanced = spread("SKILL_BALANCED");
    const random = spread();
    expect(balanced.avg).toBeLessThan(random.avg * 0.6);
    expect(balanced.distinct).toBeGreaterThan(50);
  });
  it("treats unlisted players as average and is verifiable", () => {
    const c = commit(pool);
    const result = deriveResult(c.secret, pool);
    expect(
      verifySpin({ pool, commitment: c.commitment, revealedSecret: c.secret, result }),
    ).toEqual({ ok: true });
    // Tampering with a published rating breaks the commitment.
    const cooked: SpinPool = {
      ...pool,
      ratings: ratings.map(([id, r]) => [id, id === "p11" ? 9999 : r] as const),
    };
    expect(
      verifySpin({ pool: cooked, commitment: c.commitment, revealedSecret: c.secret, result }).ok,
    ).toBe(false);
    expect(hashPool(pool)).not.toBe(hashPool({ ...pool, mode: "RANDOM" }));
  });
  it("places everyone once and drops leftovers at random", () => {
    const odd: SpinPool = { ...pool, playerIds: ids.slice(0, 11) };
    const r = deriveResult(secret(7), odd);
    expect([...r.teams.flat(), ...r.leftovers].sort()).toEqual([...odd.playerIds].sort());
    expect(r.leftovers).toHaveLength(2);
  });
});

describe("no repeat teammates", () => {
  const prior = [
    ["p00", "p01", "p02"],
    ["p03", "p04", "p05"],
    ["p06", "p07", "p08"],
    ["p09", "p10", "p11"],
  ];
  const pool: SpinPool = {
    playerIds: ids,
    teamSize: 3,
    mode: "NO_REPEAT_TEAMMATES",
    teammateCounts: pairCounts(prior, ids),
  };
  const repeats = (teams: readonly (readonly string[])[], history: typeof prior) => {
    const together = new Set<string>();
    for (const t of history) for (const a of t) for (const b of t) if (a < b) together.add(a + b);
    let n = 0;
    for (const t of teams)
      for (const a of t) for (const b of t) if (a < b && together.has(a + b)) n++;
    return n;
  };
  it("avoids rematching previous teammates when it can", () => {
    let withMode = 0;
    let without = 0;
    for (let n = 0; n < 100; n++) {
      withMode += repeats(deriveResult(secret(n), pool).teams, prior);
      without += repeats(deriveResult(secret(n), { ...pool, mode: "RANDOM" }).teams, prior);
    }
    expect(withMode).toBe(0);
    expect(without).toBeGreaterThan(20);
  });
  it("accounts for pairs across several earlier rounds and is verifiable", () => {
    const second = [
      ["p00", "p03", "p06"],
      ["p01", "p04", "p09"],
      ["p02", "p07", "p10"],
      ["p05", "p08", "p11"],
    ];
    const p2: SpinPool = { ...pool, teammateCounts: pairCounts([...prior, ...second], ids) };
    const c = commit(p2);
    const result = deriveResult(c.secret, p2);
    expect(repeats(result.teams, [...prior, ...second])).toBe(0);
    expect(
      verifySpin({ pool: p2, commitment: c.commitment, revealedSecret: c.secret, result }),
    ).toEqual({ ok: true });
  });
  it("still places everyone when repeats are unavoidable", () => {
    const four: SpinPool = {
      playerIds: ["a", "b", "c", "d"],
      teamSize: 2,
      mode: "NO_REPEAT_TEAMMATES",
      teammateCounts: pairCounts(
        [
          ["a", "b"],
          ["c", "d"],
          ["a", "c"],
          ["b", "d"],
          ["a", "d"],
          ["b", "c"],
        ],
        ["a", "b", "c", "d"],
      ),
    };
    const r = deriveResult(secret(3), four);
    expect(r.teams.flat().sort()).toEqual(["a", "b", "c", "d"]);
  });
  it("pair counts only cover pool players", () => {
    expect(
      pairCounts(
        [
          ["a", "b", "z"],
          ["a", "b"],
        ],
        ["a", "b"],
      ),
    ).toEqual([["a", "b", 2]]);
  });
});

describe("skill rating", () => {
  it("is neutral without history and rewards a winning, high-K/D record", () => {
    expect(skillRating(null)).toBe(DEFAULT_RATING);
    expect(skillRating({ verifiedMatches: 0, verifiedWins: 0, kills: 0, deaths: 0 })).toBe(
      DEFAULT_RATING,
    );
    const strong = skillRating({ verifiedMatches: 40, verifiedWins: 32, kills: 600, deaths: 300 });
    const weak = skillRating({ verifiedMatches: 40, verifiedWins: 8, kills: 250, deaths: 500 });
    expect(strong).toBeGreaterThan(DEFAULT_RATING + 200);
    expect(weak).toBeLessThan(DEFAULT_RATING - 200);
  });
  it("barely moves on a tiny sample", () => {
    const lucky = skillRating({ verifiedMatches: 2, verifiedWins: 2, kills: 20, deaths: 4 });
    expect(Math.abs(lucky - DEFAULT_RATING)).toBeLessThan(150);
  });
});

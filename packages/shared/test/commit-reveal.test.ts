import { describe, expect, it } from "vitest";
import { commit, deriveResult, verifySpin, hashPool } from "../src/index.js";

const pool = { playerIds: ["p3", "p1", "p8", "p2", "p5", "p4", "p7", "p6"], teamSize: 4 };

describe("commit-reveal spins", () => {
  it("pool hash is order-independent", () => {
    expect(hashPool(pool)).toBe(hashPool({ ...pool, playerIds: [...pool.playerIds].reverse() }));
  });
  it("is deterministic for a given secret", () => {
    const c = commit(pool, "ab".repeat(32));
    expect(deriveResult(c.secret, pool)).toEqual(deriveResult(c.secret, pool));
  });
  it("different secrets give different results", () => {
    const a = deriveResult("00".repeat(32), pool);
    const b = deriveResult("ff".repeat(32), pool);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
  it("places every player exactly once", () => {
    const r = deriveResult("12".repeat(32), pool);
    const all = [...r.teams.flat(), ...r.leftovers].sort();
    expect(all).toEqual([...pool.playerIds].sort());
    expect(r.teams).toHaveLength(2);
    expect(r.leftovers).toHaveLength(0);
  });
  it("handles pools not divisible by team size", () => {
    const r = deriveResult("12".repeat(32), { playerIds: ["a", "b", "c", "d", "e"], teamSize: 2 });
    expect(r.teams).toHaveLength(2);
    expect(r.leftovers).toHaveLength(1);
  });
  it("verifies an honest spin and rejects a tampered one", () => {
    const c = commit(pool);
    const result = deriveResult(c.secret, pool);
    expect(
      verifySpin({ pool, commitment: c.commitment, revealedSecret: c.secret, result }),
    ).toEqual({ ok: true });

    const tampered = { ...result, teams: [result.teams[1]!, result.teams[0]!] };
    expect(
      verifySpin({ pool, commitment: c.commitment, revealedSecret: c.secret, result: tampered }).ok,
    ).toBe(false);

    const wrongSecret = "99".repeat(32);
    expect(
      verifySpin({ pool, commitment: c.commitment, revealedSecret: wrongSecret, result }).ok,
    ).toBe(false);
  });
  it("is roughly uniform over many spins", () => {
    const small = { playerIds: ["a", "b", "c", "d"], teamSize: 2 };
    const counts = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const r = deriveResult(i.toString(16).padStart(64, "0"), small);
      const key = r.teams
        .map((t) => [...t].sort().join(""))
        .sort()
        .join("|");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    // 3 possible pairings of 4 players into 2 teams; each should be ~1000
    expect(counts.size).toBe(3);
    for (const n of counts.values()) expect(n).toBeGreaterThan(850);
  });
});

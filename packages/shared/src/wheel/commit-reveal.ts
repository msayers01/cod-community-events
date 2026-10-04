import { createHash, randomBytes } from "node:crypto";

/**
 * Provably fair spins.
 *
 * 1. Server generates `secret` and publishes commitment = sha256(secret || poolHash).
 * 2. Hoster triggers the spin; server derives the shuffle deterministically from the secret.
 * 3. Server reveals the secret; anyone can recompute the commitment and the result.
 *
 * All functions here are pure and run identically on server and in a verifier.
 */

export interface SpinPool {
  /** Player ids in the pool, sorted canonically by the caller before committing. */
  readonly playerIds: readonly string[];
  readonly teamSize: number;
}

export interface SpinCommitment {
  readonly secret: string; // hex, kept private until reveal
  readonly commitment: string; // hex sha256
  readonly poolHash: string; // hex sha256 of canonical pool
}

export interface SpinResult {
  /** Teams in label order; each is an array of player ids. */
  readonly teams: readonly (readonly string[])[];
  /** Players who did not fit into a full team (pool not divisible by team size). */
  readonly leftovers: readonly string[];
}

export function canonicalPool(pool: SpinPool): SpinPool {
  return { playerIds: [...pool.playerIds].sort(), teamSize: pool.teamSize };
}

export function hashPool(pool: SpinPool): string {
  const c = canonicalPool(pool);
  return sha256(JSON.stringify({ playerIds: c.playerIds, teamSize: c.teamSize }));
}

export function computeCommitment(secretHex: string, poolHash: string): string {
  return sha256(`${secretHex}:${poolHash}`);
}

export function commit(
  pool: SpinPool,
  secretHex = randomBytes(32).toString("hex"),
): SpinCommitment {
  const poolHash = hashPool(pool);
  return { secret: secretHex, poolHash, commitment: computeCommitment(secretHex, poolHash) };
}

/**
 * Deterministic Fisher-Yates driven by a SHA-256 counter stream seeded with the secret
 * and pool hash. Uses rejection sampling to avoid modulo bias.
 */
export function deriveResult(secretHex: string, pool: SpinPool): SpinResult {
  const { playerIds, teamSize } = canonicalPool(pool);
  if (teamSize < 1) throw new Error("teamSize must be >= 1");
  const rng = createRng(`${secretHex}:${hashPool(pool)}`);
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const teamCount = Math.floor(order.length / teamSize);
  const teams: string[][] = [];
  for (let t = 0; t < teamCount; t++) teams.push(order.slice(t * teamSize, (t + 1) * teamSize));
  return { teams, leftovers: order.slice(teamCount * teamSize) };
}

export interface VerifyInput {
  readonly pool: SpinPool;
  readonly commitment: string;
  readonly revealedSecret: string;
  readonly result: SpinResult;
}

export function verifySpin(input: VerifyInput): { ok: true } | { ok: false; reason: string } {
  const poolHash = hashPool(input.pool);
  if (computeCommitment(input.revealedSecret, poolHash) !== input.commitment) {
    return { ok: false, reason: "Revealed secret does not match the published commitment" };
  }
  const expected = deriveResult(input.revealedSecret, input.pool);
  if (JSON.stringify(expected) !== JSON.stringify(input.result)) {
    return {
      ok: false,
      reason: "Recorded result does not match the result derived from the secret",
    };
  }
  return { ok: true };
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function createRng(seed: string) {
  let counter = 0;
  let buffer = Buffer.alloc(0);
  let offset = 0;
  const refill = () => {
    buffer = createHash("sha256").update(`${seed}:${counter++}`).digest();
    offset = 0;
  };
  const next32 = (): number => {
    if (offset + 4 > buffer.length) refill();
    const v = buffer.readUInt32BE(offset);
    offset += 4;
    return v;
  };
  return {
    /** Uniform integer in [0, n) without modulo bias. */
    below(n: number): number {
      if (n <= 0) throw new Error("n must be > 0");
      const limit = Math.floor(0x1_0000_0000 / n) * n;
      let v = next32();
      while (v >= limit) v = next32();
      return v % n;
    },
  };
}

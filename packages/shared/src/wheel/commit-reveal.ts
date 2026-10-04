import { createHash, randomBytes } from "node:crypto";
import type { RandomizationMode } from "../enums.js";

/**
 * Provably fair spins.
 *
 * 1. Server generates `secret` and publishes commitment = sha256(secret || poolHash).
 * 2. Hoster triggers the spin; server derives the shuffle deterministically from the secret.
 * 3. Server reveals the secret; anyone can recompute the commitment and the result.
 *
 * All functions here are pure and run identically on server and in a verifier.
 */

/** Rating assumed for a player with no verified history. */
export const DEFAULT_RATING = 1000;

export interface SpinPool {
  /** Player ids in the pool, sorted canonically by the caller before committing. */
  readonly playerIds: readonly string[];
  readonly teamSize: number;
  /**
   * How teams are formed. Absent means fully random. Everything a mode needs to form
   * teams is snapshotted below and covered by the pool hash, so the commitment locks
   * in the inputs and anyone can re-derive the result from the published pool.
   */
  readonly mode?: RandomizationMode;
  /** SKILL_BALANCED: [playerId, rating] pairs. Players not listed use DEFAULT_RATING. */
  readonly ratings?: readonly (readonly [string, number])[];
  /** NO_REPEAT_TEAMMATES: [playerIdA, playerIdB, timesTeamed] with A < B. */
  readonly teammateCounts?: readonly (readonly [string, string, number])[];
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
  const playerIds = [...pool.playerIds].sort();
  // Fully random pools keep the original shape so existing commitments still verify.
  if (!pool.mode || pool.mode === "RANDOM") return { playerIds, teamSize: pool.teamSize };
  const base = { playerIds, teamSize: pool.teamSize, mode: pool.mode };
  if (pool.mode === "SKILL_BALANCED")
    return {
      ...base,
      ratings: (pool.ratings ?? [])
        .map(([id, r]) => [id, r] as const)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    };
  return {
    ...base,
    teammateCounts: (pool.teammateCounts ?? [])
      .map(([a, b, n]) => (a < b ? ([a, b, n] as const) : ([b, a, n] as const)))
      .sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : x[0] + x[1] > y[0] + y[1] ? 1 : 0)),
  };
}

export function hashPool(pool: SpinPool): string {
  return sha256(JSON.stringify(canonicalPool(pool)));
}

/** How many times each pair of players has already been teammates, for the pool's players. */
export function pairCounts(
  priorTeams: readonly (readonly string[])[],
  poolPlayerIds: readonly string[],
): [string, string, number][] {
  const inPool = new Set(poolPlayerIds);
  const counts = new Map<string, number>();
  for (const team of priorTeams) {
    const members = team.filter((id) => inPool.has(id)).sort();
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        const key = `${members[i]}\u0000${members[j]}`;
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
  }
  return [...counts.entries()]
    .map(([k, n]) => {
      const [a, b] = k.split("\u0000") as [string, string];
      return [a, b, n] as [string, string, number];
    })
    .sort((x, y) => (x[0] + x[1] < y[0] + y[1] ? -1 : 1));
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
 * Deterministic team formation driven by a SHA-256 counter stream seeded with the secret
 * and pool hash. Uses rejection sampling to avoid modulo bias. The base step is always a
 * uniform Fisher-Yates shuffle; the optional modes only rearrange that shuffle using data
 * from the committed pool, so no mode lets anyone choose who plays with whom.
 */
export function deriveResult(secretHex: string, pool: SpinPool): SpinResult {
  const canon = canonicalPool(pool);
  const { playerIds, teamSize } = canon;
  if (teamSize < 1) throw new Error("teamSize must be >= 1");
  const rng = createRng(`${secretHex}:${hashPool(pool)}`);
  const order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.below(i + 1);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  const teamCount = Math.floor(order.length / teamSize);
  const leftovers = order.slice(teamCount * teamSize);
  const kept = order.slice(0, teamCount * teamSize);

  let teams: string[][];
  if (canon.mode === "SKILL_BALANCED")
    teams = balanceBySkill(kept, teamCount, teamSize, canon, rng);
  else if (canon.mode === "NO_REPEAT_TEAMMATES")
    teams = avoidRepeats(kept, teamCount, teamSize, canon, rng);
  else {
    teams = [];
    for (let t = 0; t < teamCount; t++) teams.push(kept.slice(t * teamSize, (t + 1) * teamSize));
  }
  return { teams, leftovers };
}

type Rng = ReturnType<typeof createRng>;

/**
 * Rank the (already shuffled) players by rating, cut the ranking into tiers of one
 * player per team, and shuffle each tier across the teams. Every team gets one player
 * from each tier, so strength is spread evenly while who lands where stays random.
 * The shuffle order breaks rating ties, so equal ratings are not favoured by id.
 */
function balanceBySkill(
  shuffled: string[],
  teamCount: number,
  teamSize: number,
  pool: SpinPool,
  rng: Rng,
): string[][] {
  const rating = new Map(pool.ratings ?? []);
  const rank = new Map(shuffled.map((id, i) => [id, i]));
  const ranked = [...shuffled].sort(
    (a, b) =>
      (rating.get(b) ?? DEFAULT_RATING) - (rating.get(a) ?? DEFAULT_RATING) ||
      rank.get(a)! - rank.get(b)!,
  );
  const teams: string[][] = Array.from({ length: teamCount }, () => []);
  for (let tier = 0; tier < teamSize; tier++) {
    const members = ranked.slice(tier * teamCount, (tier + 1) * teamCount);
    for (let i = members.length - 1; i > 0; i--) {
      const j = rng.below(i + 1);
      [members[i], members[j]] = [members[j]!, members[i]!];
    }
    members.forEach((id, t) => teams[t]!.push(id));
  }
  return teams;
}

const SWAP_ATTEMPTS_PER_PLAYER = 60;

/**
 * Start from the random shuffle and swap players between teams (random pairs, chosen by
 * the seeded stream) whenever that does not increase how often teammates have already
 * played together. Stops early at zero repeats. Best effort: with a small pool and many
 * rounds repeats can be unavoidable.
 */
function avoidRepeats(
  shuffled: string[],
  teamCount: number,
  teamSize: number,
  pool: SpinPool,
  rng: Rng,
): string[][] {
  const teams: string[][] = [];
  for (let t = 0; t < teamCount; t++) teams.push(shuffled.slice(t * teamSize, (t + 1) * teamSize));
  if (teamCount < 2) return teams;

  const together = new Map<string, number>();
  for (const [a, b, n] of pool.teammateCounts ?? []) together.set(`${a}\u0000${b}`, n);
  const times = (a: string, b: string) =>
    together.get(a < b ? `${a}\u0000${b}` : `${b}\u0000${a}`) ?? 0;
  const against = (p: string, team: readonly string[], skip: string) =>
    team.reduce((sum, q) => (q === skip ? sum : sum + times(p, q)), 0);

  let cost = 0;
  for (const team of teams)
    for (let i = 0; i < team.length; i++)
      for (let j = i + 1; j < team.length; j++) cost += times(team[i]!, team[j]!);

  const attempts = shuffled.length * SWAP_ATTEMPTS_PER_PLAYER;
  for (let n = 0; n < attempts && cost > 0; n++) {
    const ta = rng.below(teamCount);
    let tb = rng.below(teamCount - 1);
    if (tb >= ta) tb++;
    const ia = rng.below(teamSize);
    const ib = rng.below(teamSize);
    const a = teams[ta]![ia]!;
    const b = teams[tb]![ib]!;
    const before = against(a, teams[ta]!, a) + against(b, teams[tb]!, b);
    const after = against(a, teams[tb]!, b) + against(b, teams[ta]!, a);
    if (after <= before) {
      teams[ta]![ia] = b;
      teams[tb]![ib] = a;
      cost += after - before;
    }
  }
  return teams;
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

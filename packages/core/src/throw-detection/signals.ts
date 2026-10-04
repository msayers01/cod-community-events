import { THRESHOLDS as T } from "./thresholds.js";

/** Share of a player's engagements that were kills; comparable across modes and match lengths. */
export function killShare(kills: number, deaths: number): number {
  return (kills + 1) / (kills + deaths + 2);
}

export function meanAndSpread(values: readonly number[]): { mean: number; sd: number } {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, values.length - 1);
  return { mean, sd: Math.sqrt(variance) };
}

/** P(X >= k) for X ~ Binomial(n, p). */
export function binomialUpperTail(n: number, k: number, p: number): number {
  if (k <= 0) return 1;
  if (k > n) return 0;
  if (p <= 0) return 0;
  if (p >= 1) return 1;
  let logChoose = 0; // log C(n, 0)
  const logP = Math.log(p);
  const logQ = Math.log(1 - p);
  let tail = 0;
  for (let i = 0; i <= n; i++) {
    if (i > 0) logChoose += Math.log((n - i + 1) / i);
    if (i >= k) tail += Math.exp(logChoose + i * logP + (n - i) * logQ);
  }
  return Math.min(1, tail);
}

/** A player's own loss rate, shrunk towards a coin flip so small samples don't mislead. */
export function baselineLossRate(matches: number, losses: number): number {
  const rate = (losses + T.priorStrength / 2) / (matches + T.priorStrength);
  return Math.min(T.maxLossRate, Math.max(T.minLossRate, rate));
}

export interface PerformanceDrop {
  z: number;
  baselineShare: number;
  observedShare: number;
  baselineMatches: number;
  /** Larger is stranger; used only to order the review queue. */
  score: number;
}

/** Played far below their own norm in a match their team lost. */
export function performanceDrop(input: {
  history: readonly { kills: number; deaths: number }[];
  current: { kills: number; deaths: number };
  teamLost: boolean;
}): PerformanceDrop | null {
  if (!input.teamLost) return null;
  const history = input.history.slice(0, T.baselineWindow);
  if (history.length < T.baselineMatches) return null;
  const { mean, sd } = meanAndSpread(history.map((h) => killShare(h.kills, h.deaths)));
  const observed = killShare(input.current.kills, input.current.deaths);
  const z = (observed - mean) / Math.max(sd, T.minSpread);
  if (z > T.performanceZ) return null;
  return {
    z,
    baselineShare: mean,
    observedShare: observed,
    baselineMatches: history.length,
    score: -z,
  };
}

export interface LossPattern {
  matches: number;
  losses: number;
  expectedLossRate: number;
  /** Chance of at least this many losses if the player loses at their usual rate. */
  probability: number;
  score: number;
}

function lossPattern(
  matches: number,
  losses: number,
  prior: { matches: number; losses: number },
  tail: number,
): LossPattern | null {
  const expectedLossRate = baselineLossRate(prior.matches, prior.losses);
  const probability = binomialUpperTail(matches, losses, expectedLossRate);
  if (probability > tail) return null;
  return {
    matches,
    losses,
    expectedLossRate,
    probability,
    score: -Math.log10(Math.max(probability, 1e-12)),
  };
}

/** Losing far more than usual within a single event. `prior` excludes this event. */
export function eventLossStreak(input: {
  matches: number;
  losses: number;
  prior: { matches: number; losses: number };
}): LossPattern | null {
  if (input.matches < T.eventMatches) return null;
  return lossPattern(input.matches, input.losses, input.prior, T.eventLossTail);
}

/** Losing far more than usual whenever paired with one specific teammate. */
export function teammateLossPattern(input: {
  matches: number;
  losses: number;
  prior: { matches: number; losses: number };
}): LossPattern | null {
  if (input.matches < T.pairMatches) return null;
  return lossPattern(input.matches, input.losses, input.prior, T.pairLossTail);
}

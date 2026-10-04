/**
 * Detection criteria. Deliberately NOT exported from the package index and never
 * surfaced in any API or UI: if throwers learn the thresholds they learn to stay just
 * under them. Staff see what was observed, not where the line is.
 *
 * These are conservative on purpose. A flag only asks a moderator to take a look, and
 * SnD is high-variance, so we would rather miss a thrower than flag an unlucky player.
 */
export const THRESHOLDS = {
  /** Prior verified matches in the same mode needed before a baseline means anything. */
  baselineMatches: 10,
  /** Prior matches considered for the baseline. */
  baselineWindow: 40,
  /** Standard deviations below the player's own baseline, on a losing team. */
  performanceZ: -2.5,
  /** Floor for the baseline spread so a very consistent player doesn't make z explode. */
  minSpread: 0.07,

  /** Verified matches in one event before a loss streak is assessed. */
  eventMatches: 6,
  /** Chance of this many losses or more, given the player's own loss rate, below which we flag. */
  eventLossTail: 0.01,

  /** Verified matches together before a pairing is assessed. */
  pairMatches: 5,
  pairLossTail: 0.005,

  /** Loss-rate baseline is shrunk towards 50% with this many pseudo-matches and clamped. */
  priorStrength: 10,
  minLossRate: 0.3,
  maxLossRate: 0.7,
} as const;

import { DEFAULT_RATING } from "./commit-reveal.js";

export interface SkillInput {
  verifiedMatches: number;
  verifiedWins: number;
  kills: number;
  deaths: number;
}

/**
 * Skill rating used only to balance teams when a hoster opts into skill-balanced
 * shuffling. A player with no verified history gets DEFAULT_RATING; the priors pull
 * small samples towards it so two lucky matches don't make anyone a star.
 *
 *   win part:  (wins + 5) / (matches + 10), centred on 0.5
 *   K/D part:  log2((kills + 40) / (deaths + 40)), clamped to [-1, 1]
 */
export function skillRating(s: SkillInput | null | undefined): number {
  if (!s || s.verifiedMatches <= 0) return DEFAULT_RATING;
  const winPart = (s.verifiedWins + 5) / (s.verifiedMatches + 10) - 0.5;
  const kdPart = Math.max(-1, Math.min(1, Math.log2((s.kills + 40) / (s.deaths + 40))));
  return Math.round(DEFAULT_RATING + 600 * winPart + 200 * kdPart);
}

import { z } from "zod";

const scale = z.number().int().min(1).max(5);

export const teammateRatingSchema = z.object({
  matchId: z.string().min(1),
  ratedId: z.string().min(1),
  wouldPlayAgain: z.boolean(),
  communication: scale,
  effort: scale,
});

export const hosterReviewSchema = z.object({
  eventId: z.string().min(1),
  organization: scale,
  communication: scale,
  fairness: scale,
  comment: z.string().trim().max(1000).optional(),
});

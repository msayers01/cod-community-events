import { z } from "zod";

const stat = z.number().int().min(0).max(500);

export const playerStatSchema = z.object({
  playerId: z.string().min(1),
  kills: stat,
  deaths: stat,
  plants: stat.optional(),
  defuses: stat.optional(),
  hillTimeSeconds: z.number().int().min(0).max(36_000).optional(),
});
export type PlayerStatInput = z.infer<typeof playerStatSchema>;

export const submitResultSchema = z
  .object({
    matchId: z.string().min(1),
    screenshotUrl: z.url().optional(),
    screenshotKey: z.string().min(1).max(300).optional(),
    scoreA: z.number().int().min(0).max(999),
    scoreB: z.number().int().min(0).max(999),
    stats: z.array(playerStatSchema).max(12).default([]),
  })
  .refine((s) => s.screenshotUrl || s.screenshotKey, "A scoreboard screenshot is required")
  .refine((s) => s.scoreA !== s.scoreB, "A match cannot end in a draw");
export type SubmitResultInput = z.infer<typeof submitResultSchema>;

export const confirmResultSchema = z
  .object({
    submissionId: z.string().min(1),
    response: z.enum(["CONFIRM", "DISPUTE"]),
    disputeReason: z.string().trim().min(5).max(1000).optional(),
    correctedValues: z
      .object({
        scoreA: z.number().int().min(0).max(999).optional(),
        scoreB: z.number().int().min(0).max(999).optional(),
        stats: z.array(playerStatSchema).optional(),
      })
      .optional(),
  })
  .refine((c) => c.response !== "DISPUTE" || c.disputeReason, "Disputes need a short reason");

export const resolveDisputeSchema = z.object({
  submissionId: z.string().min(1),
  outcome: z.enum(["VERIFIED", "REJECTED"]),
  reason: z.string().trim().min(10).max(2000),
});

export const createMatchesSchema = z.object({
  roundId: z.string().min(1),
  pairings: z
    .array(
      z.object({
        teamAId: z.string().min(1),
        teamBId: z.string().min(1),
        maps: z.array(z.string().trim().min(1).max(60)).max(5).default([]),
      }),
    )
    .min(1)
    .max(64),
});

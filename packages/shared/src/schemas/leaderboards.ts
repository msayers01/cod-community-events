import { z } from "zod";
import { GameMode, LeaderboardPeriod } from "../enums.js";

export const createSeasonSchema = z
  .object({
    name: z.string().trim().min(3).max(60),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    reason: z.string().trim().min(10).max(1000),
  })
  .refine((s) => s.endsAt > s.startsAt, {
    path: ["endsAt"],
    message: "A season must end after it starts",
  })
  .refine((s) => s.endsAt.getTime() - s.startsAt.getTime() <= 400 * 86_400_000, {
    path: ["endsAt"],
    message: "Seasons can be at most about a year long",
  });
export type CreateSeasonInput = z.infer<typeof createSeasonSchema>;

export const leaderboardQuerySchema = z.object({
  period: z.enum(Object.values(LeaderboardPeriod) as [string, ...string[]]).default("MONTH"),
  /** "2026-10", a season id, or "all". Defaults depend on the period. */
  key: z.string().max(40).optional(),
  mode: z.enum(Object.values(GameMode) as [string, ...string[]]).default("SND"),
});

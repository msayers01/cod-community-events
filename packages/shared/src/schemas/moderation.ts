import { z } from "zod";
import { ReportCategory } from "../enums.js";

export const createReportSchema = z.object({
  reportedUserId: z.string().min(1),
  category: z.enum(Object.values(ReportCategory) as [ReportCategory, ...ReportCategory[]]),
  description: z.string().trim().min(20).max(4000),
  eventId: z.string().min(1).optional(),
  matchId: z.string().min(1).optional(),
  evidence: z
    .array(
      z.object({
        type: z.enum(["SCREENSHOT", "VOD", "PAYMENT_RECORD", "OTHER"]),
        url: z.url(),
        note: z.string().trim().max(500).default(""),
      }),
    )
    .min(1, "Reports need at least one piece of evidence")
    .max(10),
});

export const staffActionSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

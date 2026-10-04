import { z } from "zod";
import { ReportCategory } from "../enums.js";

export const evidenceItemSchema = z
  .object({
    type: z.enum(["SCREENSHOT", "VOD", "PAYMENT_RECORD", "OTHER"]),
    url: z.url().optional(),
    storageKey: z.string().min(1).max(300).optional(),
    note: z.string().trim().max(500).default(""),
  })
  .refine((e) => e.url || e.storageKey, "Evidence needs a link or an uploaded file");
export type EvidenceItem = z.infer<typeof evidenceItemSchema>;

export const createReportSchema = z.object({
  reportedUserId: z.string().min(1),
  category: z.enum(Object.values(ReportCategory) as [ReportCategory, ...ReportCategory[]]),
  description: z.string().trim().min(20).max(4000),
  eventId: z.string().min(1).optional(),
  matchId: z.string().min(1).optional(),
  evidence: evidenceItemSchema
    .array()
    .min(1, "Reports need at least one piece of evidence")
    .max(10),
});

export const accusedResponseSchema = z.object({
  reportId: z.string().min(1),
  statement: z.string().trim().min(10).max(4000),
  evidence: evidenceItemSchema.array().max(10).default([]),
});

export const sanctionSchema = z
  .object({
    userId: z.string().min(1),
    type: z.enum(["WARNING", "SUSPENSION", "PERMANENT_BAN"]),
    reason: z.string().trim().min(10).max(2000),
    days: z.number().int().min(1).max(365).optional(),
    reportId: z.string().min(1).optional(),
  })
  .refine((s) => s.type !== "SUSPENSION" || s.days, "Suspensions need a duration");

export const staffNoteSchema = z.object({
  userId: z.string().min(1),
  body: z.string().trim().min(3).max(2000),
});

export const recordWinnersSchema = z.object({
  eventId: z.string().min(1),
  winners: z
    .array(z.object({ place: z.number().int().min(1).max(10), userId: z.string().min(1) }))
    .min(1)
    .max(10)
    .refine(
      (w) => new Set(w.map((x) => x.userId)).size === w.length,
      "A player can only win one place",
    )
    .refine(
      (w) => new Set(w.map((x) => x.place)).size === w.length,
      "Each place can only be awarded once",
    ),
});

export const payoutResponseSchema = z.object({
  payoutConfirmationId: z.string().min(1),
  paid: z.boolean(),
  note: z.string().trim().max(500).optional(),
});

export const staffActionSchema = z.object({
  reason: z.string().trim().min(10).max(2000),
});

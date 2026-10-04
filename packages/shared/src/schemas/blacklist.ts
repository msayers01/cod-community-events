import { z } from "zod";
import { ReportCategory } from "../enums.js";
import { evidenceItemSchema } from "./moderation.js";

export const proposeBlacklistSchema = z.object({
  userId: z.string().min(1),
  category: z.enum(Object.values(ReportCategory) as [ReportCategory, ...ReportCategory[]]),
  publicWording: z.string().trim().min(20).max(400),
  reportId: z.string().min(1).optional(),
  /** Days until expiry; omit for no expiry (reserved for the most serious categories). */
  expiresInDays: z.number().int().min(1).max(3650).optional(),
  reason: z.string().trim().min(10).max(2000),
});

export const fileAppealSchema = z.object({
  target: z.enum(["BLACKLIST_ENTRY", "SANCTION", "DISPUTE_RULING"]),
  targetId: z.string().min(1),
  statement: z.string().trim().min(20).max(4000),
  evidence: evidenceItemSchema.array().max(10).default([]),
});

export const decideAppealSchema = z.object({
  appealId: z.string().min(1),
  decision: z.enum(["UPHELD", "OVERTURNED"]),
  reason: z.string().trim().min(10).max(2000),
});

/** Default expiry per category, in days. null = no expiry. */
export const BLACKLIST_DEFAULT_EXPIRY_DAYS: Record<ReportCategory, number | null> = {
  NON_PAYMENT: null,
  CHEATING: null,
  THROWING: 365,
  FALSIFIED_RESULTS: 365,
  HARASSMENT: 180,
  REPEATED_NO_SHOWS: 90,
};

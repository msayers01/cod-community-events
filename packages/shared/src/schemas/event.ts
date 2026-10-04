import { z } from "zod";
import { EntryType, EventFormat, GameMode, Platform, RandomizationMode, Region } from "../enums.js";

const enumValues = <T extends Record<string, string>>(e: T) =>
  Object.values(e) as [T[keyof T], ...T[keyof T][]];

export const eventRulesSchema = z.object({
  mapPool: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  bannedItems: z.array(z.string().trim().min(1).max(60)).max(50).default([]),
  streamingRequired: z.boolean().default(false),
  monicamOnRequest: z.boolean().default(true),
  notes: z.string().trim().max(4000).default(""),
});
export type EventRules = z.infer<typeof eventRulesSchema>;

export const payoutSplitSchema = z
  .array(z.object({ place: z.number().int().min(1), percent: z.number().min(0).max(100) }))
  .max(10)
  .refine((s) => s.reduce((a, b) => a + b.percent, 0) <= 100, "Payout split cannot exceed 100%");

export const entryRequirementsSchema = z.object({
  minCompletedEvents: z.number().int().min(0).max(1000).default(0),
  noOpenReports: z.boolean().default(true),
  requireLinkedDiscord: z.boolean().default(false),
});

export const createEventSchema = z
  .object({
    title: z.string().trim().min(3).max(120),
    description: z.string().trim().max(5000).default(""),
    mode: z.enum(enumValues(GameMode)),
    format: z.enum(enumValues(EventFormat)),
    teamSize: z.number().int().min(1).max(6),
    roundCount: z.number().int().min(1).max(20).nullable().default(null),
    playerCap: z.number().int().min(2).max(256),
    entryFeeCents: z.number().int().min(0).max(1_000_000).default(0),
    currency: z.string().length(3).toUpperCase().default("USD"),
    payoutSplit: payoutSplitSchema.default([{ place: 1, percent: 100 }]),
    region: z.enum(enumValues(Region)),
    platform: z.enum(enumValues(Platform)),
    rules: eventRulesSchema.prefault({}),
    entryType: z.enum(enumValues(EntryType)).default(EntryType.OPEN),
    entryRequirements: entryRequirementsSchema.nullable().default(null),
    randomization: z.enum(enumValues(RandomizationMode)).default(RandomizationMode.RANDOM),
    startsAt: z.coerce.date(),
    checkInOpensAt: z.coerce.date(),
    checkInClosesAt: z.coerce.date(),
  })
  .superRefine((e, ctx) => {
    if (e.format === EventFormat.SWITCHEROO && e.roundCount === null) {
      ctx.addIssue({
        code: "custom",
        path: ["roundCount"],
        message: "Switcheroos need a round count",
      });
    }
    if (e.playerCap % e.teamSize !== 0) {
      ctx.addIssue({
        code: "custom",
        path: ["playerCap"],
        message: "Player cap must be divisible by team size",
      });
    }
    if (!(e.checkInOpensAt < e.checkInClosesAt && e.checkInClosesAt <= e.startsAt)) {
      ctx.addIssue({
        code: "custom",
        path: ["checkInClosesAt"],
        message: "Check-in must open before it closes, and close at or before the start time",
      });
    }
    if (e.entryType === EntryType.REQUIREMENT_BASED && !e.entryRequirements) {
      ctx.addIssue({
        code: "custom",
        path: ["entryRequirements"],
        message: "Requirement-based events need requirements",
      });
    }
  });
export type CreateEventInput = z.infer<typeof createEventSchema>;

export const eventFilterSchema = z.object({
  mode: z.enum(enumValues(GameMode)).optional(),
  format: z.enum(enumValues(EventFormat)).optional(),
  region: z.enum(enumValues(Region)).optional(),
  platform: z.enum(enumValues(Platform)).optional(),
  startingSoon: z.coerce.boolean().optional(),
  hasSpots: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type EventFilter = z.infer<typeof eventFilterSchema>;

/** Reusable settings a hoster saves as a template: everything except title/description/times. */
export const eventTemplateSettingsSchema = z.object({
  mode: z.enum(enumValues(GameMode)),
  format: z.enum(enumValues(EventFormat)),
  teamSize: z.number().int().min(1).max(6),
  roundCount: z.number().int().min(1).max(20).nullable().default(null),
  playerCap: z.number().int().min(2).max(256),
  entryFeeCents: z.number().int().min(0).max(1_000_000).default(0),
  currency: z.string().length(3).toUpperCase().default("USD"),
  payoutSplit: payoutSplitSchema.default([{ place: 1, percent: 100 }]),
  region: z.enum(enumValues(Region)),
  platform: z.enum(enumValues(Platform)),
  rules: eventRulesSchema.prefault({}),
  entryType: z.enum(enumValues(EntryType)).default(EntryType.OPEN),
  entryRequirements: entryRequirementsSchema.nullable().default(null),
  randomization: z.enum(enumValues(RandomizationMode)).default(RandomizationMode.RANDOM),
  description: z.string().trim().max(5000).default(""),
});
export type EventTemplateSettings = z.infer<typeof eventTemplateSettingsSchema>;

export const saveTemplateSchema = z.object({
  eventId: z.string().min(1),
  name: z.string().trim().min(2).max(60),
});

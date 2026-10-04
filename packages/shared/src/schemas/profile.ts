import { z } from "zod";

export const activisionIdSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.\- ]{2,24}#\d{3,10}$/, "Use the format Name#1234567");

export const updateProfileSchema = z.object({
  displayName: z.string().trim().min(2).max(32),
  activisionId: activisionIdSchema.nullable(),
  streamUrl: z
    .url()
    .refine(
      (u) => /^(https:\/\/)?(www\.)?(twitch\.tv|kick\.com|youtube\.com)\//i.test(u),
      "Supported: Twitch, Kick, YouTube",
    )
    .nullable(),
  bio: z.string().trim().max(500).default(""),
});

export const registerAsHosterSchema = z.object({
  twitterHandle: z
    .string()
    .trim()
    .regex(/^@?[A-Za-z0-9_]{1,15}$/)
    .optional(),
  discordInvite: z.url().optional(),
});

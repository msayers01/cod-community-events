import { z } from "zod";

export const joinCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Z0-9]{6,10}$/i, "Join code must be 6-10 letters or digits")
  .transform((s) => s.toUpperCase());

export const quickAddSchema = z.object({
  eventId: z.string().min(1),
  /** Display name, Activision ID or existing user id. Resolution happens server-side. */
  identifier: z.string().trim().min(2).max(64),
  markPaid: z.boolean().default(false),
});

export const markPaidSchema = z.object({
  registrationId: z.string().min(1),
  paid: z.boolean(),
});

export const removeRegistrationSchema = z.object({
  registrationId: z.string().min(1),
  reason: z.string().trim().min(3).max(500),
});

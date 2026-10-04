import { z } from "zod";

/** Every step on a throw flag carries a reason, which lands in the append-only staff log. */
export const throwFlagActionSchema = z.object({
  flagId: z.string().min(1),
  reason: z.string().trim().min(10).max(2000),
});
export type ThrowFlagActionInput = z.infer<typeof throwFlagActionSchema>;

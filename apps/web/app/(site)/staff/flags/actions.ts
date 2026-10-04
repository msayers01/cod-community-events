"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as flags from "@/modules/throwflags/service";

type Step = "start" | "dismiss" | "escalate";

export async function flagStepAction(
  flagId: string,
  step: Step,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    const input = { flagId, reason };
    if (step === "start") await flags.startReview(actor, input);
    else if (step === "dismiss") await flags.dismissFlag(actor, input);
    else await flags.escalateFlag(actor, input);
    revalidatePath("/staff/flags");
    revalidatePath(`/staff/flags/${flagId}`);
    return step === "escalate"
      ? "A report was opened. It follows the normal report process."
      : step === "dismiss"
        ? "Flag dismissed."
        : "You are now reviewing this flag.";
  });
}

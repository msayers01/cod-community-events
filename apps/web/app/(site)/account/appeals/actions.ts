"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { fileAppeal } from "@/modules/moderation/blacklist";
import type { EvidenceInput } from "@/app/(site)/report/actions";

export async function fileAppealAction(input: {
  target: "BLACKLIST_ENTRY" | "SANCTION" | "DISPUTE_RULING";
  targetId: string;
  statement: string;
  evidence: EvidenceInput[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await fileAppeal(actor, input);
    revalidatePath("/account/appeals");
    return "Appeal submitted. A moderator not involved in the original decision will review it.";
  });
}

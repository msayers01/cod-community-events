"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { respondAsAccused } from "@/modules/moderation/service";
import type { EvidenceInput } from "@/app/(site)/report/actions";

export async function respondAsAccusedAction(
  reportId: string,
  statement: string,
  evidence: EvidenceInput[],
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await respondAsAccused(actor, { reportId, statement, evidence });
    revalidatePath("/account/reports");
    return "Your response has been recorded and the report moved to review.";
  });
}

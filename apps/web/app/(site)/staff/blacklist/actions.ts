"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as bl from "@/modules/moderation/blacklist";

export async function proposeEntryAction(input: {
  userId: string;
  category: string;
  publicWording: string;
  reportId?: string;
  expiresInDays?: number;
  reason: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await bl.proposeEntry(actor, input);
    revalidatePath("/staff/blacklist");
    if (input.reportId) revalidatePath(`/staff/reports/${input.reportId}`);
    return "Entry proposed. A second moderator must approve before it goes public.";
  });
}
export async function approveEntryAction(entryId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    const e = await bl.approveEntry(actor, entryId, reason);
    revalidatePath("/staff/blacklist");
    return e.status === "ACTIVE"
      ? "Second approval given. The entry is now public."
      : "Approved. Waiting for a second moderator.";
  });
}
export async function removeEntryAction(entryId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await bl.removeEntry(actor, entryId, reason);
    revalidatePath("/staff/blacklist");
    return "Entry removed.";
  });
}
export async function takeAppealAction(appealId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await bl.takeAppeal(actor, appealId, reason);
    revalidatePath("/staff/appeals");
  });
}
export async function decideAppealAction(
  appealId: string,
  decision: "UPHELD" | "OVERTURNED",
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await bl.decideAppeal(actor, { appealId, decision, reason });
    revalidatePath("/staff/appeals");
    return decision === "OVERTURNED"
      ? "Appeal upheld; the decision was overturned."
      : "Appeal denied; the decision stands.";
  });
}

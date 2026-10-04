"use server";
import { revalidatePath } from "next/cache";
import type { ReportStatus } from "@cod/shared";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as mod from "@/modules/moderation/service";
import { removeAvatarAsStaff } from "@/modules/identity/avatars";
import type { EvidenceInput } from "@/app/(site)/report/actions";

export async function assignReportAction(reportId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await mod.assignReport(actor, reportId, reason);
    revalidatePath(`/staff/reports/${reportId}`);
  });
}

export async function transitionReportAction(
  reportId: string,
  to: ReportStatus,
  reason: string,
  resolution?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await mod.transitionReport(actor, reportId, to, reason, resolution);
    revalidatePath(`/staff/reports/${reportId}`);
    revalidatePath("/staff");
  });
}

export async function addEvidenceAction(
  reportId: string,
  item: EvidenceInput,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await mod.addStaffEvidence(actor, reportId, item, reason);
    revalidatePath(`/staff/reports/${reportId}`);
  });
}

export async function issueSanctionAction(input: {
  userId: string;
  type: "WARNING" | "SUSPENSION" | "PERMANENT_BAN";
  reason: string;
  days?: number;
  reportId?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await mod.issueSanction(actor, input);
    if (input.reportId) revalidatePath(`/staff/reports/${input.reportId}`);
    revalidatePath(`/staff/users/${input.userId}`);
    return "Sanction recorded";
  });
}

export async function addStaffNoteAction(
  userId: string,
  body: string,
  backTo: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await mod.addStaffNote(actor, { userId, body });
    revalidatePath(backTo);
    return "Note added";
  });
}

export async function removeAvatarAction(userId: string, reason: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await removeAvatarAsStaff(actor, userId, reason);
    revalidatePath(`/staff/users/${userId}`);
    return "Profile picture removed";
  });
}

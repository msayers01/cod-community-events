"use server";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { fileReport } from "@/modules/moderation/service";

export interface EvidenceInput {
  type: "SCREENSHOT" | "VOD" | "PAYMENT_RECORD" | "OTHER";
  url?: string;
  storageKey?: string;
  note: string;
}

export async function fileReportAction(input: {
  reportedUserId: string;
  category: string;
  description: string;
  eventId?: string;
  evidence: EvidenceInput[];
}): Promise<ActionResult> {
  let ok = false;
  const res = await runAction(async () => {
    const { actor } = await requireUser();
    await fileReport(actor, { ...input, eventId: input.eventId || undefined });
    ok = true;
  });
  if (ok) redirect("/account/reports?filed=1");
  return res;
}

"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as matches from "@/modules/matches/service";

export async function respondToSubmissionAction(
  submissionId: string,
  response: "CONFIRM" | "DISPUTE",
  disputeReason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await matches.respondToSubmission(actor, { submissionId, response, disputeReason });
    revalidatePath("/confirmations");
    return response === "CONFIRM"
      ? "Confirmed. Thanks!"
      : "Dispute filed. The hoster will review it after the stream.";
  });
}

export async function submitResultAction(input: {
  matchId: string;
  eventSlug: string;
  screenshotUrl?: string;
  screenshotKey?: string;
  scoreA: number;
  scoreB: number;
  stats: {
    playerId: string;
    kills: number;
    deaths: number;
    plants?: number;
    defuses?: number;
    hillTimeSeconds?: number;
  }[];
}): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    const { eventSlug, ...rest } = input;
    await matches.submitResult(actor, rest);
    revalidatePath(`/events/${eventSlug}/matches`);
    return "Result submitted. Players in the match have 24 hours to confirm.";
  });
}

export async function createMatchesAction(roundId: string, eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await matches.createMatchesForRound(actor, roundId);
    revalidatePath(`/dashboard/events/${eventId}`);
    return "Matches created.";
  });
}

export async function resolveDisputeAction(
  submissionId: string,
  outcome: "VERIFIED" | "REJECTED",
  reason: string,
  eventId?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await matches.resolveDispute(actor, { submissionId, outcome, reason });
    if (eventId) revalidatePath(`/dashboard/events/${eventId}/disputes`);
    revalidatePath("/staff/disputes");
    return outcome === "VERIFIED"
      ? "Result verified."
      : "Result rejected; the match is open for a new submission.";
  });
}

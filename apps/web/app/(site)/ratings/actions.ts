"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as rep from "@/modules/reputation/service";

export async function rateTeammateAction(input: {
  matchId: string;
  ratedId: string;
  wouldPlayAgain: boolean;
  communication: number;
  effort: number;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await rep.rateTeammate(actor, input);
    revalidatePath("/ratings");
    return "Rating saved";
  });
}

export async function reviewHosterAction(input: {
  eventId: string;
  eventSlug: string;
  organization: number;
  communication: number;
  fairness: number;
  comment?: string;
}): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    const { eventSlug, ...rest } = input;
    await rep.reviewHoster(actor, rest);
    revalidatePath(`/events/${eventSlug}/review`);
    return "Thanks, your review is live on the hoster's profile.";
  });
}

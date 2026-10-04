"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { respondToPayout } from "@/modules/reputation/service";

export async function respondToPayoutAction(
  payoutConfirmationId: string,
  paid: boolean,
  note?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await respondToPayout(user.id, payoutConfirmationId, paid, note);
    revalidatePath("/payouts");
    return paid
      ? "Thanks, payout confirmed."
      : "Recorded. Staff will review the non-payment report.";
  });
}

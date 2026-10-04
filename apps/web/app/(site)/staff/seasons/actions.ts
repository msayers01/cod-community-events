"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import { createSeason } from "@/modules/leaderboards/service";

export async function createSeasonAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    const raw = Object.fromEntries(formData.entries());
    const tz = Number(raw.tzOffsetMinutes ?? 0);
    // Dates are picked in the browser's zone; store them as UTC (see dashboard/actions.ts).
    const utc = (v: unknown) => new Date(new Date(`${String(v)}:00Z`).getTime() + tz * 60_000);
    await createSeason(actor, {
      name: raw.name,
      startsAt: utc(raw.startsAt),
      endsAt: utc(raw.endsAt),
      reason: raw.reason,
    });
    revalidatePath("/staff/seasons");
    revalidatePath("/leaderboards");
    return "Season created. Its standings are being built now.";
  });
}

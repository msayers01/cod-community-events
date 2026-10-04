"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { registerAsHosterSchema, saveTemplateSchema } from "@cod/shared";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as events from "@/modules/events/service";
import * as reg from "@/modules/registration/service";
import * as wheel from "@/modules/wheel/service";
import * as reputation from "@/modules/reputation/service";

export async function registerAsHosterAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const input = registerAsHosterSchema.parse({
    twitterHandle: formData.get("twitterHandle") || undefined,
    discordInvite: formData.get("discordInvite") || undefined,
  });
  await events.registerAsHoster(user.actor, input);
  redirect("/dashboard");
}

export async function createEventAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let slugOrId: string | null = null;
  const res = await runAction(async () => {
    const user = await requireUser();
    const raw = Object.fromEntries(formData.entries());
    const tz = Number(raw.tzOffsetMinutes ?? 0);
    const e = await events.createEvent(user.actor, {
      ...raw,
      startsAt: localToUtc(String(raw.startsAt), tz),
      checkInOpensAt: localToUtc(String(raw.checkInOpensAt), tz),
      checkInClosesAt: localToUtc(String(raw.checkInClosesAt), tz),
      teamSize: Number(raw.teamSize),
      roundCount: raw.roundCount ? Number(raw.roundCount) : null,
      playerCap: Number(raw.playerCap),
      entryFeeCents: Math.round(Number(raw.entryFee ?? 0) * 100),
      payoutSplit: parseSplit(String(raw.payoutSplit ?? "100")),
      rules: {
        mapPool: splitList(raw.mapPool),
        bannedItems: splitList(raw.bannedItems),
        streamingRequired: raw.streamingRequired === "on",
        monicamOnRequest: raw.monicamOnRequest === "on",
        notes: String(raw.notes ?? ""),
      },
      entryRequirements:
        raw.entryType === "REQUIREMENT_BASED"
          ? {
              minCompletedEvents: Number(raw.minCompletedEvents ?? 0),
              noOpenReports: true,
              requireLinkedDiscord: false,
            }
          : null,
    });
    slugOrId = e.id;
  });
  if (res.ok && slugOrId) redirect(`/dashboard/events/${slugOrId}`);
  return res;
}

/** datetime-local gives "YYYY-MM-DDTHH:mm" in the browser's zone; shift by its UTC offset (minutes, as getTimezoneOffset()). */
function localToUtc(local: string, offsetMinutes: number): Date {
  const asUtc = new Date(`${local}:00Z`);
  return new Date(asUtc.getTime() + offsetMinutes * 60_000);
}

function splitList(v: unknown): string[] {
  return String(v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
function parseSplit(v: string) {
  return v
    .split(/[,/]/)
    .map((s, i) => ({ place: i + 1, percent: Number(s.trim()) }))
    .filter((p) => !Number.isNaN(p.percent));
}

type Transition = "publish" | "openCheckIn" | "start" | "complete" | "cancel";

export async function eventTransitionAction(
  eventId: string,
  t: Transition,
  reason?: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    if (t === "publish") await events.publishEvent(actor, eventId);
    if (t === "openCheckIn") await events.openCheckIn(actor, eventId);
    if (t === "start") await events.startEvent(actor, eventId);
    if (t === "complete") await events.completeEvent(actor, eventId);
    if (t === "cancel") await events.cancelEvent(actor, eventId, reason ?? "Cancelled by hoster");
    revalidatePath(`/dashboard/events/${eventId}`);
  });
}

export async function markPaidAction(
  registrationId: string,
  eventId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await reg.markPaid(actor, registrationId);
    revalidatePath(`/dashboard/events/${eventId}`);
  });
}

export async function removePlayerAction(
  registrationId: string,
  eventId: string,
  reason: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await reg.remove(actor, registrationId, reason || "Removed by hoster");
    revalidatePath(`/dashboard/events/${eventId}`);
  });
}

export async function quickAddAction(
  eventId: string,
  identifier: string,
  paid: boolean,
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await reg.quickAdd(actor, eventId, identifier, paid);
    revalidatePath(`/dashboard/events/${eventId}`);
    return `Added ${identifier}`;
  });
}

export async function commitSpinAction(eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await wheel.commitSpin(actor, eventId);
    revalidatePath(`/dashboard/events/${eventId}`);
    return "Commitment published. Hit Spin when you're ready on stream.";
  });
}

export async function executeSpinAction(spinId: string, eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await wheel.executeSpin(actor, spinId);
    revalidatePath(`/dashboard/events/${eventId}`);
  });
}

export async function completeRoundAction(roundId: string, eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await wheel.completeRound(actor, roundId);
    revalidatePath(`/dashboard/events/${eventId}`);
  });
}

export async function regenerateOverlayKeyAction(eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await events.regenerateOverlayKey(actor, eventId);
    revalidatePath(`/dashboard/events/${eventId}`);
    return "New overlay URL generated. Update your OBS browser source.";
  });
}

export async function saveTemplateAction(eventId: string, name: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await events.saveTemplateFromEvent(actor, eventId, saveTemplateSchema.shape.name.parse(name));
    return `Saved template "${name}"`;
  });
}

export async function deleteTemplateAction(templateId: string): Promise<void> {
  const { actor } = await requireUser();
  await events.deleteTemplate(actor, templateId);
  revalidatePath("/dashboard/events/new");
}

export async function recordWinnersAction(
  eventId: string,
  winners: { place: number; userId: string }[],
): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await reputation.recordWinners(actor, { eventId, winners });
    revalidatePath(`/dashboard/events/${eventId}`);
    return "Winners recorded. They will be asked to confirm payment.";
  });
}

export async function inviteAction(eventId: string, identifier: string): Promise<ActionResult> {
  return runAction(async () => {
    const { actor } = await requireUser();
    await reg.invite(actor, eventId, identifier);
    revalidatePath(`/dashboard/events/${eventId}`);
    return `Invited ${identifier}`;
  });
}

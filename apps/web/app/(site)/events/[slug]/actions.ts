"use server";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { runAction, type ActionResult } from "@/lib/actions";
import * as reg from "@/modules/registration/service";
import { prisma } from "@cod/db";

async function slugFor(eventId: string) {
  const e = await prisma.event.findUnique({ where: { id: eventId }, select: { slug: true } });
  return e ? `/events/${e.slug}` : "/";
}

export async function signUpAction(eventId: string): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await reg.register(user.id, eventId, "WEBSITE");
    revalidatePath(await slugFor(eventId));
    return "You're on the list. Pay the hoster to confirm your spot.";
  });
}

export async function withdrawAction(
  registrationId: string,
  eventId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await reg.withdraw(user.id, registrationId);
    revalidatePath(await slugFor(eventId));
    return "You have withdrawn.";
  });
}

export async function checkInAction(
  registrationId: string,
  eventId: string,
): Promise<ActionResult> {
  return runAction(async () => {
    const user = await requireUser();
    await reg.checkIn(user.id, registrationId);
    revalidatePath(await slugFor(eventId));
    return "Checked in. Good luck!";
  });
}

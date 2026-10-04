import { prisma, emit, type Prisma } from "@cod/db";
import {
  canManageEvent,
  registrationMachine,
  OCCUPYING_STATUSES,
  type Actor,
  type SignupSource,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";

type Tx = Prisma.TransactionClient;

async function activeSanction(tx: Tx, userId: string) {
  const now = new Date();
  return tx.sanction.findFirst({
    where: {
      userId,
      type: { in: ["SUSPENSION", "PERMANENT_BAN"] },
      startsAt: { lte: now },
      OR: [{ endsAt: null }, { endsAt: { gt: now } }],
    },
  });
}

async function nextWaitlistPosition(tx: Tx, eventId: string): Promise<number> {
  const last = await tx.registration.aggregate({
    where: { eventId, status: "WAITLISTED" },
    _max: { waitlistPosition: true },
  });
  return (last._max.waitlistPosition ?? 0) + 1;
}

async function confirmedCount(tx: Tx, eventId: string): Promise<number> {
  return tx.registration.count({ where: { eventId, status: { in: [...OCCUPYING_STATUSES] } } });
}

/** A player signs up. Everyone starts on the waitlist until the hoster marks them paid. */
export async function register(userId: string, eventId: string, source: SignupSource = "WEBSITE") {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundError("Event");
    if (event.status !== "OPEN" && event.status !== "CHECK_IN") {
      throw new DomainError("EVENT_CLOSED", "This event is not accepting sign-ups");
    }
    if (event.hosterId === userId)
      throw new DomainError("HOSTER_SELF_SIGNUP", "Hosters cannot enter their own event");
    if (event.entryType === "INVITE_ONLY") {
      const invite = await tx.eventInvite.findUnique({
        where: { eventId_invitedUserId: { eventId, invitedUserId: userId } },
      });
      if (!invite) throw new DomainError("INVITE_REQUIRED", "This event is invite-only");
    }
    if (await activeSanction(tx, userId)) {
      throw new DomainError("SANCTIONED", "Your account is currently suspended");
    }
    const existing = await tx.registration.findUnique({
      where: { eventId_playerId: { eventId, playerId: userId } },
    });
    if (existing && !["WITHDRAWN", "REMOVED"].includes(existing.status)) {
      throw new DomainError("ALREADY_REGISTERED", "You are already signed up");
    }
    if (existing?.status === "REMOVED")
      throw new DomainError("REMOVED", "The hoster removed you from this event");

    const flagged = !!(await tx.sanction.findFirst({ where: { userId, type: "WARNING" } }));
    const data = {
      status: "WAITLISTED" as const,
      source,
      waitlistPosition: await nextWaitlistPosition(tx, eventId),
      blacklistFlagged: flagged,
      markedPaidAt: null,
      markedPaidById: null,
      checkedInAt: null,
    };
    const reg = existing
      ? await tx.registration.update({ where: { id: existing.id }, data })
      : await tx.registration.create({ data: { ...data, eventId, playerId: userId } });
    await emit(tx, { type: "PlayerRegistered", eventId, registrationId: reg.id, userId });
    return reg;
  });
}

/** Hoster marks a waitlisted player as paid, which confirms their spot. */
export async function markPaid(actor: Actor, registrationId: string) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.registration.findUnique({
      where: { id: registrationId },
      include: { event: true },
    });
    if (!reg) throw new NotFoundError("Registration");
    if (!canManageEvent(actor, { hosterUserId: reg.event.hosterId })) throw new ForbiddenError();
    registrationMachine.assertTransition(reg.status, "CONFIRMED");
    if ((await confirmedCount(tx, reg.eventId)) >= reg.event.playerCap) {
      throw new DomainError("EVENT_FULL", "All paid spots are taken");
    }
    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: {
        status: "CONFIRMED",
        waitlistPosition: null,
        markedPaidById: actor.userId,
        markedPaidAt: new Date(),
      },
    });
    await renumberWaitlist(tx, reg.eventId);
    await emit(tx, {
      type: "PlayerMarkedPaid",
      eventId: reg.eventId,
      registrationId,
      userId: reg.playerId,
    });
    return updated;
  });
}

export async function withdraw(userId: string, registrationId: string) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.registration.findUnique({ where: { id: registrationId } });
    if (!reg || reg.playerId !== userId) throw new NotFoundError("Registration");
    registrationMachine.assertTransition(reg.status, "WITHDRAWN");
    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { status: "WITHDRAWN", waitlistPosition: null },
    });
    await renumberWaitlist(tx, reg.eventId);
    await emit(tx, { type: "RegistrationWithdrawn", eventId: reg.eventId, registrationId, userId });
    return updated;
  });
}

export async function remove(actor: Actor, registrationId: string, reason: string) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.registration.findUnique({
      where: { id: registrationId },
      include: { event: true },
    });
    if (!reg) throw new NotFoundError("Registration");
    if (!canManageEvent(actor, { hosterUserId: reg.event.hosterId })) throw new ForbiddenError();
    if (reg.event.status === "LIVE")
      throw new DomainError("EVENT_LIVE", "Players cannot be removed once the event is live");
    registrationMachine.assertTransition(reg.status, "REMOVED");
    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { status: "REMOVED", waitlistPosition: null, removedReason: reason },
    });
    await renumberWaitlist(tx, reg.eventId);
    await emit(tx, {
      type: "RegistrationRemoved",
      eventId: reg.eventId,
      registrationId,
      userId: reg.playerId,
    });
    return updated;
  });
}

export async function checkIn(userId: string, registrationId: string) {
  return prisma.$transaction(async (tx) => {
    const reg = await tx.registration.findUnique({
      where: { id: registrationId },
      include: { event: true },
    });
    if (!reg || reg.playerId !== userId) throw new NotFoundError("Registration");
    if (reg.event.status !== "CHECK_IN")
      throw new DomainError("CHECK_IN_CLOSED", "Check-in is not open");
    registrationMachine.assertTransition(reg.status, "CHECKED_IN");
    const updated = await tx.registration.update({
      where: { id: registrationId },
      data: { status: "CHECKED_IN", checkedInAt: new Date() },
    });
    await emit(tx, { type: "PlayerCheckedIn", eventId: reg.eventId, registrationId, userId });
    return updated;
  });
}

/** Hoster adds a late entry by display name or Activision ID (e.g. from Twitch chat). */
export async function quickAdd(actor: Actor, eventId: string, identifier: string, paid: boolean) {
  const event = await prisma.event.findUnique({ where: { id: eventId } });
  if (!event) throw new NotFoundError("Event");
  if (!canManageEvent(actor, { hosterUserId: event.hosterId })) throw new ForbiddenError();
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { displayName: { equals: identifier, mode: "insensitive" } },
        { activisionId: { equals: identifier, mode: "insensitive" } },
      ],
    },
  });
  if (!user) throw new DomainError("USER_NOT_FOUND", `No player matches "${identifier}"`);
  const reg = await register(user.id, eventId, "QUICK_ADD");
  return paid ? markPaid(actor, reg.id) : reg;
}

/** Keep waitlist positions contiguous (1..n) after any change. */
async function renumberWaitlist(tx: Tx, eventId: string) {
  const waiting = await tx.registration.findMany({
    where: { eventId, status: "WAITLISTED" },
    orderBy: [{ waitlistPosition: "asc" }, { createdAt: "asc" }],
    select: { id: true, waitlistPosition: true },
  });
  for (const [i, r] of waiting.entries()) {
    if (r.waitlistPosition !== i + 1) {
      await tx.registration.update({ where: { id: r.id }, data: { waitlistPosition: i + 1 } });
    }
  }
}

export async function myRegistration(userId: string, eventId: string) {
  return prisma.registration.findUnique({
    where: { eventId_playerId: { eventId, playerId: userId } },
  });
}

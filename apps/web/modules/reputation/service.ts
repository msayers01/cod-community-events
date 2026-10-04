import { prisma, emit } from "@cod/db";
import { canManageEvent, recordWinnersSchema, type Actor } from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";

export const PAYOUT_CONFIRM_WINDOW_DAYS = 7;

/**
 * After an event completes the hoster records who won. Each winner gets a
 * payout confirmation to answer within the window. This is the objective data
 * behind hoster reputation, so winners must have actually been in the pool.
 */
export async function recordWinners(actor: Actor, raw: unknown) {
  const input = recordWinnersSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      include: { registrations: { where: { status: "IN_POOL" }, select: { playerId: true } } },
    });
    if (!event) throw new NotFoundError("Event");
    if (!canManageEvent(actor, { hosterUserId: event.hosterId })) throw new ForbiddenError();
    if (event.status !== "COMPLETED")
      throw new DomainError("NOT_COMPLETED", "Complete the event before recording winners");
    if (event.winnersRecordedAt)
      throw new DomainError("ALREADY_RECORDED", "Winners have already been recorded");

    const split = event.payoutSplit as { place: number; percent: number }[];
    const paidPlaces = new Set(split.filter((s) => s.percent > 0).map((s) => s.place));
    const pool = new Set(event.registrations.map((r) => r.playerId));
    for (const w of input.winners) {
      if (!pool.has(w.userId))
        throw new DomainError("NOT_IN_POOL", "Winners must be players who were in the event pool");
      if (!paidPlaces.has(w.place))
        throw new DomainError(
          "NO_PAYOUT_FOR_PLACE",
          `Place ${w.place} has no payout in this event's split`,
        );
    }

    const deadline = new Date(Date.now() + PAYOUT_CONFIRM_WINDOW_DAYS * 86400_000);
    await tx.payoutConfirmation.createMany({
      data: input.winners.map((w) => ({
        eventId: event.id,
        winnerId: w.userId,
        place: w.place,
        deadline,
      })),
    });
    const updated = await tx.event.update({
      where: { id: event.id },
      data: { winnersRecordedAt: new Date() },
    });
    await emit(tx, { type: "WinnersRecorded", eventId: event.id });
    return updated;
  });
}

/** A winner answers the prompt. "Not paid" automatically opens a non-payment report for staff. */
export async function respondToPayout(
  userId: string,
  payoutConfirmationId: string,
  paid: boolean,
  note?: string,
) {
  return prisma.$transaction(async (tx) => {
    const pc = await tx.payoutConfirmation.findUnique({
      where: { id: payoutConfirmationId },
      include: { event: true },
    });
    if (!pc || pc.winnerId !== userId) throw new NotFoundError("Payout confirmation");
    if (pc.response !== "NO_RESPONSE")
      throw new DomainError("ALREADY_ANSWERED", "You have already responded");

    const updated = await tx.payoutConfirmation.update({
      where: { id: pc.id },
      data: { response: paid ? "PAID" : "NOT_PAID", respondedAt: new Date(), note: note ?? null },
    });
    await emit(tx, {
      type: paid ? "PayoutConfirmed" : "PayoutDenied",
      eventId: pc.eventId,
      payoutConfirmationId: pc.id,
      winnerId: userId,
    });
    return updated;
  });
}

export async function pendingPayoutsFor(userId: string) {
  return prisma.payoutConfirmation.findMany({
    where: { winnerId: userId, response: "NO_RESPONSE" },
    include: {
      event: {
        select: {
          id: true,
          slug: true,
          title: true,
          hoster: { include: { user: { select: { displayName: true } } } },
        },
      },
    },
    orderBy: { deadline: "asc" },
  });
}

/** Objective hoster record shown on profiles. */
export async function hosterPayoutRecord(hosterUserId: string) {
  const [completed, confirmations] = await Promise.all([
    prisma.event.count({
      where: { hosterId: hosterUserId, status: { in: ["COMPLETED", "ARCHIVED"] } },
    }),
    prisma.payoutConfirmation.groupBy({
      by: ["response"],
      where: { event: { hosterId: hosterUserId } },
      _count: true,
    }),
  ]);
  const byResponse = Object.fromEntries(confirmations.map((c) => [c.response, c._count])) as Record<
    string,
    number
  >;
  return {
    completedEvents: completed,
    paid: byResponse.PAID ?? 0,
    notPaid: byResponse.NOT_PAID ?? 0,
    noResponse: byResponse.NO_RESPONSE ?? 0,
  };
}

import { prisma, emit } from "@cod/db";
import {
  canManageEvent,
  hasPermission,
  hosterReviewSchema,
  recordWinnersSchema,
  teammateRatingSchema,
  type Actor,
} from "@cod/shared";
export { recalculateReputation } from "@cod/core";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logStaffAction } from "@/modules/moderation/audit";

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

// ───────────── Teammate ratings (Phase 2) ─────────────

/** Only actual teammates in a verified match can rate each other, once per match. */
export async function rateTeammate(actor: Actor, raw: unknown) {
  const input = teammateRatingSchema.parse(raw);
  if (input.ratedId === actor.userId)
    throw new DomainError("SELF_RATING", "You cannot rate yourself");
  return prisma.$transaction(async (tx) => {
    const match = await tx.match.findUnique({
      where: { id: input.matchId },
      include: { teamA: { include: { members: true } }, teamB: { include: { members: true } } },
    });
    if (!match) throw new NotFoundError("Match");
    if (match.status !== "VERIFIED")
      throw new DomainError("NOT_VERIFIED", "Ratings open once the match result is verified");
    const sameTeam = [match.teamA, match.teamB].some((t) => {
      const ids = t.members.map((m) => m.userId);
      return ids.includes(actor.userId) && ids.includes(input.ratedId);
    });
    if (!sameTeam)
      throw new ForbiddenError("You can only rate players who were on your team in this match");
    const existing = await tx.teammateRating.findUnique({
      where: {
        matchId_raterId_ratedId: {
          matchId: input.matchId,
          raterId: actor.userId,
          ratedId: input.ratedId,
        },
      },
    });
    if (existing)
      throw new DomainError("ALREADY_RATED", "You already rated this teammate for this match");
    const rating = await tx.teammateRating.create({
      data: {
        matchId: input.matchId,
        raterId: actor.userId,
        ratedId: input.ratedId,
        wouldPlayAgain: input.wouldPlayAgain,
        communication: input.communication,
        effort: input.effort,
      },
    });
    await emit(tx, { type: "TeammateRated", matchId: input.matchId, ratedId: input.ratedId });
    return rating;
  });
}

/** Teammates in verified matches the player has not rated yet. */
export async function pendingRatingsFor(userId: string) {
  const matches = await prisma.match.findMany({
    where: {
      status: "VERIFIED",
      OR: [
        { teamA: { members: { some: { userId } } } },
        { teamB: { members: { some: { userId } } } },
      ],
    },
    include: {
      teamA: {
        include: { members: { include: { user: { select: { id: true, displayName: true } } } } },
      },
      teamB: {
        include: { members: { include: { user: { select: { id: true, displayName: true } } } } },
      },
      ratings: { where: { raterId: userId }, select: { ratedId: true } },
      round: { include: { event: { select: { title: true, slug: true } } } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return matches
    .map((m) => {
      const myTeam = m.teamA.members.some((x) => x.userId === userId) ? m.teamA : m.teamB;
      const rated = new Set(m.ratings.map((r) => r.ratedId));
      const teammates = myTeam.members
        .map((x) => x.user)
        .filter((u) => u.id !== userId && !rated.has(u.id));
      return { matchId: m.id, event: m.round.event, round: m.round.roundNumber, teammates };
    })
    .filter((m) => m.teammates.length > 0);
}

// ───────────── Hoster reviews (Phase 2) ─────────────

/** Only players who were in the pool of a completed event can review its hoster. One review per event. */
export async function reviewHoster(actor: Actor, raw: unknown) {
  const input = hosterReviewSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: input.eventId },
      select: { id: true, hosterId: true, status: true },
    });
    if (!event) throw new NotFoundError("Event");
    if (!["COMPLETED", "ARCHIVED"].includes(event.status))
      throw new DomainError("NOT_COMPLETED", "Reviews open once the event is completed");
    const reg = await tx.registration.findUnique({
      where: { eventId_playerId: { eventId: event.id, playerId: actor.userId } },
    });
    if (!reg || reg.status !== "IN_POOL")
      throw new ForbiddenError("Only players who took part can review this event");
    const existing = await tx.hosterReview.findUnique({
      where: { eventId_reviewerId: { eventId: event.id, reviewerId: actor.userId } },
    });
    if (existing) throw new DomainError("ALREADY_REVIEWED", "You already reviewed this event");
    const review = await tx.hosterReview.create({
      data: {
        eventId: event.id,
        reviewerId: actor.userId,
        organization: input.organization,
        communication: input.communication,
        fairness: input.fairness,
        comment: input.comment || null,
      },
    });
    await emit(tx, { type: "HosterReviewed", eventId: event.id, hosterId: event.hosterId });
    return review;
  });
}

/** Staff can hide an inappropriate review comment (logged). */
export async function hideReview(actor: Actor, reviewId: string, reason: string) {
  if (!hasPermission(actor, "content.remove")) throw new ForbiddenError();
  return prisma.$transaction(async (tx) => {
    const review = await tx.hosterReview.update({
      where: { id: reviewId },
      data: { hidden: true },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "review.hidden",
      targetType: "review",
      targetId: reviewId,
      reason,
    });
    return review;
  });
}

export async function reviewsForHoster(hosterId: string, take = 20) {
  return prisma.hosterReview.findMany({
    where: { event: { hosterId }, hidden: false },
    include: {
      reviewer: { select: { displayName: true } },
      event: { select: { title: true, slug: true } },
    },
    orderBy: { createdAt: "desc" },
    take,
  });
}

// ───────────── Reputation summary, tiers and badges (Phase 2) ─────────────

/** Staff override of a hoster's tier (logged). */
export async function setHosterTier(
  actor: Actor,
  hosterUserId: string,
  tier: "NEW" | "VERIFIED" | "TRUSTED",
  reason: string,
) {
  if (!hasPermission(actor, "hoster.verify")) throw new ForbiddenError();
  return prisma.$transaction(async (tx) => {
    const profile = await tx.hosterProfile.update({
      where: { userId: hosterUserId },
      data: { tier, tierSetManually: true },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "hoster.tier_set",
      targetType: "user",
      targetId: hosterUserId,
      reason,
      metadata: { tier },
    });
    await emit(tx, { type: "ReputationChanged", userId: hosterUserId });
    return profile;
  });
}

export async function reputationFor(userId: string) {
  return prisma.reputationSummary.findUnique({ where: { userId } });
}

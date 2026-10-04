import { prisma, emit, type Prisma } from "@cod/db";
import {
  canManageEvent,
  confirmResultSchema,
  createMatchesSchema,
  hasPermission,
  matchMachine,
  resolveDisputeSchema,
  submissionMachine,
  submitResultSchema,
  type Actor,
  type PlayerStatInput,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logStaffAction } from "@/modules/moderation/audit";
import { publishEventUpdate } from "@/modules/realtime/publish";
import { isVerifiedByConfirmations, queueScreenshotReading, verifySubmissionInTx } from "@cod/core";
export { isVerifiedByConfirmations, expireSubmission } from "@cod/core";

/** Hours players have to confirm or dispute before a submission auto-verifies or expires. */
export const VERIFICATION_WINDOW_HOURS = 24;

type Tx = Prisma.TransactionClient;

// ───────────── Match setup ─────────────

/**
 * Pair this round's teams into matches. Default pairing is in label order
 * (A vs B, C vs D, ...); the hoster can pass explicit pairings and maps.
 */
export async function createMatchesForRound(
  actor: Actor,
  roundId: string,
  pairings?: { teamAId: string; teamBId: string; maps?: string[] }[],
) {
  const result = await prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({
      where: { id: roundId },
      include: { event: true, teams: { orderBy: { label: "asc" } }, matches: true },
    });
    if (!round) throw new NotFoundError("Round");
    if (!canManageEvent(actor, { hosterUserId: round.event.hosterId })) throw new ForbiddenError();
    if (round.status === "PENDING")
      throw new DomainError("NOT_SPUN", "Spin the round before creating matches");
    if (round.matches.length > 0) return round.matches;

    const input = createMatchesSchema.parse({
      roundId,
      pairings:
        pairings ??
        round.teams.reduce<{ teamAId: string; teamBId: string; maps: string[] }[]>(
          (acc, t, i, arr) => {
            if (i % 2 === 0 && arr[i + 1])
              acc.push({ teamAId: t.id, teamBId: arr[i + 1]!.id, maps: [] });
            return acc;
          },
          [],
        ),
    });
    const teamIds = new Set(round.teams.map((t) => t.id));
    const used = new Set<string>();
    for (const p of input.pairings) {
      if (!teamIds.has(p.teamAId) || !teamIds.has(p.teamBId) || p.teamAId === p.teamBId)
        throw new DomainError(
          "BAD_PAIRING",
          "Pairings must use two different teams from this round",
        );
      if (used.has(p.teamAId) || used.has(p.teamBId))
        throw new DomainError("TEAM_TWICE", "A team can only play one match per round");
      used.add(p.teamAId).add(p.teamBId);
    }
    await tx.match.createMany({
      data: input.pairings.map((p) => ({
        roundId,
        teamAId: p.teamAId,
        teamBId: p.teamBId,
        maps: p.maps,
      })),
    });
    if (round.status === "SPUN")
      await tx.round.update({ where: { id: roundId }, data: { status: "IN_PROGRESS" } });
    return tx.match.findMany({ where: { roundId }, orderBy: { createdAt: "asc" } });
  });
  const eventId = (
    await prisma.round.findUniqueOrThrow({ where: { id: roundId }, select: { eventId: true } })
  ).eventId;
  await publishEventUpdate(eventId, "other");
  return result;
}

async function loadMatch(tx: Tx, matchId: string) {
  const match = await tx.match.findUnique({
    where: { id: matchId },
    include: {
      round: {
        include: { event: { select: { id: true, hosterId: true, mode: true, status: true } } },
      },
      teamA: { include: { members: true } },
      teamB: { include: { members: true } },
    },
  });
  if (!match) throw new NotFoundError("Match");
  return match;
}

function participants(match: Awaited<ReturnType<typeof loadMatch>>) {
  return [...match.teamA.members, ...match.teamB.members].map((m) => m.userId);
}

// ───────────── Submission ─────────────

/**
 * Any player in the match, or the hoster, submits the result with a required
 * scoreboard screenshot. Nothing counts until verified.
 */
export async function submitResult(actor: Actor, raw: unknown) {
  const input = submitResultSchema.parse(raw);
  const out = await prisma.$transaction(async (tx) => {
    const match = await loadMatch(tx, input.matchId);
    const players = participants(match);
    const isHoster = match.round.event.hosterId === actor.userId;
    if (!isHoster && !players.includes(actor.userId))
      throw new ForbiddenError("Only players in this match or the hoster can submit a result");
    if (match.status !== "SCHEDULED" && match.status !== "REJECTED")
      throw new DomainError("ALREADY_SUBMITTED", "A result is already in progress for this match");

    for (const s of input.stats) {
      if (!players.includes(s.playerId))
        throw new DomainError(
          "STAT_FOR_NON_PLAYER",
          "Stats can only be entered for players in this match",
        );
    }
    const winningTeamId = input.scoreA > input.scoreB ? match.teamAId : match.teamBId;
    const deadline = new Date(Date.now() + VERIFICATION_WINDOW_HOURS * 3600_000);
    const submission = await tx.resultSubmission.create({
      data: {
        matchId: match.id,
        submittedById: actor.userId,
        screenshotUrl: input.screenshotUrl,
        screenshotKey: input.screenshotKey,
        scoreA: input.scoreA,
        scoreB: input.scoreB,
        winningTeamId,
        verificationDeadline: deadline,
        stats: { create: input.stats.map((s) => statData(s, match.id)) },
      },
    });
    matchMachine.assertTransition(match.status, "RESULT_PENDING");
    await tx.match.update({ where: { id: match.id }, data: { status: "RESULT_PENDING" } });
    // The worker reads the scoreboard in the background; the result doesn't wait for it.
    await queueScreenshotReading(tx, submission.id);
    await emit(tx, {
      type: "ResultSubmitted",
      matchId: match.id,
      submissionId: submission.id,
      eventId: match.round.event.id,
    });
    return { submission, eventId: match.round.event.id };
  });
  await publishEventUpdate(out.eventId, "other");
  return out.submission;
}

function statData(s: PlayerStatInput, matchId: string) {
  return {
    matchId,
    playerId: s.playerId,
    kills: s.kills,
    deaths: s.deaths,
    plants: s.plants,
    defuses: s.defuses,
    hillTimeSeconds: s.hillTimeSeconds,
  };
}

/** A player in the match confirms or disputes. Confirming is one tap; disputes need a reason. */
export async function respondToSubmission(actor: Actor, raw: unknown) {
  const input = confirmResultSchema.parse(raw);
  const out = await prisma.$transaction(async (tx) => {
    const submission = await tx.resultSubmission.findUnique({
      where: { id: input.submissionId },
      include: { confirmations: true },
    });
    if (!submission) throw new NotFoundError("Submission");
    const match = await loadMatch(tx, submission.matchId);
    const players = participants(match);
    if (!players.includes(actor.userId))
      throw new ForbiddenError("Only players in this match can confirm or dispute");
    if (actor.userId === submission.submittedById)
      throw new DomainError(
        "OWN_SUBMISSION",
        "You submitted this result; teammates and opponents confirm it",
      );
    if (submission.status !== "PENDING")
      throw new DomainError("NOT_PENDING", "This result is no longer open for confirmation");
    if (submission.confirmations.some((c) => c.playerId === actor.userId))
      throw new DomainError("ALREADY_RESPONDED", "You already responded");

    const confirmation = await tx.confirmation.create({
      data: {
        submissionId: submission.id,
        playerId: actor.userId,
        response: input.response,
        disputeReason: input.disputeReason,
        correctedValues: input.correctedValues as Prisma.InputJsonValue | undefined,
      },
    });
    const all = [...submission.confirmations, confirmation];

    if (input.response === "DISPUTE") {
      submissionMachine.assertTransition("PENDING", "DISPUTED");
      await tx.resultSubmission.update({
        where: { id: submission.id },
        data: { status: "DISPUTED" },
      });
      matchMachine.assertTransition(match.status, "DISPUTED");
      await tx.match.update({ where: { id: match.id }, data: { status: "DISPUTED" } });
      await emit(tx, {
        type: "ResultDisputed",
        matchId: match.id,
        submissionId: submission.id,
        eventId: match.round.event.id,
      });
    } else if (
      isVerifiedByConfirmations({
        submitterId: submission.submittedById,
        teamA: match.teamA.members.map((m) => m.userId),
        teamB: match.teamB.members.map((m) => m.userId),
        confirmations: all,
      })
    ) {
      await verifySubmissionInTx(
        tx,
        submission.id,
        match.id,
        match.round.event.id,
        submission.winningTeamId,
      );
    }
    return { confirmation, eventId: match.round.event.id };
  });
  await publishEventUpdate(out.eventId, "other");
  return out.confirmation;
}

/** Move a disputed submission into review (hoster or staff). */
export async function openReview(actor: Actor, submissionId: string) {
  return prisma.$transaction(async (tx) => {
    const submission = await tx.resultSubmission.findUniqueOrThrow({ where: { id: submissionId } });
    const match = await loadMatch(tx, submission.matchId);
    assertReviewer(actor, match);
    submissionMachine.assertTransition(submission.status, "UNDER_REVIEW");
    await tx.resultSubmission.update({
      where: { id: submissionId },
      data: { status: "UNDER_REVIEW" },
    });
    if (match.status !== "UNDER_REVIEW") {
      matchMachine.assertTransition(match.status, "UNDER_REVIEW");
      await tx.match.update({ where: { id: match.id }, data: { status: "UNDER_REVIEW" } });
    }
  });
}

function assertReviewer(actor: Actor, match: Awaited<ReturnType<typeof loadMatch>>) {
  const isHoster = canManageEvent(actor, { hosterUserId: match.round.event.hosterId });
  const isStaffReviewer = hasPermission(actor, "dispute.resolve");
  if (!isHoster && !isStaffReviewer)
    throw new ForbiddenError("Only the hoster or staff can review disputes");
  // Recusal: nobody rules on a match they played in.
  if (participants(match).includes(actor.userId))
    throw new ForbiddenError("You played in this match and must recuse");
}

/**
 * Resolve a disputed or unconfirmed submission. Hosters resolve their own
 * events first; staff handle escalations and anything involving the hoster.
 * Rejecting re-opens the match for a fresh submission.
 */
export async function resolveDispute(actor: Actor, raw: unknown) {
  const input = resolveDisputeSchema.parse(raw);
  const out = await prisma.$transaction(async (tx) => {
    const submission = await tx.resultSubmission.findUnique({ where: { id: input.submissionId } });
    if (!submission) throw new NotFoundError("Submission");
    const match = await loadMatch(tx, submission.matchId);
    assertReviewer(actor, match);
    // A hoster who submitted the disputed result cannot rule on it.
    if (submission.submittedById === actor.userId)
      throw new ForbiddenError("You submitted this result; staff must resolve the dispute");

    if (submission.status === "DISPUTED" || submission.status === "UNCONFIRMED") {
      submissionMachine.assertTransition(submission.status, "UNDER_REVIEW");
      await tx.resultSubmission.update({
        where: { id: submission.id },
        data: { status: "UNDER_REVIEW" },
      });
    }
    if (match.status === "DISPUTED" || match.status === "RESULT_PENDING") {
      matchMachine.assertTransition(match.status, "UNDER_REVIEW");
      await tx.match.update({ where: { id: match.id }, data: { status: "UNDER_REVIEW" } });
    }
    await tx.disputeResolution.create({
      data: {
        submissionId: submission.id,
        resolvedById: actor.userId,
        outcome: input.outcome,
        reason: input.reason,
      },
    });

    if (input.outcome === "VERIFIED") {
      await verifySubmissionInTx(
        tx,
        submission.id,
        match.id,
        match.round.event.id,
        submission.winningTeamId,
      );
    } else {
      submissionMachine.assertTransition("UNDER_REVIEW", "REJECTED");
      await tx.resultSubmission.update({
        where: { id: submission.id },
        data: { status: "REJECTED", resolvedAt: new Date() },
      });
      matchMachine.assertTransition("UNDER_REVIEW", "REJECTED");
      await tx.match.update({ where: { id: match.id }, data: { status: "REJECTED" } });
      await emit(tx, {
        type: "MatchRejected",
        matchId: match.id,
        submissionId: submission.id,
        eventId: match.round.event.id,
      });
    }
    if (actor.staffRole) {
      await logStaffAction(tx, {
        staffUserId: actor.userId,
        action: `dispute.${input.outcome.toLowerCase()}`,
        targetType: "match",
        targetId: match.id,
        reason: input.reason,
        metadata: { submissionId: submission.id },
      });
    }
    return match.round.event.id;
  });
  await publishEventUpdate(out, "other");
}

// ───────────── Reads ─────────────

/** Fields of a screenshot reading that are safe to show to players and reviewers (not the raw OCR text). */
const readingSelect = {
  status: true,
  confidence: true,
  filledStats: true,
  discrepancies: true,
} as const;

export interface ReadingView {
  status: string;
  filledStats: boolean;
  discrepancies: { player: string; field: string; submitted: number; read: number }[];
}

/** Turn a stored reading into display data, naming players. Null until a reading exists. */
export function readingView(
  reading: { status: string; filledStats: boolean; discrepancies: unknown } | null,
  members: { user: { id: string; displayName: string } }[],
): ReadingView | null {
  if (!reading) return null;
  const names = new Map(members.map((m) => [m.user.id, m.user.displayName]));
  const raw = Array.isArray(reading.discrepancies) ? reading.discrepancies : [];
  return {
    status: reading.status,
    filledStats: reading.filledStats,
    discrepancies: (
      raw as { playerId: string; field: string; submitted: number; read: number }[]
    ).map((d) => ({
      player: names.get(d.playerId) ?? "Unknown player",
      field: d.field,
      submitted: d.submitted,
      read: d.read,
    })),
  };
}

/** Matches awaiting this player's confirmation. */
export async function pendingConfirmationsFor(userId: string) {
  return prisma.resultSubmission.findMany({
    where: {
      status: "PENDING",
      submittedById: { not: userId },
      confirmations: { none: { playerId: userId } },
      match: {
        OR: [
          { teamA: { members: { some: { userId } } } },
          { teamB: { members: { some: { userId } } } },
        ],
      },
    },
    include: {
      stats: { include: { player: { select: { displayName: true } } } },
      reading: { select: readingSelect },
      submittedBy: { select: { displayName: true } },
      match: {
        include: {
          teamA: {
            include: {
              members: { include: { user: { select: { id: true, displayName: true } } } },
            },
          },
          teamB: {
            include: {
              members: { include: { user: { select: { id: true, displayName: true } } } },
            },
          },
          round: { include: { event: { select: { slug: true, title: true, mode: true } } } },
        },
      },
    },
    orderBy: { verificationDeadline: "asc" },
  });
}

/** Disputes and unconfirmed results the hoster (or staff) needs to rule on. */
export async function reviewQueue(actor: Actor) {
  const where: Prisma.ResultSubmissionWhereInput = {
    status: { in: ["DISPUTED", "UNCONFIRMED", "UNDER_REVIEW"] },
  };
  if (!hasPermission(actor, "dispute.resolve"))
    where.match = { round: { event: { hosterId: actor.userId } } };
  return prisma.resultSubmission.findMany({
    where,
    include: {
      submittedBy: { select: { displayName: true } },
      confirmations: { include: { player: { select: { displayName: true } } } },
      stats: { include: { player: { select: { displayName: true } } } },
      reading: { select: readingSelect },
      match: {
        include: {
          teamA: {
            include: {
              members: { include: { user: { select: { id: true, displayName: true } } } },
            },
          },
          teamB: {
            include: {
              members: { include: { user: { select: { id: true, displayName: true } } } },
            },
          },
          round: {
            include: { event: { select: { id: true, slug: true, title: true, hosterId: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function matchesForRound(roundId: string) {
  return prisma.match.findMany({
    where: { roundId },
    orderBy: { createdAt: "asc" },
    include: {
      teamA: {
        include: { members: { include: { user: { select: { id: true, displayName: true } } } } },
      },
      teamB: {
        include: { members: { include: { user: { select: { id: true, displayName: true } } } } },
      },
      submissions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        include: { confirmations: true, stats: true },
      },
    },
  });
}

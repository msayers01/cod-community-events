import { prisma, emit, type Prisma } from "@cod/db";
import type { ThrowSignal } from "@cod/shared";
import {
  eventLossStreak,
  performanceDrop,
  teammateLossPattern,
  type LossPattern,
  type PerformanceDrop,
} from "./signals.js";
import { THRESHOLDS } from "./thresholds.js";

/**
 * Throw detection. Runs in the worker after a match is verified and writes flags for
 * moderators to review. This module can only create and refresh `ThrowFlag` rows: it has
 * no path to sanctions, reports or the blacklist, so a flag can never punish anyone.
 */

interface Candidate {
  userId: string;
  signal: ThrowSignal;
  scopeKey: string;
  eventId: string;
  matchId: string;
  relatedUserId?: string;
  score: number;
  details: Prisma.InputJsonValue;
}

/** Matches P played (as part of whichever team) with their result, restricted by `where`. */
async function lossRecord(
  userId: string,
  where: Prisma.MatchWhereInput = {},
  alsoOnTeam?: string,
): Promise<{ matches: number; losses: number }> {
  const base: Prisma.MatchWhereInput = {
    AND: [{ status: "VERIFIED", winningTeamId: { not: null } }, where],
  };
  const onTeam = (): Prisma.RoundTeamWhereInput => ({
    AND: [
      { members: { some: { userId } } },
      ...(alsoOnTeam ? [{ members: { some: { userId: alsoOnTeam } } }] : []),
    ],
  });
  const [asA, asB] = await Promise.all([
    prisma.match.findMany({
      where: { AND: [base, { teamA: onTeam() }] },
      select: { teamAId: true, winningTeamId: true },
    }),
    prisma.match.findMany({
      where: { AND: [base, { teamB: onTeam() }] },
      select: { teamBId: true, winningTeamId: true },
    }),
  ]);
  return {
    matches: asA.length + asB.length,
    losses:
      asA.filter((m) => m.winningTeamId !== m.teamAId).length +
      asB.filter((m) => m.winningTeamId !== m.teamBId).length,
  };
}

async function candidatesForMatch(matchId: string): Promise<Candidate[]> {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: { include: { members: true } },
      teamB: { include: { members: true } },
      round: { include: { event: { select: { id: true, mode: true } } } },
      submissions: { where: { status: "VERIFIED" }, include: { stats: true }, take: 1 },
    },
  });
  const submission = match?.submissions[0];
  if (!match || match.status !== "VERIFIED" || !match.winningTeamId || !submission) return [];

  const eventId = match.round.event.id;
  const verifiedAt = submission.resolvedAt ?? new Date();
  const out: Candidate[] = [];

  // Only players on the losing side are assessed: every signal is about losing.
  const losers = (match.winningTeamId === match.teamAId ? match.teamB : match.teamA).members.map(
    (m) => m.userId,
  );

  for (const userId of losers) {
    // 1. Played far below their own norm.
    const stat = submission.stats.find((s) => s.playerId === userId);
    if (stat) {
      const history = await prisma.playerMatchStat.findMany({
        where: {
          playerId: userId,
          verified: true,
          matchId: { not: matchId },
          match: { round: { event: { mode: match.round.event.mode } } },
          submission: { resolvedAt: { lt: verifiedAt } },
        },
        orderBy: { submission: { resolvedAt: "desc" } },
        take: THRESHOLDS.baselineWindow,
        select: { kills: true, deaths: true },
      });
      const drop = performanceDrop({ history, current: stat, teamLost: true });
      if (drop) out.push(performanceCandidate(userId, matchId, eventId, drop));
    }

    // 2. Losing far more than usual in this event.
    const inEvent = await lossRecord(userId, { round: { eventId } });
    const elsewhere = await lossRecord(userId, { round: { eventId: { not: eventId } } });
    const streak = eventLossStreak({ ...inEvent, prior: elsewhere });
    if (streak)
      out.push(lossCandidate(userId, "EVENT_LOSS_STREAK", eventId, matchId, eventId, streak));

    // 3. Losing far more than usual with one specific teammate. The baseline is the player's
    // record without that partner, so the matches under suspicion can't excuse themselves.
    const overall = {
      matches: inEvent.matches + elsewhere.matches,
      losses: inEvent.losses + elsewhere.losses,
    };
    for (const partner of losers) {
      if (partner === userId) continue;
      const together = await lossRecord(userId, {}, partner);
      const pattern = teammateLossPattern({
        ...together,
        prior: {
          matches: overall.matches - together.matches,
          losses: overall.losses - together.losses,
        },
      });
      if (pattern)
        out.push(
          lossCandidate(
            userId,
            "TEAMMATE_LOSS_PATTERN",
            partner,
            matchId,
            eventId,
            pattern,
            partner,
          ),
        );
    }
  }
  return out;
}

function performanceCandidate(
  userId: string,
  matchId: string,
  eventId: string,
  d: PerformanceDrop,
): Candidate {
  return {
    userId,
    signal: "PERFORMANCE_DROP",
    scopeKey: matchId,
    eventId,
    matchId,
    score: d.score,
    details: {
      observedKillShare: round(d.observedShare),
      baselineKillShare: round(d.baselineShare),
      deviations: round(d.z),
      baselineMatches: d.baselineMatches,
    },
  };
}

function lossCandidate(
  userId: string,
  signal: "EVENT_LOSS_STREAK" | "TEAMMATE_LOSS_PATTERN",
  scopeKey: string,
  matchId: string,
  eventId: string,
  p: LossPattern,
  relatedUserId?: string,
): Candidate {
  return {
    userId,
    signal,
    scopeKey,
    eventId,
    matchId,
    relatedUserId,
    score: p.score,
    details: {
      matches: p.matches,
      losses: p.losses,
      usualLossRate: round(p.expectedLossRate),
      chanceByLuck: Number(p.probability.toPrecision(2)),
    },
  };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Create the flag, or refresh an unresolved one whose evidence got stronger. Idempotent. */
async function raise(c: Candidate): Promise<string | null> {
  const key = { userId: c.userId, signal: c.signal, scopeKey: c.scopeKey };
  try {
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.throwFlag.findUnique({ where: { userId_signal_scopeKey: key } });
      if (existing) {
        // Reviewed flags stay as the moderator left them; open ones track the strongest evidence.
        if (
          (existing.status === "OPEN" || existing.status === "UNDER_REVIEW") &&
          c.score > existing.score
        )
          await tx.throwFlag.update({
            where: { id: existing.id },
            data: { score: c.score, details: c.details, matchId: c.matchId },
          });
        return null;
      }
      const flag = await tx.throwFlag.create({
        data: {
          ...key,
          eventId: c.eventId,
          matchId: c.matchId,
          relatedUserId: c.relatedUserId,
          score: c.score,
          details: c.details,
        },
      });
      await emit(tx, { type: "ThrowFlagRaised", flagId: flag.id, userId: c.userId });
      return flag.id;
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return null; // raced with another worker
    throw e;
  }
}

/** Assess everyone on the losing side of a verified match. Returns the ids of newly raised flags. */
export async function detectThrowsForMatch(matchId: string): Promise<string[]> {
  const raised: string[] = [];
  for (const c of await candidatesForMatch(matchId)) {
    const id = await raise(c);
    if (id) raised.push(id);
  }
  return raised;
}

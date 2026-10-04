import { prisma, type Prisma } from "@cod/db";
import { GameMode } from "@cod/shared";
import { computeStandings, monthKey, monthWindow, type PlayerMatchResult } from "./standings.js";

/** Blacklist categories that remove a player from the standings while the entry is active. */
const DISQUALIFYING = ["CHEATING", "THROWING", "FALSIFIED_RESULTS"] as const;

const CHUNK = 500;

type Window = { start: Date; end: Date } | null;
export type Period = "MONTH" | "SEASON" | "ALL_TIME";

async function windowFor(period: Period, periodKey: string): Promise<Window | undefined> {
  if (period === "ALL_TIME") return null;
  if (period === "MONTH") return monthWindow(periodKey) ?? undefined;
  const season = await prisma.season.findUnique({ where: { id: periodKey } });
  return season ? { start: season.startsAt, end: season.endsAt } : undefined;
}

/** Verified results in the window, per game mode. Streams matches in chunks to bound memory. */
async function collect(window: Window): Promise<Map<GameMode, PlayerMatchResult[]>> {
  const out = new Map<GameMode, PlayerMatchResult[]>();
  const where: Prisma.MatchWhereInput = {
    status: "VERIFIED",
    winningTeamId: { not: null },
    submissions: {
      some: {
        status: "VERIFIED",
        ...(window && { resolvedAt: { gte: window.start, lt: window.end } }),
      },
    },
  };
  let cursor: string | undefined;
  for (;;) {
    const matches = await prisma.match.findMany({
      where,
      orderBy: { id: "asc" },
      take: CHUNK,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
      include: {
        teamA: { include: { members: { select: { userId: true } } } },
        teamB: { include: { members: { select: { userId: true } } } },
        round: { select: { event: { select: { mode: true } } } },
        submissions: { where: { status: "VERIFIED" }, take: 1, include: { stats: true } },
      },
    });
    if (matches.length === 0) break;
    for (const m of matches) {
      const stats = new Map((m.submissions[0]?.stats ?? []).map((s) => [s.playerId, s]));
      const list = out.get(m.round.event.mode as GameMode) ?? [];
      for (const team of [m.teamA, m.teamB])
        for (const { userId } of team.members) {
          const s = stats.get(userId);
          list.push({
            userId,
            won: team.id === m.winningTeamId,
            kills: s?.kills ?? 0,
            deaths: s?.deaths ?? 0,
          });
        }
      out.set(m.round.event.mode as GameMode, list);
    }
    cursor = matches[matches.length - 1]!.id;
    if (matches.length < CHUNK) break;
  }
  return out;
}

/** Users who can't appear on a board right now: banned, suspended, or actively blacklisted for foul play. */
async function ineligible(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const [users, listed] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: userIds }, status: { in: ["BANNED", "SUSPENDED"] } },
      select: { id: true },
    }),
    prisma.blacklistEntry.findMany({
      where: { userId: { in: userIds }, status: "ACTIVE", category: { in: [...DISQUALIFYING] } },
      select: { userId: true },
    }),
  ]);
  return new Set([...users.map((u) => u.id), ...listed.map((l) => l.userId)]);
}

/**
 * Recompute one board from scratch and swap it in. Idempotent, so it is safe to run on
 * every verified match and again on a schedule. Returns how many players were ranked.
 */
export async function refreshLeaderboard(period: Period, periodKey: string): Promise<number> {
  const window = await windowFor(period, periodKey);
  if (window === undefined) return 0; // unknown month key or deleted season
  const byMode = await collect(window);
  const everyone = [...new Set([...byMode.values()].flat().map((r) => r.userId))];
  const out = await ineligible(everyone);

  let ranked = 0;
  await prisma.$transaction(async (tx) => {
    await tx.leaderboardEntry.deleteMany({ where: { period, periodKey } });
    for (const mode of Object.values(GameMode)) {
      const standings = computeStandings(
        (byMode.get(mode) ?? []).filter((r) => !out.has(r.userId)),
      );
      if (standings.length === 0) continue;
      await tx.leaderboardEntry.createMany({
        data: standings.map((s) => ({ period, periodKey, mode, ...s })),
      });
      ranked += standings.length;
    }
  });
  return ranked;
}

/** Boards a verified result at `at` can change: its month, any season covering it, and the all-time board. */
export async function boardsAffectedBy(at: Date): Promise<{ period: Period; periodKey: string }[]> {
  const seasons = await prisma.season.findMany({
    where: { startsAt: { lte: at }, endsAt: { gt: at } },
    select: { id: true },
  });
  return [
    { period: "MONTH", periodKey: monthKey(at) },
    ...seasons.map((s) => ({ period: "SEASON" as const, periodKey: s.id })),
    { period: "ALL_TIME", periodKey: "all" },
  ];
}

export interface BoardRef {
  period: Period;
  periodKey: string;
}

/** Refresh the month and season boards after a match is verified (all-time waits for the sweep). Returns what was rebuilt. */
export async function refreshForMatch(matchId: string): Promise<BoardRef[]> {
  const sub = await prisma.resultSubmission.findFirst({
    where: { matchId, status: "VERIFIED" },
    select: { resolvedAt: true },
  });
  if (!sub?.resolvedAt) return [];
  const boards = (await boardsAffectedBy(sub.resolvedAt)).filter((b) => b.period !== "ALL_TIME");
  for (const b of boards) await refreshLeaderboard(b.period, b.periodKey);
  return boards;
}

/** Periodic recalculation: this month, live and just-ended seasons, and the all-time board. Returns what was rebuilt. */
export async function sweepLeaderboards(now = new Date()): Promise<BoardRef[]> {
  const seasons = await prisma.season.findMany({
    where: { startsAt: { lte: now }, endsAt: { gt: new Date(now.getTime() - 86_400_000) } },
    select: { id: true },
  });
  const boards: BoardRef[] = [{ period: "MONTH", periodKey: monthKey(now) }];
  // Late disputes from last month resolve with their own resolvedAt, so refresh it for a couple of days.
  if (now.getUTCDate() <= 2)
    boards.push({
      period: "MONTH",
      periodKey: monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))),
    });
  boards.push(...seasons.map((s) => ({ period: "SEASON" as const, periodKey: s.id })));
  boards.push({ period: "ALL_TIME", periodKey: "all" });
  for (const b of boards) await refreshLeaderboard(b.period, b.periodKey);
  return boards;
}

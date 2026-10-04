import { prisma, emit } from "@cod/db";
import {
  createSeasonSchema,
  hasPermission,
  type Actor,
  type GameMode,
  type LeaderboardPeriod,
} from "@cod/shared";
import { monthKey, monthWindow } from "@cod/core";
import { DomainError, ForbiddenError } from "@/lib/errors";
import { logStaffAction } from "@/modules/moderation/audit";

export { monthKey, MIN_RANKED_MATCHES, POINTS } from "@cod/core";

export interface BoardRef {
  period: LeaderboardPeriod;
  periodKey: string;
  label: string;
}

/** Boards a visitor can pick: this and last month, every season, all time. */
export async function listBoards(now = new Date()): Promise<BoardRef[]> {
  const seasons = await prisma.season.findMany({ orderBy: { startsAt: "desc" }, take: 12 });
  const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const monthLabel = (d: Date) =>
    d.toLocaleString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
  return [
    { period: "MONTH", periodKey: monthKey(now), label: monthLabel(now) },
    { period: "MONTH", periodKey: monthKey(prev), label: monthLabel(prev) },
    ...seasons.map((s) => ({ period: "SEASON" as const, periodKey: s.id, label: s.name })),
    { period: "ALL_TIME", periodKey: "all", label: "All time" },
  ];
}

/** Pre-calculated standings. Reads one indexed slice; nothing is computed per page view. */
export async function getLeaderboard(
  period: LeaderboardPeriod,
  periodKey: string,
  mode: GameMode,
  limit = 100,
) {
  const [entries, updated] = await Promise.all([
    prisma.leaderboardEntry.findMany({
      where: { period, periodKey, mode },
      orderBy: { rank: "asc" },
      take: limit,
      include: { user: { select: { id: true, displayName: true, avatarUpdatedAt: true } } },
    }),
    prisma.leaderboardEntry.aggregate({
      where: { period, periodKey, mode },
      _max: { updatedAt: true },
    }),
  ]);
  return { entries, updatedAt: updated._max.updatedAt };
}

/** A player's standing on the current month's boards, for their profile. */
export async function standingsForUser(userId: string, now = new Date()) {
  return prisma.leaderboardEntry.findMany({
    where: { userId, period: "MONTH", periodKey: monthKey(now) },
    orderBy: { mode: "asc" },
    select: { mode: true, rank: true, points: true, wins: true, matches: true },
  });
}

export function isValidMonthKey(key: string): boolean {
  return monthWindow(key) !== null;
}

// ───────────── Seasons (admin) ─────────────

export async function listSeasons() {
  return prisma.season.findMany({
    orderBy: { startsAt: "desc" },
    include: { createdBy: { select: { displayName: true } } },
  });
}

/** Define a season. Seasons never overlap, so a result belongs to at most one. */
export async function createSeason(actor: Actor, raw: unknown) {
  if (!hasPermission(actor, "season.manage")) throw new ForbiddenError();
  const input = createSeasonSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const clash = await tx.season.findFirst({
      where: { startsAt: { lt: input.endsAt }, endsAt: { gt: input.startsAt } },
      select: { name: true },
    });
    if (clash) throw new DomainError("SEASON_OVERLAP", `That overlaps the season "${clash.name}"`);
    if (await tx.season.findUnique({ where: { name: input.name } }))
      throw new DomainError("SEASON_NAME", "A season with that name already exists");
    const season = await tx.season.create({
      data: {
        name: input.name,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        createdById: actor.userId,
      },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "season.created",
      targetType: "season",
      targetId: season.id,
      reason: input.reason,
      metadata: { startsAt: input.startsAt.toISOString(), endsAt: input.endsAt.toISOString() },
    });
    // Results already verified inside the window count, so build the board right away.
    await emit(tx, {
      type: "LeaderboardRefreshRequested",
      period: "SEASON",
      periodKey: season.id,
    });
    return season;
  });
}

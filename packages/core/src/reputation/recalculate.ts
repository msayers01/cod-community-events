import { prisma } from "@cod/db";
import { computeHosterTier, qualifiesVerifiedPlayer, type BadgeKind } from "@cod/shared";

/**
 * Recompute a user's pre-calculated reputation summary, hoster tier and
 * automatic badges. Idempotent; called by the worker on relevant events.
 */
export async function recalculateReputation(userId: string) {
  const [
    user,
    played,
    hosted,
    payouts,
    noShows,
    stats,
    ratings,
    confirmationsAsked,
    confirmationsAnswered,
    reviews,
    sanctions,
    activeBlacklist,
    firstEvent,
  ] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      include: { hosterProfile: true, staffRole: true, accounts: { select: { id: true } } },
    }),
    prisma.registration.count({
      where: {
        playerId: userId,
        status: "IN_POOL",
        event: { status: { in: ["COMPLETED", "ARCHIVED"] } },
      },
    }),
    prisma.event.count({ where: { hosterId: userId, status: { in: ["COMPLETED", "ARCHIVED"] } } }),
    prisma.payoutConfirmation.groupBy({
      by: ["response"],
      where: { event: { hosterId: userId } },
      _count: true,
    }),
    prisma.registration.count({ where: { playerId: userId, status: "NO_SHOW" } }),
    prisma.playerMatchStat.aggregate({
      where: { playerId: userId, verified: true },
      _count: true,
      _sum: { kills: true, deaths: true, plants: true, defuses: true, hillTimeSeconds: true },
    }),
    prisma.teammateRating.aggregate({
      where: { ratedId: userId },
      _count: true,
      _avg: { communication: true, effort: true },
    }),
    prisma.resultSubmission.count({
      where: {
        status: { in: ["VERIFIED", "REJECTED", "UNCONFIRMED", "UNDER_REVIEW"] },
        submittedById: { not: userId },
        match: {
          OR: [
            { teamA: { members: { some: { userId } } } },
            { teamB: { members: { some: { userId } } } },
          ],
        },
      },
    }),
    prisma.confirmation.count({ where: { playerId: userId } }),
    prisma.hosterReview.aggregate({
      where: { event: { hosterId: userId }, hidden: false },
      _count: true,
      _avg: { organization: true, communication: true, fairness: true },
    }),
    prisma.sanction.count({ where: { userId, type: { in: ["SUSPENSION", "PERMANENT_BAN"] } } }),
    prisma.blacklistEntry.count({ where: { userId, status: "ACTIVE" } }),
    prisma.event.findFirst({
      where: { hosterId: userId, status: { in: ["COMPLETED", "ARCHIVED"] } },
      orderBy: { completedAt: "asc" },
      select: { completedAt: true },
    }),
  ]);
  if (!user) return;

  const wins = await prisma.match.count({
    where: { status: "VERIFIED", winningTeam: { members: { some: { userId } } } },
  });
  const wouldPlayAgain =
    ratings._count > 0
      ? await prisma.teammateRating.count({ where: { ratedId: userId, wouldPlayAgain: true } })
      : 0;
  const byResponse = Object.fromEntries(payouts.map((p) => [p.response, p._count])) as Record<
    string,
    number
  >;

  const summary = {
    eventsPlayed: played,
    eventsHosted: hosted,
    confirmedPayouts: byResponse.PAID ?? 0,
    deniedPayouts: byResponse.NOT_PAID ?? 0,
    noShows,
    verifiedMatches: stats._count,
    verifiedWins: wins,
    kills: stats._sum.kills ?? 0,
    deaths: stats._sum.deaths ?? 0,
    plants: stats._sum.plants ?? 0,
    defuses: stats._sum.defuses ?? 0,
    hillTimeSeconds: stats._sum.hillTimeSeconds ?? 0,
    ratingCount: ratings._count,
    wouldPlayAgainPct: ratings._count > 0 ? (100 * wouldPlayAgain) / ratings._count : null,
    communicationAvg: ratings._avg.communication,
    effortAvg: ratings._avg.effort,
    confirmationsAsked,
    confirmationsAnswered,
    reviewCount: reviews._count,
    organizationAvg: reviews._avg.organization,
    hosterCommunicationAvg: reviews._avg.communication,
    fairnessAvg: reviews._avg.fairness,
  };

  await prisma.$transaction(async (tx) => {
    await tx.reputationSummary.upsert({
      where: { userId },
      update: summary,
      create: { userId, ...summary },
    });

    // Hoster tier (automatic unless staff set it manually)
    if (user.hosterProfile && !user.hosterProfile.tierSetManually) {
      const tier = computeHosterTier({
        completedEvents: hosted,
        confirmedPayouts: summary.confirmedPayouts,
        deniedPayouts: summary.deniedPayouts,
        firstEventAt: firstEvent?.completedAt ?? null,
      });
      if (tier !== user.hosterProfile.tier)
        await tx.hosterProfile.update({ where: { userId }, data: { tier } });
    }

    // Automatic badges
    const wanted = new Set<BadgeKind>();
    if (user.staffRole?.role === "FOUNDER") wanted.add("FOUNDER");
    else if (user.staffRole?.role === "ADMIN") wanted.add("ADMIN");
    else if (user.staffRole) wanted.add("MODERATOR");
    if (user.hosterProfile) {
      const tier = (await tx.hosterProfile.findUniqueOrThrow({ where: { userId } })).tier;
      wanted.add(
        tier === "TRUSTED"
          ? "TRUSTED_HOSTER"
          : tier === "VERIFIED"
            ? "VERIFIED_HOSTER"
            : "NEW_HOSTER",
      );
      if (user.hosterProfile.foundingHoster) wanted.add("FOUNDING_HOSTER");
    }
    if (
      qualifiesVerifiedPlayer({
        linkedAccounts: user.accounts.length,
        eventsPlayed: played,
        sanctions,
        activeBlacklist: activeBlacklist > 0,
      })
    )
      wanted.add("VERIFIED_PLAYER");

    const current = await tx.userBadge.findMany({ where: { userId } });
    for (const b of current) {
      if (b.source === "AUTOMATIC" && !wanted.has(b.badge))
        await tx.userBadge.delete({ where: { userId_badge: { userId, badge: b.badge } } });
    }
    for (const badge of wanted) {
      if (!current.some((b) => b.badge === badge))
        await tx.userBadge.create({ data: { userId, badge, source: "AUTOMATIC" } });
    }
  });
}

import { prisma } from "@cod/db";
import type { DomainEvent, StaffRole } from "@cod/shared";
import {
  detectThrowsForMatch,
  recalculateReputation,
  refreshForMatch,
  refreshLeaderboard,
  type Period,
} from "@cod/core";
import { hasPermission } from "@cod/shared";

/**
 * Reactions to domain events. Each handler must be idempotent: the outbox
 * processor may deliver an event more than once after a crash.
 */
export type Handler = (event: DomainEvent) => Promise<void>;

async function notify(userId: string, type: string, title: string, body = "", href?: string) {
  // Idempotency: one notification per (user, type, href) within a short window is enough for MVP.
  const recent = await prisma.notification.findFirst({
    where: { userId, type, href: href ?? null, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent) return;
  await prisma.notification.create({ data: { userId, type, title, body, href } });
}

export const handlers: Partial<Record<DomainEvent["type"], Handler[]>> = {
  PlayerMarkedPaid: [
    async (e) => {
      if (e.type !== "PlayerMarkedPaid") return;
      const event = await prisma.event.findUnique({
        where: { id: e.eventId },
        select: { title: true, slug: true },
      });
      if (!event) return;
      await notify(
        e.userId,
        "payment_confirmed",
        `You're confirmed for ${event.title}`,
        "The hoster marked you as paid.",
        `/events/${event.slug}`,
      );
    },
  ],
  RegistrationWithdrawn: [promoteNextOnWaitlistNotice],
  RegistrationRemoved: [promoteNextOnWaitlistNotice],
  CheckInOpened: [
    async (e) => {
      if (e.type !== "CheckInOpened") return;
      const event = await prisma.event.findUnique({
        where: { id: e.eventId },
        select: {
          title: true,
          slug: true,
          registrations: { where: { status: "CONFIRMED" }, select: { playerId: true } },
        },
      });
      if (!event) return;
      for (const r of event.registrations) {
        await notify(
          r.playerId,
          "check_in_open",
          `Check-in is open for ${event.title}`,
          "Check in now to keep your spot.",
          `/events/${event.slug}`,
        );
      }
    },
  ],
  CheckInClosed: [
    async (e) => {
      if (e.type !== "CheckInClosed") return;
      const event = await prisma.event.findUnique({
        where: { id: e.eventId },
        select: {
          title: true,
          slug: true,
          registrations: { where: { status: "NO_SHOW" }, select: { playerId: true } },
        },
      });
      if (!event) return;
      for (const r of event.registrations) {
        await notify(
          r.playerId,
          "no_show",
          `You were marked as a no-show for ${event.title}`,
          "No-shows are recorded on your profile.",
          `/events/${event.slug}`,
        );
      }
    },
  ],
  EventCompleted: [
    async (e) => {
      if (e.type !== "EventCompleted") return;
      // Payout confirmation prompts go to winners once results exist (Phase 2 wires winners).
      // For now, record the deadline window so the reminder job has something to work from.
      await prisma.event.findUnique({ where: { id: e.eventId }, select: { id: true } });
    },
  ],
  EventPublished: [
    async (e) => {
      if (e.type !== "EventPublished") return;
      // Discord posting is handled by the bot process reading the same outbox type (see apps/bot).
      console.log(`[worker] event published ${e.eventId}`);
    },
  ],
};

async function notifyStaff(type: string, title: string, body: string, href: string) {
  const staff = await prisma.staffRole.findMany({ select: { userId: true } });
  for (const s of staff) await notify(s.userId, type, title, body, href);
}

const moreHandlers: Partial<Record<DomainEvent["type"], Handler[]>> = {
  WinnersRecorded: [
    async (e) => {
      if (e.type !== "WinnersRecorded") return;
      const pcs = await prisma.payoutConfirmation.findMany({
        where: { eventId: e.eventId, response: "NO_RESPONSE" },
        include: { event: { select: { title: true } } },
      });
      for (const pc of pcs) {
        await notify(
          pc.winnerId,
          "payout_confirm",
          `Did you get paid for ${pc.event.title}?`,
          `You placed #${pc.place}. Confirm whether the hoster paid you.`,
          "/payouts",
        );
      }
    },
  ],
  PayoutConfirmed: [
    async (e) => {
      if (e.type !== "PayoutConfirmed") return;
      const event = await prisma.event.findUnique({
        where: { id: e.eventId },
        select: { title: true, slug: true, hosterId: true },
      });
      if (!event) return;
      await notify(
        event.hosterId,
        "payout_confirmed",
        `A winner confirmed their payout for ${event.title}`,
        "This adds to your public payout record.",
        `/events/${event.slug}`,
      );
    },
  ],
  PayoutDenied: [
    async (e) => {
      if (e.type !== "PayoutDenied") return;
      const pc = await prisma.payoutConfirmation.findUnique({
        where: { id: e.payoutConfirmationId },
        include: { event: { select: { id: true, title: true, slug: true, hosterId: true } } },
      });
      if (!pc) return;
      // Idempotent: one auto-report per payout confirmation.
      const marker = `[auto:payout:${pc.id}]`;
      const existing = await prisma.report.findFirst({
        where: { description: { startsWith: marker } },
      });
      if (!existing) {
        const report = await prisma.report.create({
          data: {
            reporterId: pc.winnerId,
            reportedUserId: pc.event.hosterId,
            eventId: pc.event.id,
            category: "NON_PAYMENT",
            description: `${marker} Winner (#${pc.place}) reported not being paid for "${pc.event.title}".${pc.note ? ` Note: ${pc.note}` : ""}`,
            status: "SUBMITTED",
          },
        });
        await notifyStaff(
          "report_filed",
          "Non-payment report opened automatically",
          `Winner of ${pc.event.title} reported not being paid.`,
          `/staff/reports/${report.id}`,
        );
        await notify(
          pc.winnerId,
          "report_filed",
          "We opened a non-payment report for you",
          "Staff will review it. You can add evidence from your reports page.",
          "/account/reports",
        );
      }
    },
  ],
  ReportFiled: [
    async (e) => {
      if (e.type !== "ReportFiled") return;
      const report = await prisma.report.findUnique({
        where: { id: e.reportId },
        include: { reportedUser: { select: { displayName: true } } },
      });
      if (!report) return;
      await notifyStaff(
        "report_filed",
        `New ${report.category.toLowerCase().replace(/_/g, " ")} report`,
        `About ${report.reportedUser.displayName}.`,
        `/staff/reports/${report.id}`,
      );
    },
  ],
  ReportStatusChanged: [
    async (e) => {
      if (e.type !== "ReportStatusChanged") return;
      const report = await prisma.report.findUnique({ where: { id: e.reportId } });
      if (!report) return;
      if (e.status === "AWAITING_RESPONSE") {
        await notify(
          report.reportedUserId,
          "report_response",
          "A report about you needs your response",
          "Give your side and attach evidence before staff decide.",
          "/account/reports",
        );
      }
      if (e.status === "ACTIONED" || e.status === "DISMISSED") {
        await notify(
          report.reporterId,
          "report_closed",
          `Your report was ${e.status === "ACTIONED" ? "actioned" : "dismissed"}`,
          report.resolution ?? "",
          "/account/reports",
        );
        if (e.status === "ACTIONED")
          await notify(
            report.reportedUserId,
            "report_closed",
            "A report about you was closed with action",
            "See your sanctions in your reports page.",
            "/account/reports",
          );
      }
    },
  ],
  SanctionIssued: [
    async (e) => {
      if (e.type !== "SanctionIssued") return;
      const s = await prisma.sanction.findUnique({ where: { id: e.sanctionId } });
      if (!s) return;
      const what =
        s.type === "WARNING"
          ? "You received a warning"
          : s.type === "SUSPENSION"
            ? "Your account is suspended"
            : "Your account is permanently banned";
      await notify(
        e.userId,
        "sanction",
        what,
        s.reason + (s.endsAt ? ` Until ${s.endsAt.toISOString().slice(0, 10)}.` : ""),
        "/account/reports",
      );
    },
  ],
};
Object.assign(handlers, moreHandlers);

// ───────────── Phase 2 ─────────────

async function matchContext(matchId: string) {
  return prisma.match.findUnique({
    where: { id: matchId },
    include: {
      teamA: { include: { members: true } },
      teamB: { include: { members: true } },
      round: {
        include: { event: { select: { id: true, slug: true, title: true, hosterId: true } } },
      },
    },
  });
}

/** Ask the worker (via outbox) to recalculate reputation for a set of users. */
async function recalcLater(userIds: Iterable<string>) {
  for (const userId of new Set(userIds))
    await prisma.outboxEvent.create({ data: { type: "ReputationChanged", payload: { userId } } });
}

const phase2Handlers: Partial<Record<DomainEvent["type"], Handler[]>> = {
  ResultSubmitted: [
    async (e) => {
      if (e.type !== "ResultSubmitted") return;
      const m = await matchContext(e.matchId);
      const sub = await prisma.resultSubmission.findUnique({ where: { id: e.submissionId } });
      if (!m || !sub) return;
      for (const member of [...m.teamA.members, ...m.teamB.members]) {
        if (member.userId === sub.submittedById) continue;
        await notify(
          member.userId,
          "confirm_result",
          `Confirm the result for round ${m.round.roundNumber} of ${m.round.event.title}`,
          "One tap to confirm, or dispute with a reason. The window closes in 24 hours.",
          "/confirmations",
        );
      }
    },
  ],
  ResultDisputed: [
    async (e) => {
      if (e.type !== "ResultDisputed") return;
      const m = await matchContext(e.matchId);
      if (!m) return;
      await notify(
        m.round.event.hosterId,
        "dispute",
        `A result in ${m.round.event.title} was disputed`,
        `Round ${m.round.roundNumber}. Review it from your dashboard after the stream.`,
        `/dashboard/events/${m.round.event.id}/disputes`,
      );
    },
  ],
  MatchVerified: [
    async (e) => {
      if (e.type !== "MatchVerified") return;
      const m = await matchContext(e.matchId);
      if (!m) return;
      const members = [...m.teamA.members, ...m.teamB.members].map((x) => x.userId);
      for (const userId of members) {
        await notify(
          userId,
          "match_verified",
          `Result verified: round ${m.round.roundNumber} of ${m.round.event.title}`,
          "Your stats now count. Rate your teammates while it's fresh.",
          "/ratings",
        );
      }
      await recalcLater(members);
    },
  ],
  MatchRejected: [
    async (e) => {
      if (e.type !== "MatchRejected") return;
      const m = await matchContext(e.matchId);
      if (!m) return;
      for (const member of [...m.teamA.members, ...m.teamB.members]) {
        await notify(
          member.userId,
          "match_rejected",
          `Result rejected: round ${m.round.roundNumber} of ${m.round.event.title}`,
          "The submitted result was rejected after review. A fresh result can be submitted.",
          `/events/${m.round.event.slug}`,
        );
      }
    },
  ],
  TeammateRated: [
    async (e) => {
      if (e.type === "TeammateRated") await recalcLater([e.ratedId]);
    },
  ],
  HosterReviewed: [
    async (e) => {
      if (e.type === "HosterReviewed") await recalcLater([e.hosterId]);
    },
  ],
  PayoutConfirmed: [
    async (e) => {
      if (e.type === "PayoutConfirmed")
        await recalcLater([
          (
            await prisma.event.findUniqueOrThrow({
              where: { id: e.eventId },
              select: { hosterId: true },
            })
          ).hosterId,
        ]);
    },
  ],
  PayoutDenied: [
    async (e) => {
      if (e.type === "PayoutDenied")
        await recalcLater([
          (
            await prisma.event.findUniqueOrThrow({
              where: { id: e.eventId },
              select: { hosterId: true },
            })
          ).hosterId,
        ]);
    },
  ],
  EventCompleted: [
    async (e) => {
      if (e.type !== "EventCompleted") return;
      const event = await prisma.event.findUnique({
        where: { id: e.eventId },
        select: {
          title: true,
          slug: true,
          hosterId: true,
          registrations: { where: { status: "IN_POOL" }, select: { playerId: true } },
        },
      });
      if (!event) return;
      for (const r of event.registrations) {
        await notify(
          r.playerId,
          "review_hoster",
          `How was ${event.title}?`,
          "Rate the hoster's organization, communication and fairness. Only participants can review.",
          `/events/${event.slug}/review`,
        );
      }
      await recalcLater([event.hosterId, ...event.registrations.map((r) => r.playerId)]);
    },
  ],
  CheckInClosed: [
    async (e) => {
      if (e.type !== "CheckInClosed") return;
      const noShows = await prisma.registration.findMany({
        where: { eventId: e.eventId, status: "NO_SHOW" },
        select: { playerId: true },
      });
      await recalcLater(noShows.map((r) => r.playerId));
    },
  ],
  SanctionIssued: [
    async (e) => {
      if (e.type === "SanctionIssued") await recalcLater([e.userId]);
    },
  ],
  BlacklistEntryProposed: [
    async (e) => {
      if (e.type !== "BlacklistEntryProposed") return;
      await notifyStaff(
        "blacklist_proposed",
        "Blacklist entry awaiting approval",
        "A second moderator must review and approve.",
        "/staff/blacklist",
      );
    },
  ],
  BlacklistEntryActivated: [
    async (e) => {
      if (e.type !== "BlacklistEntryActivated") return;
      await notify(
        e.userId,
        "blacklisted",
        "A verified report about you is now public",
        "You can appeal this decision from your account.",
        "/account/appeals",
      );
      await recalcLater([e.userId]);
    },
  ],
  BlacklistEntryRemoved: [
    async (e) => {
      if (e.type === "BlacklistEntryRemoved") await recalcLater([e.userId]);
    },
  ],
  AppealFiled: [
    async (e) => {
      if (e.type !== "AppealFiled") return;
      await notifyStaff(
        "appeal_filed",
        "New appeal",
        "Must be handled by a moderator not involved in the original decision.",
        "/staff/appeals",
      );
    },
  ],
  AppealDecided: [
    async (e) => {
      if (e.type !== "AppealDecided") return;
      await notify(
        e.appellantId,
        "appeal_decided",
        `Your appeal was ${e.status === "OVERTURNED" ? "upheld: the decision was overturned" : "denied"}`,
        "",
        "/account/appeals",
      );
      await recalcLater([e.appellantId]);
    },
  ],
  ReputationChanged: [
    async (e) => {
      if (e.type !== "ReputationChanged") return;
      await recalculateReputation(e.userId);
    },
  ],
};
// Merge: Phase 2 handlers run after Phase 1 handlers for the same event type.
for (const [type, hs] of Object.entries(phase2Handlers) as [DomainEvent["type"], Handler[]][]) {
  handlers[type] = [...(handlers[type] ?? []), ...hs];
}

async function promoteNextOnWaitlistNotice(e: DomainEvent) {
  if (e.type !== "RegistrationWithdrawn" && e.type !== "RegistrationRemoved") return;
  const next = await prisma.registration.findFirst({
    where: { eventId: e.eventId, status: "WAITLISTED" },
    orderBy: { waitlistPosition: "asc" },
    include: { event: { select: { title: true, slug: true, playerCap: true } } },
  });
  if (!next) return;
  const occupied = await prisma.registration.count({
    where: { eventId: e.eventId, status: { in: ["CONFIRMED", "CHECKED_IN", "IN_POOL"] } },
  });
  if (occupied >= next.event.playerCap) return;
  // The spot is held by payment, so promotion means telling the next player a spot opened.
  await notify(
    next.playerId,
    "spot_opened",
    `A spot opened in ${next.event.title}`,
    "Pay the hoster to lock it in.",
    `/events/${next.event.slug}`,
  );
}

// ───────────── Phase 3 ─────────────

/** Notify staff whose role carries a permission (a trial moderator has no business seeing throw flags). */
async function notifyWithPermission(
  permission: Parameters<typeof hasPermission>[1],
  type: string,
  title: string,
  body: string,
  href: string,
) {
  const staff = await prisma.staffRole.findMany({ select: { userId: true, role: true } });
  for (const s of staff)
    if (
      hasPermission(
        { userId: s.userId, staffRole: s.role as StaffRole, isHoster: false },
        permission,
      )
    )
      await notify(s.userId, type, title, body, href);
}

const phase3Handlers: Partial<Record<DomainEvent["type"], Handler[]>> = {
  MatchVerified: [
    // Throw detection: reads verified history and may raise flags for moderators. Never sanctions.
    async (e) => {
      if (e.type === "MatchVerified") await detectThrowsForMatch(e.matchId);
    },
    // Month and season boards refresh now; the all-time board follows on the schedule.
    async (e) => {
      if (e.type === "MatchVerified") await refreshForMatch(e.matchId);
    },
  ],
  ThrowFlagRaised: [
    async (e) => {
      if (e.type !== "ThrowFlagRaised") return;
      // Deliberately vague: no player name, signal or numbers in a notification.
      await notifyWithPermission(
        "throwflag.review",
        "throw_flag",
        "A new throw-detection flag is waiting for review",
        "Open the queue to see what was observed.",
        "/staff/flags",
      );
    },
  ],
  LeaderboardRefreshRequested: [
    async (e) => {
      if (e.type === "LeaderboardRefreshRequested")
        await refreshLeaderboard(e.period as Period, e.periodKey);
    },
  ],
  ScreenshotRead: [
    async (e) => {
      if (e.type !== "ScreenshotRead") return;
      const [reading, m] = await Promise.all([
        prisma.screenshotReading.findUnique({ where: { submissionId: e.submissionId } }),
        matchContext(e.matchId),
      ]);
      const sub = await prisma.resultSubmission.findUnique({ where: { id: e.submissionId } });
      if (!reading || !m || !sub || sub.status !== "PENDING") return;
      const discrepancies = Array.isArray(reading.discrepancies) ? reading.discrepancies.length : 0;
      if (!reading.filledStats && discrepancies === 0) return;
      const body = reading.filledStats
        ? "The scoreboard was read automatically to fill in the stats. Check they match the screenshot before you confirm."
        : "The scoreboard reading disagrees with some submitted stats. Compare them with the screenshot before you confirm.";
      for (const member of [...m.teamA.members, ...m.teamB.members]) {
        if (member.userId === sub.submittedById) continue;
        await notify(
          member.userId,
          "screenshot_read",
          `Check the stats for round ${m.round.roundNumber} of ${m.round.event.title}`,
          body,
          "/confirmations",
        );
      }
    },
  ],
};
for (const [type, hs] of Object.entries(phase3Handlers) as [DomainEvent["type"], Handler[]][]) {
  handlers[type] = [...(handlers[type] ?? []), ...hs];
}

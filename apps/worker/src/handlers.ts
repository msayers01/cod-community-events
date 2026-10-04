import { prisma } from "@cod/db";
import type { DomainEvent } from "@cod/shared";

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

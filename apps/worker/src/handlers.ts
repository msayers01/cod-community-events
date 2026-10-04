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

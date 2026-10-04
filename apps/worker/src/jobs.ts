import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma, emit } from "@cod/db";
import { createPublisher, rooms, type Publisher } from "@cod/realtime";

let publisher: Publisher | null = null;
const rt = () => (publisher ??= createPublisher());

export const QUEUE = "cod-timers";

export type TimerJob =
  | { kind: "open-check-in"; eventId: string }
  | { kind: "sweep-check-in" }
  | { kind: "sweep-payout-reminders" };

export function redis() {
  return new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    maxRetriesPerRequest: null,
  });
}

export function timerQueue(connection: Redis) {
  return new Queue<TimerJob>(QUEUE, { connection });
}

/**
 * Scheduled work. Every job is idempotent: it re-reads state and only acts when
 * the state still calls for it.
 */
export async function handleTimer(job: Job<TimerJob>) {
  const data = job.data;
  if (data.kind === "sweep-check-in") {
    // Open check-in for any OPEN event whose window has started. Replaces per-event delayed jobs
    // for now; the hoster can also open it manually from the dashboard.
    const due = await prisma.event.findMany({
      where: { status: "OPEN", checkInOpensAt: { lte: new Date() } },
      select: { id: true },
    });
    for (const e of due) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.event.findUnique({ where: { id: e.id }, select: { status: true } });
        if (fresh?.status !== "OPEN") return;
        await tx.event.update({ where: { id: e.id }, data: { status: "CHECK_IN" } });
        await emit(tx, { type: "CheckInOpened", eventId: e.id });
      });
      await publishStatus(e.id);
    }
    return;
  }
  if (data.kind === "sweep-payout-reminders") {
    // Remind winners who have not answered and are within 2 days of the deadline. Once per confirmation.
    const soon = new Date(Date.now() + 2 * 86400_000);
    const due = await prisma.payoutConfirmation.findMany({
      where: {
        response: "NO_RESPONSE",
        reminderSentAt: null,
        deadline: { lte: soon, gte: new Date() },
      },
      include: { event: { select: { title: true } } },
    });
    for (const pc of due) {
      await prisma.$transaction(async (tx) => {
        const fresh = await tx.payoutConfirmation.findUnique({
          where: { id: pc.id },
          select: { reminderSentAt: true, response: true },
        });
        if (!fresh || fresh.reminderSentAt || fresh.response !== "NO_RESPONSE") return;
        await tx.notification.create({
          data: {
            userId: pc.winnerId,
            type: "payout_reminder",
            title: `Reminder: confirm your payout for ${pc.event.title}`,
            body: "The confirmation window closes soon.",
            href: "/payouts",
          },
        });
        await tx.payoutConfirmation.update({
          where: { id: pc.id },
          data: { reminderSentAt: new Date() },
        });
      });
    }
    return;
  }
}

export function startTimerWorker(connection: Redis) {
  return new Worker<TimerJob>(QUEUE, handleTimer, { connection });
}

/** Best-effort push of an event's new status and counts to anyone watching it. */
async function publishStatus(eventId: string) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    select: { status: true, registrations: { select: { status: true } } },
  });
  if (!event) return;
  const count = (...s: string[]) => event.registrations.filter((r) => s.includes(r.status)).length;
  await rt().publish({
    room: rooms.event(eventId),
    event: "event.updated",
    data: {
      eventId,
      status: event.status,
      confirmedCount: count("CONFIRMED", "CHECKED_IN", "IN_POOL"),
      waitlistCount: count("WAITLISTED"),
      checkedInCount: count("CHECKED_IN", "IN_POOL"),
      reason: "status",
    },
  });
}

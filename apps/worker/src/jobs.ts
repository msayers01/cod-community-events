import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import { prisma, emit } from "@cod/db";

export const QUEUE = "cod-timers";

export type TimerJob = { kind: "open-check-in"; eventId: string } | { kind: "sweep-check-in" };

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
    }
    return;
  }
}

export function startTimerWorker(connection: Redis) {
  return new Worker<TimerJob>(QUEUE, handleTimer, { connection });
}

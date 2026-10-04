import { prisma } from "@cod/db";
import type { DomainEvent } from "@cod/shared";
import { handlers } from "./handlers.js";

const BATCH = 50;
const MAX_ATTEMPTS = 5;

/** Claim a batch of pending outbox rows and run their handlers. Safe to run concurrently. */
export async function processOutboxBatch(): Promise<number> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "outbox_event" SET status = 'PROCESSING', attempts = attempts + 1
    WHERE id IN (
      SELECT id FROM "outbox_event"
      WHERE status = 'PENDING' OR (status = 'PROCESSING' AND "createdAt" < now() - interval '5 minutes')
      ORDER BY "createdAt" ASC LIMIT ${BATCH} FOR UPDATE SKIP LOCKED
    ) RETURNING id`;
  if (rows.length === 0) return 0;

  const events = await prisma.outboxEvent.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
  });
  for (const row of events) {
    const event = { type: row.type, ...(row.payload as object) } as DomainEvent;
    try {
      for (const h of handlers[event.type] ?? []) await h(event);
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: "DONE", processedAt: new Date() },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[outbox] ${row.type} ${row.id} failed (attempt ${row.attempts}): ${message}`);
      await prisma.outboxEvent.update({
        where: { id: row.id },
        data: { status: row.attempts >= MAX_ATTEMPTS ? "FAILED" : "PENDING", lastError: message },
      });
    }
  }
  return events.length;
}

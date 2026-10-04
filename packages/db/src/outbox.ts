import type { DomainEvent } from "@cod/shared";
import type { Prisma } from "../generated/prisma/client.js";

/**
 * Append a domain event to the outbox inside the caller's transaction.
 * Usage: await prisma.$transaction(async (tx) => { ...; await emit(tx, { type: "...", ... }); })
 */
export async function emit(tx: Prisma.TransactionClient, event: DomainEvent): Promise<void> {
  const { type, ...payload } = event;
  await tx.outboxEvent.create({ data: { type, payload } });
}

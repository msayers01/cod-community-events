import { prisma, emit, type Prisma } from "@cod/db";
import {
  canManageEvent,
  commit,
  deriveResult,
  roundMachine,
  type Actor,
  type SpinPool,
  type SpinResult,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";

/**
 * Step 1: publish a commitment for the next round. The pool is snapshotted from
 * players currently IN_POOL. The secret is stored but not exposed until reveal.
 */
export async function commitSpin(actor: Actor, eventId: string) {
  return prisma.$transaction(async (tx) => {
    const event = await tx.event.findUnique({
      where: { id: eventId },
      include: { rounds: { orderBy: { roundNumber: "desc" }, take: 1, include: { spin: true } } },
    });
    if (!event) throw new NotFoundError("Event");
    if (!canManageEvent(actor, { hosterUserId: event.hosterId })) throw new ForbiddenError();
    if (event.status !== "LIVE")
      throw new DomainError("NOT_LIVE", "Start the event before spinning");

    const last = event.rounds[0];
    if (last && last.status !== "COMPLETE") {
      if (last.spin && last.spin.status === "COMMITTED") return last.spin; // idempotent: commitment already published
      throw new DomainError("ROUND_OPEN", `Round ${last.roundNumber} is still in progress`);
    }
    const roundNumber = (last?.roundNumber ?? 0) + 1;
    if (event.roundCount && roundNumber > event.roundCount)
      throw new DomainError("NO_MORE_ROUNDS", "All rounds have been played");

    const poolRegs = await tx.registration.findMany({
      where: { eventId, status: "IN_POOL" },
      select: { playerId: true },
    });
    if (poolRegs.length < event.teamSize * 2)
      throw new DomainError("POOL_TOO_SMALL", "Need at least two full teams in the pool");

    const pool: SpinPool = {
      playerIds: poolRegs.map((r) => r.playerId).sort(),
      teamSize: event.teamSize,
    };
    const c = commit(pool);
    const round = await tx.round.create({ data: { eventId, roundNumber } });
    const spin = await tx.spin.create({
      data: {
        eventId,
        roundId: round.id,
        pool: pool as unknown as Prisma.InputJsonValue,
        poolHash: c.poolHash,
        commitment: c.commitment,
        secret: c.secret,
        triggeredById: actor.userId,
      },
    });
    await emit(tx, { type: "SpinCommitted", eventId, roundId: round.id, spinId: spin.id });
    return spin;
  });
}

/**
 * Step 2: the hoster triggers the spin. The server derives the result from the
 * committed secret, creates the round's teams, and reveals the secret.
 */
export async function executeSpin(actor: Actor, spinId: string) {
  return prisma.$transaction(async (tx) => {
    const spin = await tx.spin.findUnique({
      where: { id: spinId },
      include: { event: true, round: true },
    });
    if (!spin) throw new NotFoundError("Spin");
    if (!canManageEvent(actor, { hosterUserId: spin.event.hosterId })) throw new ForbiddenError();
    if (spin.status !== "COMMITTED") return spin; // idempotent
    roundMachine.assertTransition(spin.round.status, "SPUN");

    const pool = spin.pool as unknown as SpinPool;
    const result: SpinResult = deriveResult(spin.secret, pool);
    const now = new Date();

    for (const [i, members] of result.teams.entries()) {
      await tx.roundTeam.create({
        data: {
          roundId: spin.roundId,
          label: `Team ${String.fromCharCode(65 + i)}`,
          members: { create: members.map((userId) => ({ userId })) },
        },
      });
    }
    await tx.round.update({ where: { id: spin.roundId }, data: { status: "SPUN" } });
    const updated = await tx.spin.update({
      where: { id: spinId },
      data: {
        result: result as unknown as Prisma.InputJsonValue,
        status: "REVEALED",
        revealedSecret: spin.secret,
        spunAt: now,
        revealedAt: now,
      },
    });
    await emit(tx, { type: "SpinCompleted", eventId: spin.eventId, roundId: spin.roundId, spinId });
    return updated;
  });
}

export async function completeRound(actor: Actor, roundId: string) {
  return prisma.$transaction(async (tx) => {
    const round = await tx.round.findUnique({ where: { id: roundId }, include: { event: true } });
    if (!round) throw new NotFoundError("Round");
    if (!canManageEvent(actor, { hosterUserId: round.event.hosterId })) throw new ForbiddenError();
    if (round.status === "SPUN") {
      roundMachine.assertTransition("SPUN", "IN_PROGRESS");
      await tx.round.update({ where: { id: roundId }, data: { status: "IN_PROGRESS" } });
    }
    roundMachine.assertTransition("IN_PROGRESS", "COMPLETE");
    return tx.round.update({ where: { id: roundId }, data: { status: "COMPLETE" } });
  });
}

/** Public overlay payload. Never includes an unrevealed secret. */
export async function overlayState(overlayKey: string) {
  const event = await prisma.event.findUnique({
    where: { overlayKey },
    select: {
      id: true,
      title: true,
      status: true,
      teamSize: true,
      registrations: {
        where: { status: "IN_POOL" },
        select: { player: { select: { id: true, displayName: true } } },
      },
      rounds: { orderBy: { roundNumber: "desc" }, take: 1, include: { spin: true } },
    },
  });
  if (!event) return null;
  const names = new Map(event.registrations.map((r) => [r.player.id, r.player.displayName]));
  const round = event.rounds[0] ?? null;
  const spin = round?.spin ?? null;
  const result = spin?.result as unknown as SpinResult | null;
  return {
    eventId: event.id,
    title: event.title,
    status: event.status,
    teamSize: event.teamSize,
    pool: [...names.values()].sort(),
    round: round ? { number: round.roundNumber, status: round.status } : null,
    spin: spin
      ? {
          id: spin.id,
          status: spin.status,
          commitment: spin.commitment,
          poolHash: spin.poolHash,
          revealedSecret: spin.revealedSecret,
          spunAt: spin.spunAt,
          teams: result?.teams.map((t) => t.map((id) => names.get(id) ?? id)) ?? null,
        }
      : null,
  };
}

import { prisma, emit, type Prisma } from "@cod/db";
import {
  canManageEvent,
  commit,
  deriveResult,
  pairCounts,
  roundMachine,
  skillRating,
  type Actor,
  type RandomizationMode,
  type SpinPool,
  type SpinResult,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { publishEventUpdate } from "@/modules/realtime/publish";

/**
 * Snapshot everything the event's team-formation mode needs into the pool, so it is
 * covered by the commitment and published with the spin. Fully random pools carry
 * nothing extra.
 */
async function snapshotPool(
  tx: Prisma.TransactionClient,
  event: { id: string; teamSize: number; randomization: RandomizationMode },
  playerIds: string[],
): Promise<SpinPool> {
  const base = { playerIds, teamSize: event.teamSize };
  if (event.randomization === "SKILL_BALANCED") {
    const summaries = await tx.reputationSummary.findMany({
      where: { userId: { in: playerIds } },
      select: {
        userId: true,
        verifiedMatches: true,
        verifiedWins: true,
        kills: true,
        deaths: true,
      },
    });
    const bySummary = new Map(summaries.map((s) => [s.userId, s]));
    return {
      ...base,
      mode: "SKILL_BALANCED",
      ratings: playerIds.map((id) => [id, skillRating(bySummary.get(id))] as const),
    };
  }
  if (event.randomization === "NO_REPEAT_TEAMMATES") {
    const prior = await tx.roundTeam.findMany({
      where: { round: { eventId: event.id } },
      include: { members: { select: { userId: true } } },
    });
    return {
      ...base,
      mode: "NO_REPEAT_TEAMMATES",
      teammateCounts: pairCounts(
        prior.map((t) => t.members.map((m) => m.userId)),
        playerIds,
      ),
    };
  }
  return base;
}

/**
 * Step 1: publish a commitment for the next round. The pool is snapshotted from
 * players currently IN_POOL. The secret is stored but not exposed until reveal.
 */
export async function commitSpin(actor: Actor, eventId: string) {
  const result = await prisma.$transaction(async (tx) => {
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

    const playerIds = poolRegs.map((r) => r.playerId).sort();
    const pool = await snapshotPool(tx, event, playerIds);
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
  await publishEventUpdate(result.eventId, "spin");
  return result;
}

/**
 * Step 2: the hoster triggers the spin. The server derives the result from the
 * committed secret, creates the round's teams, and reveals the secret.
 */
export async function executeSpin(actor: Actor, spinId: string) {
  const result = await prisma.$transaction(async (tx) => {
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
  await publishEventUpdate(result.eventId, "spin");
  return result;
}

export async function completeRound(actor: Actor, roundId: string) {
  const result = await prisma.$transaction(async (tx) => {
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
  await publishEventUpdate(result.eventId, "spin");
  return result;
}

export { overlayState } from "./overlay-state";

import { prisma, emit, type Prisma } from "@cod/db";
import {
  hasPermission,
  recusalReason,
  throwFlagActionSchema,
  throwFlagMachine,
  type Actor,
  type CaseInvolvement,
  type ThrowFlagStatus,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logStaffAction } from "@/modules/moderation/audit";

/**
 * Throw-detection review queue (staff only).
 *
 * Flags are raised by the worker when a verified match looks odd. They are leads for a
 * moderator, not findings: nothing here sanctions or blacklists anyone. Escalating opens
 * an ordinary THROWING report, which goes through the normal report lifecycle, the
 * accused's right to respond, evidence rules and two-person approval for blacklisting.
 *
 * Nothing in this module is reachable from a public page, and flags are never shown to
 * the player they concern, so the detection criteria stay private.
 */

function assertMayReview(actor: Actor) {
  if (!hasPermission(actor, "throwflag.review")) throw new ForbiddenError();
}

async function involvement(
  flag: { userId: string; relatedUserId: string | null; eventId: string | null },
  staffUserId: string,
): Promise<CaseInvolvement> {
  const [event, conflicts] = await Promise.all([
    flag.eventId
      ? prisma.event.findUnique({
          where: { id: flag.eventId },
          select: { hosterId: true, registrations: { select: { playerId: true } } },
        })
      : null,
    prisma.conflictDeclaration.findMany({
      where: { staffUserId },
      select: { conflictedUserId: true },
    }),
  ]);
  return {
    involvedUserIds: [flag.userId, ...(flag.relatedUserId ? [flag.relatedUserId] : [])],
    eventHosterUserId: event?.hosterId ?? null,
    eventParticipantUserIds: event?.registrations.map((r) => r.playerId) ?? [],
    declaredConflictUserIds: conflicts.map((c) => c.conflictedUserId),
  };
}

async function assertMayAct(actor: Actor, flagId: string) {
  assertMayReview(actor);
  const flag = await prisma.throwFlag.findUnique({ where: { id: flagId } });
  if (!flag) throw new NotFoundError("Flag");
  const reason = recusalReason(actor, await involvement(flag, actor.userId));
  if (reason)
    throw new ForbiddenError(`You must recuse from this case (${reason.replace("_", " ")})`);
  return flag;
}

// ───────────── Reads ─────────────

export async function listFlags(actor: Actor, status?: ThrowFlagStatus) {
  assertMayReview(actor);
  return prisma.throwFlag.findMany({
    where: status ? { status } : { status: { in: ["OPEN", "UNDER_REVIEW"] } },
    orderBy: [{ status: "asc" }, { score: "desc" }, { createdAt: "asc" }],
    include: {
      user: { select: { id: true, displayName: true } },
      relatedUser: { select: { id: true, displayName: true } },
    },
    take: 200,
  });
}

/** One flag with the surrounding picture a moderator needs: other flags and any THROWING reports. */
export async function getFlag(actor: Actor, flagId: string) {
  assertMayReview(actor);
  const flag = await prisma.throwFlag.findUnique({
    where: { id: flagId },
    include: {
      user: { select: { id: true, displayName: true, activisionId: true, status: true } },
      relatedUser: { select: { id: true, displayName: true } },
      reviewedBy: { select: { displayName: true } },
    },
  });
  if (!flag) throw new NotFoundError("Flag");
  const [event, match, otherFlags, reports, log, recusal] = await Promise.all([
    flag.eventId
      ? prisma.event.findUnique({
          where: { id: flag.eventId },
          select: { id: true, title: true, slug: true, mode: true },
        })
      : null,
    flag.matchId
      ? prisma.match.findUnique({
          where: { id: flag.matchId },
          include: {
            round: { select: { roundNumber: true } },
            submissions: {
              where: { status: "VERIFIED" },
              take: 1,
              select: { id: true, screenshotUrl: true, scoreA: true, scoreB: true },
            },
          },
        })
      : null,
    prisma.throwFlag.findMany({
      where: { userId: flag.userId, id: { not: flag.id } },
      orderBy: { createdAt: "desc" },
      select: { id: true, signal: true, status: true, score: true, createdAt: true },
    }),
    prisma.report.findMany({
      where: { reportedUserId: flag.userId, category: "THROWING" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, createdAt: true },
    }),
    prisma.staffActionLog.findMany({
      where: { targetType: "throw_flag", targetId: flagId },
      orderBy: { createdAt: "asc" },
    }),
    involvement(flag, actor.userId).then((c) => recusalReason(actor, c)),
  ]);
  return { flag, event, match, otherFlags, reports, log, recusal };
}

// ───────────── Actions ─────────────

async function move(
  actor: Actor,
  raw: unknown,
  to: ThrowFlagStatus,
  extra?: (
    tx: Prisma.TransactionClient,
    flag: { id: string; userId: string; eventId: string | null; matchId: string | null },
  ) => Promise<Partial<Prisma.ThrowFlagUpdateInput>>,
) {
  const input = throwFlagActionSchema.parse(raw);
  await assertMayAct(actor, input.flagId);
  return prisma.$transaction(async (tx) => {
    const flag = await tx.throwFlag.findUniqueOrThrow({ where: { id: input.flagId } });
    throwFlagMachine.assertTransition(flag.status, to);
    const resolved = to === "DISMISSED" || to === "ESCALATED";
    const updated = await tx.throwFlag.update({
      where: { id: flag.id },
      data: {
        status: to,
        reviewedBy: { connect: { id: actor.userId } },
        reviewNote: input.reason,
        resolvedAt: resolved ? new Date() : null,
        ...(extra ? await extra(tx, flag) : {}),
      },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: `throw_flag.${to.toLowerCase()}`,
      targetType: "throw_flag",
      targetId: flag.id,
      reason: input.reason,
      metadata: { from: flag.status, to, subjectUserId: flag.userId },
    });
    await emit(tx, { type: "ThrowFlagReviewed", flagId: flag.id, status: to });
    return updated;
  });
}

/** Take the flag: it moves to under review. */
export async function startReview(actor: Actor, raw: unknown) {
  return move(actor, raw, "UNDER_REVIEW");
}

/** Nothing to see here. The flag is closed and the player is never told it existed. */
export async function dismissFlag(actor: Actor, raw: unknown) {
  return move(actor, raw, "DISMISSED");
}

/**
 * Open a THROWING report from the flag. The report starts at "submitted" like any other,
 * carries the verified scoreboard as evidence, and from there the normal process applies.
 * The description is deliberately generic: it never repeats detection numbers.
 */
export async function escalateFlag(actor: Actor, raw: unknown) {
  return move(actor, raw, "ESCALATED", async (tx, flag) => {
    const input = throwFlagActionSchema.parse(raw);
    const submission = flag.matchId
      ? await tx.resultSubmission.findFirst({
          where: { matchId: flag.matchId, status: "VERIFIED" },
          select: { screenshotUrl: true, screenshotKey: true },
        })
      : null;
    const report = await tx.report.create({
      data: {
        reporterId: actor.userId,
        reportedUserId: flag.userId,
        eventId: flag.eventId,
        matchId: flag.matchId,
        category: "THROWING",
        description: `Opened by staff after match results in this event were referred for review. Reviewer's note: ${input.reason}`,
        evidence:
          submission && (submission.screenshotUrl || submission.screenshotKey)
            ? {
                create: {
                  type: "SCREENSHOT",
                  url: submission.screenshotUrl,
                  storageKey: submission.screenshotKey,
                  note: "Verified scoreboard from the match under review",
                  submittedById: actor.userId,
                },
              }
            : undefined,
      },
    });
    await emit(tx, {
      type: "ReportFiled",
      reportId: report.id,
      reportedUserId: flag.userId,
    });
    return { reportId: report.id };
  });
}

export { DomainError };

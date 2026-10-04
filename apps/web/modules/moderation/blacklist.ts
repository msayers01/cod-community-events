import { prisma, emit, type Prisma } from "@cod/db";
import {
  appealMachine,
  blacklistMachine,
  BLACKLIST_DEFAULT_EXPIRY_DAYS,
  canGiveSecondApproval,
  canHandleAppeal,
  decideAppealSchema,
  fileAppealSchema,
  hasPermission,
  proposeBlacklistSchema,
  recusalReason,
  type Actor,
  type BlacklistStatus,
  type CaseInvolvement,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logStaffAction } from "./audit";

/**
 * Public blacklist. Entries are proposed by staff, need two different
 * non-recused moderators to approve, and go public only then. Lesser
 * categories expire. The accused must have had the chance to respond
 * (the linked report must have passed Awaiting Response) and can appeal.
 */

async function involvementFor(
  userId: string,
  reportId: string | null,
  staffUserId: string,
): Promise<CaseInvolvement> {
  const conflicts = await prisma.conflictDeclaration.findMany({
    where: { staffUserId },
    select: { conflictedUserId: true },
  });
  const report = reportId
    ? await prisma.report.findUnique({
        where: { id: reportId },
        include: {
          event: { select: { hosterId: true, registrations: { select: { playerId: true } } } },
        },
      })
    : null;
  return {
    involvedUserIds: [userId, ...(report ? [report.reporterId] : [])],
    eventHosterUserId: report?.event?.hosterId ?? null,
    eventParticipantUserIds: report?.event?.registrations.map((r) => r.playerId) ?? [],
    declaredConflictUserIds: conflicts.map((c) => c.conflictedUserId),
  };
}

export async function proposeEntry(actor: Actor, raw: unknown) {
  const input = proposeBlacklistSchema.parse(raw);
  if (!hasPermission(actor, "blacklist.recommend")) throw new ForbiddenError();
  const inv = await involvementFor(input.userId, input.reportId ?? null, actor.userId);
  const recused = recusalReason(actor, inv);
  if (recused) throw new ForbiddenError(`You must recuse (${recused.replace("_", " ")})`);

  if (input.reportId) {
    const report = await prisma.report.findUnique({ where: { id: input.reportId } });
    if (!report || report.reportedUserId !== input.userId)
      throw new DomainError("REPORT_MISMATCH", "That report is not about this user");
    if (!report.respondedAt && !report.responseDeadline) {
      throw new DomainError(
        "NO_RIGHT_TO_RESPOND",
        "The reported user must be given the chance to respond before a blacklist entry is proposed",
      );
    }
    if (report.responseDeadline && !report.respondedAt && report.responseDeadline > new Date()) {
      throw new DomainError("RESPONSE_WINDOW_OPEN", "The response window is still open");
    }
  }

  const days = input.expiresInDays ?? BLACKLIST_DEFAULT_EXPIRY_DAYS[input.category];
  const expiresAt = days ? new Date(Date.now() + days * 86400_000) : null;

  return prisma.$transaction(async (tx) => {
    const entry = await tx.blacklistEntry.create({
      data: {
        userId: input.userId,
        category: input.category,
        publicWording: input.publicWording,
        reportId: input.reportId,
        proposedById: actor.userId,
        expiresAt,
        // A moderator's proposal counts as the first approval; a trial mod's does not.
        status: hasPermission(actor, "blacklist.approve") ? "AWAITING_SECOND_APPROVAL" : "PROPOSED",
      },
    });
    if (hasPermission(actor, "blacklist.approve"))
      await tx.blacklistApproval.create({ data: { entryId: entry.id, staffUserId: actor.userId } });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "blacklist.proposed",
      targetType: "blacklist",
      targetId: entry.id,
      reason: input.reason,
      metadata: { userId: input.userId, category: input.category },
    });
    await emit(tx, { type: "BlacklistEntryProposed", entryId: entry.id, userId: input.userId });
    return entry;
  });
}

/** Approve a proposed entry. The second distinct, non-recused moderator's approval activates it. */
export async function approveEntry(actor: Actor, entryId: string, reason: string) {
  if (!hasPermission(actor, "blacklist.approve"))
    throw new ForbiddenError("Only moderators can approve blacklist entries");
  return prisma.$transaction(async (tx) => {
    const entry = await tx.blacklistEntry.findUnique({
      where: { id: entryId },
      include: { approvals: true },
    });
    if (!entry) throw new NotFoundError("Blacklist entry");
    if (entry.status !== "PROPOSED" && entry.status !== "AWAITING_SECOND_APPROVAL")
      throw new DomainError("NOT_PENDING", "This entry is not awaiting approval");
    const inv = await involvementFor(entry.userId, entry.reportId, actor.userId);
    const first = entry.approvals[0];
    if (first) {
      if (!canGiveSecondApproval(actor, first.staffUserId, inv))
        throw new ForbiddenError(
          "A different, non-recused moderator must give the second approval",
        );
    } else {
      const recused = recusalReason(actor, inv);
      if (recused) throw new ForbiddenError(`You must recuse (${recused.replace("_", " ")})`);
    }
    if (entry.approvals.some((a) => a.staffUserId === actor.userId))
      throw new DomainError("ALREADY_APPROVED", "You already approved this entry");

    await tx.blacklistApproval.create({ data: { entryId, staffUserId: actor.userId } });
    const approvals = entry.approvals.length + 1;
    let status: BlacklistStatus;
    if (approvals === 1) {
      blacklistMachine.assertTransition(entry.status, "AWAITING_SECOND_APPROVAL");
      status = "AWAITING_SECOND_APPROVAL";
    } else {
      blacklistMachine.assertTransition(entry.status, "ACTIVE");
      status = "ACTIVE";
    }
    const updated = await tx.blacklistEntry.update({
      where: { id: entryId },
      data: { status, activatedAt: status === "ACTIVE" ? new Date() : undefined },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: status === "ACTIVE" ? "blacklist.activated" : "blacklist.approved",
      targetType: "blacklist",
      targetId: entryId,
      reason,
    });
    if (status === "ACTIVE") {
      await emit(tx, { type: "BlacklistEntryActivated", entryId, userId: entry.userId });
      await tx.registration.updateMany({
        where: { playerId: entry.userId, status: { in: ["WAITLISTED", "CONFIRMED"] } },
        data: { blacklistFlagged: true },
      });
    }
    return updated;
  });
}

/** Remove an entry (withdraw a proposal, or lift an active one after an appeal or an admin decision). */
export async function removeEntry(actor: Actor, entryId: string, reason: string) {
  if (!hasPermission(actor, "blacklist.approve")) throw new ForbiddenError();
  return prisma.$transaction(async (tx) => {
    const entry = await tx.blacklistEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundError("Blacklist entry");
    if (entry.status === "ACTIVE" && !hasPermission(actor, "appeal.final"))
      throw new ForbiddenError("Active entries are lifted through an appeal or by an admin");
    blacklistMachine.assertTransition(entry.status, "REMOVED");
    const updated = await tx.blacklistEntry.update({
      where: { id: entryId },
      data: { status: "REMOVED", removedAt: new Date(), removedReason: reason },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "blacklist.removed",
      targetType: "blacklist",
      targetId: entryId,
      reason,
    });
    await emit(tx, { type: "BlacklistEntryRemoved", entryId, userId: entry.userId });
    return updated;
  });
}

export { expireBlacklistEntries as expireEntries } from "@cod/core";

/** Public read: active entries only, worded carefully, attributed to "staff". */
export async function publicBlacklist(take = 100) {
  return prisma.blacklistEntry.findMany({
    where: { status: "ACTIVE" },
    orderBy: { activatedAt: "desc" },
    take,
    select: {
      id: true,
      category: true,
      publicWording: true,
      activatedAt: true,
      expiresAt: true,
      user: { select: { displayName: true } },
    },
  });
}

export async function activeEntriesFor(userId: string) {
  return prisma.blacklistEntry.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, category: true, publicWording: true, activatedAt: true, expiresAt: true },
  });
}

export async function pendingEntries(actor: Actor) {
  if (!hasPermission(actor, "blacklist.recommend")) throw new ForbiddenError();
  return prisma.blacklistEntry.findMany({
    where: { status: { in: ["PROPOSED", "AWAITING_SECOND_APPROVAL"] } },
    include: {
      user: { select: { displayName: true } },
      proposedBy: { select: { displayName: true } },
      approvals: { include: { staffUser: { select: { displayName: true } } } },
      report: { select: { id: true, category: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

// ───────────── Appeals ─────────────

export async function fileAppeal(actor: Actor, raw: unknown) {
  const input = fileAppealSchema.parse(raw);
  // The appellant must be the subject of what they appeal.
  if (input.target === "BLACKLIST_ENTRY") {
    const e = await prisma.blacklistEntry.findUnique({ where: { id: input.targetId } });
    if (!e || e.userId !== actor.userId) throw new NotFoundError("Blacklist entry");
    if (e.status !== "ACTIVE")
      throw new DomainError("NOT_ACTIVE", "Only active entries can be appealed");
  } else if (input.target === "SANCTION") {
    const s = await prisma.sanction.findUnique({ where: { id: input.targetId } });
    if (!s || s.userId !== actor.userId) throw new NotFoundError("Sanction");
  } else {
    const r = await prisma.disputeResolution.findUnique({
      where: { id: input.targetId },
      include: {
        submission: {
          include: {
            match: {
              include: {
                teamA: { include: { members: true } },
                teamB: { include: { members: true } },
              },
            },
          },
        },
      },
    });
    const inMatch =
      r &&
      [...r.submission.match.teamA.members, ...r.submission.match.teamB.members].some(
        (m) => m.userId === actor.userId,
      );
    if (!inMatch) throw new NotFoundError("Dispute ruling");
  }
  const existing = await prisma.appeal.findUnique({
    where: {
      appellantId_target_targetId: {
        appellantId: actor.userId,
        target: input.target,
        targetId: input.targetId,
      },
    },
  });
  if (existing)
    throw new DomainError("ALREADY_APPEALED", "You have already appealed this decision");
  return prisma.$transaction(async (tx) => {
    const appeal = await tx.appeal.create({
      data: {
        appellantId: actor.userId,
        target: input.target,
        targetId: input.targetId,
        statement: input.statement,
        evidence: input.evidence as Prisma.InputJsonValue,
      },
    });
    await emit(tx, { type: "AppealFiled", appealId: appeal.id, appellantId: actor.userId });
    return appeal;
  });
}

/** Staff involved in the original decision. */
async function originalDeciders(target: string, targetId: string): Promise<string[]> {
  if (target === "BLACKLIST_ENTRY") {
    const e = await prisma.blacklistEntry.findUnique({
      where: { id: targetId },
      include: { approvals: true },
    });
    return e ? [e.proposedById, ...e.approvals.map((a) => a.staffUserId)] : [];
  }
  if (target === "SANCTION") {
    const s = await prisma.sanction.findUnique({ where: { id: targetId } });
    return s ? [s.issuedById] : [];
  }
  const r = await prisma.disputeResolution.findUnique({ where: { id: targetId } });
  return r ? [r.resolvedById] : [];
}

export async function takeAppeal(actor: Actor, appealId: string, reason: string) {
  const appeal = await prisma.appeal.findUnique({ where: { id: appealId } });
  if (!appeal) throw new NotFoundError("Appeal");
  const deciders = await originalDeciders(appeal.target, appeal.targetId);
  const inv = await involvementFor(appeal.appellantId, null, actor.userId);
  if (!canHandleAppeal(actor, deciders, inv))
    throw new ForbiddenError(
      "Appeals must be handled by a moderator not involved in the original decision",
    );
  return prisma.$transaction(async (tx) => {
    appealMachine.assertTransition(appeal.status, "UNDER_REVIEW");
    const updated = await tx.appeal.update({
      where: { id: appealId },
      data: { status: "UNDER_REVIEW", handledById: actor.userId },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "appeal.taken",
      targetType: "appeal",
      targetId: appealId,
      reason,
    });
    return updated;
  });
}

/** Decide an appeal. Overturning lifts the underlying decision. Final rulings on blacklist entries need an admin. */
export async function decideAppeal(actor: Actor, raw: unknown) {
  const input = decideAppealSchema.parse(raw);
  const appeal = await prisma.appeal.findUnique({ where: { id: input.appealId } });
  if (!appeal) throw new NotFoundError("Appeal");
  if (appeal.handledById !== actor.userId && !hasPermission(actor, "appeal.final"))
    throw new ForbiddenError("Only the handling moderator or an admin can decide this appeal");
  const deciders = await originalDeciders(appeal.target, appeal.targetId);
  if (deciders.includes(actor.userId))
    throw new ForbiddenError("You were involved in the original decision");
  return prisma.$transaction(async (tx) => {
    appealMachine.assertTransition(appeal.status, input.decision);
    const updated = await tx.appeal.update({
      where: { id: input.appealId },
      data: {
        status: input.decision,
        decisionReason: input.reason,
        decidedAt: new Date(),
        handledById: appeal.handledById ?? actor.userId,
      },
    });
    if (input.decision === "OVERTURNED") {
      if (appeal.target === "BLACKLIST_ENTRY") {
        await tx.blacklistEntry.update({
          where: { id: appeal.targetId },
          data: {
            status: "REMOVED",
            removedAt: new Date(),
            removedReason: `Overturned on appeal: ${input.reason}`,
          },
        });
        await emit(tx, {
          type: "BlacklistEntryRemoved",
          entryId: appeal.targetId,
          userId: appeal.appellantId,
        });
      } else if (appeal.target === "SANCTION") {
        await tx.sanction.update({ where: { id: appeal.targetId }, data: { endsAt: new Date() } });
        const still = await tx.sanction.count({
          where: {
            userId: appeal.appellantId,
            type: { in: ["SUSPENSION", "PERMANENT_BAN"] },
            OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }],
          },
        });
        if (still === 0)
          await tx.user.update({ where: { id: appeal.appellantId }, data: { status: "ACTIVE" } });
      }
      // Dispute rulings: the match is re-opened by rejecting the verified submission is out of scope here; staff re-run resolveDispute.
    }
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: `appeal.${input.decision.toLowerCase()}`,
      targetType: "appeal",
      targetId: input.appealId,
      reason: input.reason,
    });
    await emit(tx, {
      type: "AppealDecided",
      appealId: input.appealId,
      appellantId: appeal.appellantId,
      status: input.decision,
    });
    return updated;
  });
}

export async function appealQueue(actor: Actor) {
  if (!hasPermission(actor, "appeal.decide")) throw new ForbiddenError();
  return prisma.appeal.findMany({
    where: { status: { in: ["SUBMITTED", "UNDER_REVIEW"] } },
    include: {
      appellant: { select: { displayName: true } },
      handledBy: { select: { displayName: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function myAppeals(userId: string) {
  return prisma.appeal.findMany({ where: { appellantId: userId }, orderBy: { createdAt: "desc" } });
}

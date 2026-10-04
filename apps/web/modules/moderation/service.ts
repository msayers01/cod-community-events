import { prisma, emit, type Prisma } from "@cod/db";
import {
  accusedResponseSchema,
  canIssueSanction,
  createReportSchema,
  hasPermission,
  isStaff,
  recusalReason,
  reportMachine,
  sanctionSchema,
  staffNoteSchema,
  type Actor,
  type CaseInvolvement,
  type EvidenceItem,
  type ReportStatus,
} from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logStaffAction } from "./audit";

export const ACCUSED_RESPONSE_WINDOW_DAYS = 3;

// ───────────── Filing ─────────────

export async function fileReport(actor: Actor, raw: unknown) {
  if (!hasPermission(actor, "report.file")) throw new ForbiddenError();
  const input = createReportSchema.parse(raw);
  if (input.reportedUserId === actor.userId)
    throw new DomainError("SELF_REPORT", "You cannot report yourself");
  const reported = await prisma.user.findUnique({
    where: { id: input.reportedUserId },
    select: { id: true },
  });
  if (!reported) throw new NotFoundError("User");

  // Rate limit: at most 5 open reports by one reporter at a time.
  const open = await prisma.report.count({
    where: { reporterId: actor.userId, status: { notIn: ["ACTIONED", "DISMISSED"] } },
  });
  if (open >= 5)
    throw new DomainError(
      "TOO_MANY_REPORTS",
      "You have too many open reports. Wait for staff to review them.",
    );

  return prisma.$transaction(async (tx) => {
    const report = await tx.report.create({
      data: {
        reporterId: actor.userId,
        reportedUserId: input.reportedUserId,
        eventId: input.eventId,
        matchId: input.matchId,
        category: input.category,
        description: input.description,
        evidence: { create: input.evidence.map((e) => evidenceData(e, actor.userId)) },
      },
    });
    await emit(tx, {
      type: "ReportFiled",
      reportId: report.id,
      reportedUserId: input.reportedUserId,
    });
    return report;
  });
}

function evidenceData(e: EvidenceItem, submittedById: string) {
  return { type: e.type, url: e.url, storageKey: e.storageKey, note: e.note, submittedById };
}

/** The accused may respond once while the report is awaiting their response. */
export async function respondAsAccused(actor: Actor, raw: unknown) {
  const input = accusedResponseSchema.parse(raw);
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.findUnique({ where: { id: input.reportId } });
    if (!report || report.reportedUserId !== actor.userId) throw new NotFoundError("Report");
    if (report.status !== "AWAITING_RESPONSE")
      throw new DomainError("NOT_AWAITING", "This report is not open for a response");
    if (report.accusedResponse)
      throw new DomainError("ALREADY_RESPONDED", "You have already responded");
    const updated = await tx.report.update({
      where: { id: report.id },
      data: {
        accusedResponse: input.statement,
        respondedAt: new Date(),
        status: "UNDER_REVIEW",
        evidence: { create: input.evidence.map((e) => evidenceData(e, actor.userId)) },
      },
    });
    await emit(tx, { type: "ReportStatusChanged", reportId: report.id, status: "UNDER_REVIEW" });
    return updated;
  });
}

// ───────────── Staff review ─────────────

async function involvement(reportId: string, staffUserId: string): Promise<CaseInvolvement> {
  const report = await prisma.report.findUniqueOrThrow({
    where: { id: reportId },
    include: {
      event: { select: { hosterId: true, registrations: { select: { playerId: true } } } },
    },
  });
  const conflicts = await prisma.conflictDeclaration.findMany({
    where: { staffUserId },
    select: { conflictedUserId: true },
  });
  return {
    involvedUserIds: [report.reporterId, report.reportedUserId],
    eventHosterUserId: report.event?.hosterId ?? null,
    eventParticipantUserIds: report.event?.registrations.map((r) => r.playerId) ?? [],
    declaredConflictUserIds: conflicts.map((c) => c.conflictedUserId),
  };
}

async function assertMayReview(actor: Actor, reportId: string) {
  if (!hasPermission(actor, "report.review")) throw new ForbiddenError();
  const reason = recusalReason(actor, await involvement(reportId, actor.userId));
  if (reason)
    throw new ForbiddenError(`You must recuse from this case (${reason.replace("_", " ")})`);
}

export async function listReportQueue(actor: Actor, status?: ReportStatus) {
  if (!hasPermission(actor, "report.review")) throw new ForbiddenError();
  return prisma.report.findMany({
    where: status ? { status } : { status: { notIn: ["ACTIONED", "DISMISSED"] } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: {
      reporter: { select: { displayName: true } },
      reportedUser: { select: { displayName: true } },
      assignedStaff: { select: { displayName: true } },
      event: { select: { title: true, slug: true } },
      _count: { select: { evidence: true } },
    },
  });
}

export async function getReportForStaff(actor: Actor, reportId: string) {
  if (!hasPermission(actor, "report.review")) throw new ForbiddenError();
  const report = await prisma.report.findUnique({
    where: { id: reportId },
    include: {
      reporter: { select: { id: true, displayName: true } },
      reportedUser: {
        select: {
          id: true,
          displayName: true,
          activisionId: true,
          status: true,
          sanctions: { orderBy: { createdAt: "desc" } },
          staffNotes: {
            orderBy: { createdAt: "desc" },
            include: { author: { select: { displayName: true } } },
          },
          _count: {
            select: { reportsReceived: true, registrations: { where: { status: "NO_SHOW" } } },
          },
        },
      },
      assignedStaff: { select: { id: true, displayName: true } },
      event: { select: { id: true, title: true, slug: true, hosterId: true } },
      evidence: {
        include: { submittedBy: { select: { displayName: true } } },
        orderBy: { createdAt: "asc" },
      },
      sanctions: true,
    },
  });
  if (!report) throw new NotFoundError("Report");
  const recusal = recusalReason(actor, await involvement(reportId, actor.userId));
  const log = await prisma.staffActionLog.findMany({
    where: { targetType: "report", targetId: reportId },
    orderBy: { createdAt: "asc" },
  });
  return { report, recusal, log };
}

export async function assignReport(actor: Actor, reportId: string, reason: string) {
  await assertMayReview(actor, reportId);
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.findUniqueOrThrow({ where: { id: reportId } });
    const data: Prisma.ReportUpdateInput = { assignedStaff: { connect: { id: actor.userId } } };
    if (report.status === "SUBMITTED") {
      reportMachine.assertTransition("SUBMITTED", "GATHERING_EVIDENCE");
      data.status = "GATHERING_EVIDENCE";
    }
    const updated = await tx.report.update({ where: { id: reportId }, data });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "report.assigned",
      targetType: "report",
      targetId: reportId,
      reason,
    });
    return updated;
  });
}

/** Move a report through its lifecycle. Every step is logged with a reason. */
export async function transitionReport(
  actor: Actor,
  reportId: string,
  to: ReportStatus,
  reason: string,
  resolution?: string,
) {
  await assertMayReview(actor, reportId);
  return prisma.$transaction(async (tx) => {
    const report = await tx.report.findUniqueOrThrow({ where: { id: reportId } });
    reportMachine.assertTransition(report.status, to);
    const data: Prisma.ReportUpdateInput = { status: to };
    if (to === "AWAITING_RESPONSE")
      data.responseDeadline = new Date(Date.now() + ACCUSED_RESPONSE_WINDOW_DAYS * 86400_000);
    if (to === "ACTIONED" || to === "DISMISSED") {
      data.resolvedAt = new Date();
      data.resolution = resolution ?? reason;
    }
    const updated = await tx.report.update({ where: { id: reportId }, data });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: `report.${to.toLowerCase()}`,
      targetType: "report",
      targetId: reportId,
      reason,
      metadata: { from: report.status, to },
    });
    await emit(tx, { type: "ReportStatusChanged", reportId, status: to });
    return updated;
  });
}

export async function addStaffEvidence(
  actor: Actor,
  reportId: string,
  item: EvidenceItem,
  reason: string,
) {
  await assertMayReview(actor, reportId);
  return prisma.$transaction(async (tx) => {
    const ev = await tx.evidence.create({
      data: { reportId, ...evidenceData(item, actor.userId) },
    });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "report.evidence_added",
      targetType: "report",
      targetId: reportId,
      reason,
    });
    return ev;
  });
}

// ───────────── Sanctions ─────────────

/**
 * Warnings, suspensions and permanent bans. Permission escalates with rank
 * (policy), recusal applies when tied to a report, and every sanction is
 * logged. Permanent bans additionally require admin (policy) and are the only
 * action here that is irreversible without an appeal.
 */
export async function issueSanction(actor: Actor, raw: unknown) {
  const input = sanctionSchema.parse(raw);
  if (!canIssueSanction(actor, input.type))
    throw new ForbiddenError("Your staff role cannot issue this sanction");
  if (input.userId === actor.userId) throw new ForbiddenError("You must recuse from your own case");
  if (input.reportId) await assertMayReview(actor, input.reportId);
  else {
    const conflicts = await prisma.conflictDeclaration.findMany({
      where: { staffUserId: actor.userId },
      select: { conflictedUserId: true },
    });
    const reason = recusalReason(actor, {
      involvedUserIds: [input.userId],
      declaredConflictUserIds: conflicts.map((c) => c.conflictedUserId),
    });
    if (reason) throw new ForbiddenError(`You must recuse (${reason.replace("_", " ")})`);
  }

  const target = await prisma.user.findUnique({
    where: { id: input.userId },
    include: { staffRole: true },
  });
  if (!target) throw new NotFoundError("User");
  if (target.staffRole && !hasPermission(actor, "staff.manage"))
    throw new ForbiddenError("Only admins can sanction staff");

  return prisma.$transaction(async (tx) => {
    const endsAt =
      input.type === "SUSPENSION" ? new Date(Date.now() + input.days! * 86400_000) : null;
    const sanction = await tx.sanction.create({
      data: {
        userId: input.userId,
        type: input.type,
        reason: input.reason,
        endsAt,
        reportId: input.reportId,
        issuedById: actor.userId,
      },
    });
    const status =
      input.type === "PERMANENT_BAN"
        ? "BANNED"
        : input.type === "SUSPENSION"
          ? "SUSPENDED"
          : target.status === "ACTIVE"
            ? "WARNED"
            : target.status;
    await tx.user.update({ where: { id: input.userId }, data: { status } });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: `sanction.${input.type.toLowerCase()}`,
      targetType: "user",
      targetId: input.userId,
      reason: input.reason,
      metadata: {
        sanctionId: sanction.id,
        reportId: input.reportId ?? null,
        endsAt: endsAt?.toISOString() ?? null,
      },
    });
    await emit(tx, { type: "SanctionIssued", sanctionId: sanction.id, userId: input.userId });
    return sanction;
  });
}

// ───────────── Notes & log ─────────────

export async function addStaffNote(actor: Actor, raw: unknown) {
  if (!isStaff(actor)) throw new ForbiddenError();
  const input = staffNoteSchema.parse(raw);
  return prisma.staffNote.create({
    data: { userId: input.userId, authorId: actor.userId, body: input.body },
  });
}

export async function listActionLog(actor: Actor, take = 200) {
  if (!isStaff(actor)) throw new ForbiddenError();
  return prisma.staffActionLog.findMany({
    orderBy: { createdAt: "desc" },
    take,
    include: { staffUser: { select: { displayName: true } } },
  });
}

/** Staff view of a user: sanctions, notes, reports, no-shows. Emails are never included. */
export async function staffUserView(actor: Actor, userId: string) {
  if (!isStaff(actor)) throw new ForbiddenError();
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      displayName: true,
      avatarUpdatedAt: true,
      activisionId: true,
      status: true,
      createdAt: true,
      accounts: { select: { providerId: true, handle: true } },
      staffRole: { select: { role: true } },
      sanctions: {
        orderBy: { createdAt: "desc" },
        include: { issuedBy: { select: { displayName: true } } },
      },
      staffNotes: {
        orderBy: { createdAt: "desc" },
        include: { author: { select: { displayName: true } } },
      },
      reportsReceived: {
        orderBy: { createdAt: "desc" },
        select: { id: true, category: true, status: true, createdAt: true },
      },
      reportsFiled: {
        orderBy: { createdAt: "desc" },
        select: { id: true, category: true, status: true, createdAt: true },
      },
      _count: { select: { registrations: { where: { status: "NO_SHOW" } } } },
    },
  });
  if (!user) throw new NotFoundError("User");
  return user;
}

/** Reports a user filed or received, for their own view. */
export async function myReports(userId: string) {
  return prisma.report.findMany({
    where: {
      OR: [
        { reporterId: userId },
        {
          reportedUserId: userId,
          status: { in: ["AWAITING_RESPONSE", "UNDER_REVIEW", "ACTIONED", "DISMISSED"] },
        },
      ],
    },
    orderBy: { createdAt: "desc" },
    include: {
      reportedUser: { select: { displayName: true } },
      reporter: { select: { displayName: true } },
    },
  });
}

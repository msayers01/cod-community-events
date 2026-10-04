import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import * as mod from "@/modules/moderation/service";
import * as reg from "@/modules/registration/service";
import { cleanup, makeEvent, makeHoster, makeStaff, makeUser } from "./setup";

afterAll(cleanup);

const evidence = [
  { type: "VOD" as const, url: "https://twitch.tv/videos/1?t=1h2m", note: "throws at 1:02" },
];

describe("reports", () => {
  it("requires evidence, blocks self-reports, and notifies through the outbox", async () => {
    const reporter = await makeUser();
    const accused = await makeUser();
    const actor = { userId: reporter.id, staffRole: null, isHoster: false };
    await expect(
      mod.fileReport(actor, {
        reportedUserId: reporter.id,
        category: "CHEATING",
        description: "x".repeat(30),
        evidence,
      }),
    ).rejects.toThrow(/yourself/);
    await expect(
      mod.fileReport(actor, {
        reportedUserId: accused.id,
        category: "CHEATING",
        description: "x".repeat(30),
        evidence: [],
      }),
    ).rejects.toThrow(/evidence/i);
    const report = await mod.fileReport(actor, {
      reportedUserId: accused.id,
      category: "CHEATING",
      description: "Clearly walling in round 3, see clip.",
      evidence,
    });
    expect(report.status).toBe("SUBMITTED");
    const ev = await prisma.evidence.findMany({ where: { reportId: report.id } });
    expect(ev).toHaveLength(1);
    const out = await prisma.outboxEvent.findFirst({
      where: { type: "ReportFiled", payload: { path: ["reportId"], equals: report.id } },
    });
    expect(out).not.toBeNull();
  });

  it("walks the lifecycle with recusal, accused response, and a logged reason on every step", async () => {
    const { user: hoster } = await makeHoster();
    const event = await makeEvent(hoster.id);
    const reporter = await makeUser();
    const accused = await makeUser();
    await reg.register(accused.id, event.id);
    const { actor: trial } = await makeStaff("TRIAL_MODERATOR");
    const { actor: modA } = await makeStaff("MODERATOR");
    const { user: modBUser, actor: modB } = await makeStaff("MODERATOR");
    const player = { userId: reporter.id, staffRole: null, isHoster: false };

    const report = await mod.fileReport(player, {
      reportedUserId: accused.id,
      category: "THROWING",
      description: "Threw rounds 2-4 on purpose, see VOD.",
      eventId: event.id,
      evidence,
    });

    // Non-staff cannot review; the reporter (a player) is not staff anyway.
    await expect(
      mod.assignReport(player, report.id, "I want to review my own report"),
    ).rejects.toThrow(/not allowed/);

    // A mod who declared a conflict with the accused must recuse.
    await prisma.conflictDeclaration.create({
      data: { staffUserId: modBUser.id, conflictedUserId: accused.id },
    });
    await expect(mod.assignReport(modB, report.id, "taking this one")).rejects.toThrow(/recuse/);

    // Trial mods can review.
    await mod.assignReport(trial, report.id, "Picking up from the queue");
    let r = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(r.status).toBe("GATHERING_EVIDENCE");
    expect(r.assignedStaffId).toBe(trial.userId);

    await expect(mod.transitionReport(trial, report.id, "ACTIONED", "skip ahead")).rejects.toThrow(
      /Invalid Report transition/,
    );
    await mod.transitionReport(
      trial,
      report.id,
      "AWAITING_RESPONSE",
      "Evidence looks credible; asking the player for their side",
    );
    r = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(r.responseDeadline).not.toBeNull();

    // Only the accused can respond, once, while awaiting.
    const accusedActor = { userId: accused.id, staffRole: null, isHoster: false };
    await expect(
      mod.respondAsAccused(player, { reportId: report.id, statement: "not me, honest" }),
    ).rejects.toThrow(/not found/);
    await mod.respondAsAccused(accusedActor, {
      reportId: report.id,
      statement: "My internet dropped in round 2, I have a speedtest screenshot.",
      evidence: [{ type: "SCREENSHOT", url: "https://i.imgur.com/x.png", note: "" }],
    });
    await expect(
      mod.respondAsAccused(accusedActor, {
        reportId: report.id,
        statement: "another statement here",
      }),
    ).rejects.toThrow(/not open/);
    r = await prisma.report.findUniqueOrThrow({ where: { id: report.id } });
    expect(r.status).toBe("UNDER_REVIEW");

    // Trial mods may warn but not suspend; moderators may suspend.
    await expect(
      mod.issueSanction(trial, {
        userId: accused.id,
        type: "SUSPENSION",
        reason: "Throwing confirmed on VOD",
        days: 7,
        reportId: report.id,
      }),
    ).rejects.toThrow(/cannot issue/);
    await mod.issueSanction(modA, {
      userId: accused.id,
      type: "SUSPENSION",
      reason: "Throwing confirmed on VOD",
      days: 7,
      reportId: report.id,
    });
    await mod.transitionReport(
      modA,
      report.id,
      "ACTIONED",
      "7 day suspension issued",
      "Suspended 7 days for throwing",
    );

    const user = await prisma.user.findUniqueOrThrow({ where: { id: accused.id } });
    expect(user.status).toBe("SUSPENDED");
    // The suspension actually bites: no more sign-ups.
    const other = await makeEvent(hoster.id);
    await expect(reg.register(accused.id, other.id)).rejects.toThrow(/suspended/);

    // Every step left a reason in the append-only log.
    const log = await prisma.staffActionLog.findMany({
      where: { OR: [{ targetId: report.id }, { targetId: accused.id }] },
      orderBy: { createdAt: "asc" },
    });
    expect(log.map((l) => l.action)).toEqual([
      "report.assigned",
      "report.awaiting_response",
      "sanction.suspension",
      "report.actioned",
    ]);
    expect(log.every((l) => l.reason.length >= 10)).toBe(true);
  });

  it("staff cannot sanction themselves and only admins can ban", async () => {
    const { user: modUser, actor: modA } = await makeStaff("MODERATOR");
    const { actor: admin } = await makeStaff("ADMIN");
    const target = await makeUser();
    await expect(
      mod.issueSanction(modA, {
        userId: modUser.id,
        type: "WARNING",
        reason: "testing self sanction",
      }),
    ).rejects.toThrow(/recuse/);
    await expect(
      mod.issueSanction(modA, {
        userId: target.id,
        type: "PERMANENT_BAN",
        reason: "repeat scammer, three reports",
      }),
    ).rejects.toThrow(/cannot issue/);
    await mod.issueSanction(admin, {
      userId: target.id,
      type: "PERMANENT_BAN",
      reason: "repeat scammer, three reports",
    });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: target.id } })).status).toBe(
      "BANNED",
    );
    // Only admins can sanction staff.
    await expect(
      mod.issueSanction(modA, {
        userId: admin.userId,
        type: "WARNING",
        reason: "mods warning admins",
      }),
    ).rejects.toThrow(/Only admins/);
  });

  it("staff view never includes email", async () => {
    const { actor: modA } = await makeStaff("MODERATOR");
    const target = await makeUser();
    const view = await mod.staffUserView(modA, target.id);
    expect(view).not.toHaveProperty("email");
    const player = { userId: target.id, staffRole: null, isHoster: false };
    await expect(mod.staffUserView(player, target.id)).rejects.toThrow(/not allowed/);
  });
});

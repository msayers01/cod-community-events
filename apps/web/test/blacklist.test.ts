import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { expireBlacklistEntries } from "@cod/core";
import * as mod from "@/modules/moderation/service";
import * as bl from "@/modules/moderation/blacklist";
import * as reg from "@/modules/registration/service";
import { cleanup, makeEvent, makeHoster, makeStaff, makeUser } from "./setup";

afterAll(cleanup);

const evidence = [
  { type: "PAYMENT_RECORD" as const, url: "https://i.imgur.com/paypal.png", note: "" },
];
const player = (id: string) => ({ userId: id, staffRole: null, isHoster: false });

async function reviewedReport() {
  const reporter = await makeUser();
  const accused = await makeUser();
  const { actor: modA } = await makeStaff("MODERATOR");
  const report = await mod.fileReport(player(reporter.id), {
    reportedUserId: accused.id,
    category: "NON_PAYMENT",
    description: "Won first place, never received the $70 payout.",
    evidence,
  });
  await mod.assignReport(modA, report.id, "Taking this non-payment case");
  await mod.transitionReport(
    modA,
    report.id,
    "AWAITING_RESPONSE",
    "Payment screenshots look credible, asking hoster",
  );
  return { reporter, accused, modA, report };
}

describe("public blacklist", () => {
  it("requires the right to respond, two different moderators, and expires lesser categories", async () => {
    const { accused, modA, report } = await reviewedReport();
    const { actor: modB } = await makeStaff("MODERATOR");
    const { actor: modC, user: modCUser } = await makeStaff("MODERATOR");
    const { actor: trial } = await makeStaff("TRIAL_MODERATOR");
    const wording =
      "Verified report: unpaid winnings from a completed event, evidence reviewed by staff.";

    // Response window still open: not yet.
    await expect(
      bl.proposeEntry(modA, {
        userId: accused.id,
        category: "NON_PAYMENT",
        publicWording: wording,
        reportId: report.id,
        reason: "Clear evidence of non-payment",
      }),
    ).rejects.toThrow(/response window/);
    await prisma.report.update({
      where: { id: report.id },
      data: { responseDeadline: new Date(Date.now() - 1000) },
    });

    const entry = await bl.proposeEntry(modA, {
      userId: accused.id,
      category: "NON_PAYMENT",
      publicWording: wording,
      reportId: report.id,
      reason: "Clear evidence of non-payment",
    });
    expect(entry.status).toBe("AWAITING_SECOND_APPROVAL"); // the proposing mod's approval counts
    expect(entry.expiresAt).toBeNull(); // non-payment never expires by default
    expect(await bl.publicBlacklist()).not.toContainEqual(
      expect.objectContaining({ id: entry.id }),
    );

    // Same mod cannot double-approve; trial mods cannot approve; conflicted mod must recuse.
    await expect(bl.approveEntry(modA, entry.id, "approving my own proposal")).rejects.toThrow(
      /different/,
    );
    await expect(bl.approveEntry(trial, entry.id, "looks fine to me too")).rejects.toThrow(
      /Only moderators/,
    );
    await prisma.conflictDeclaration.create({
      data: { staffUserId: modCUser.id, conflictedUserId: accused.id },
    });
    await expect(bl.approveEntry(modC, entry.id, "approving as second mod")).rejects.toThrow(
      /recuse/,
    );

    const active = await bl.approveEntry(modB, entry.id, "Evidence reviewed, concur with proposer");
    expect(active.status).toBe("ACTIVE");
    const pub = await bl.publicBlacklist();
    expect(pub.map((e) => e.id)).toContain(entry.id);
    expect(pub.find((e) => e.id === entry.id)).not.toHaveProperty("proposedById");

    // Sign-ups by a blacklisted player are flagged for the hoster.
    const { user: hoster } = await makeHoster();
    const event = await makeEvent(hoster.id);
    const r = await reg.register(accused.id, event.id);
    expect(r.blacklistFlagged).toBe(true);

    // Log has every step.
    const log = await prisma.staffActionLog.findMany({
      where: { targetType: "blacklist", targetId: entry.id },
      orderBy: { createdAt: "asc" },
    });
    expect(log.map((l) => l.action)).toEqual(["blacklist.proposed", "blacklist.activated"]);

    // Expiry sweep.
    const lesser = await bl.proposeEntry(modA, {
      userId: accused.id,
      category: "REPEATED_NO_SHOWS",
      publicWording: "Verified report: repeated no-shows across several events, reviewed by staff.",
      reason: "Three no-shows in a month",
    });
    expect(lesser.expiresAt).not.toBeNull();
    await bl.approveEntry(modB, lesser.id, "Concur");
    await prisma.blacklistEntry.update({
      where: { id: lesser.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    expect(await expireBlacklistEntries()).toBeGreaterThanOrEqual(1);
    expect(
      (await prisma.blacklistEntry.findUniqueOrThrow({ where: { id: lesser.id } })).status,
    ).toBe("EXPIRED");
  });

  it("appeals: only the subject, handled by an uninvolved moderator, overturning lifts the entry", async () => {
    const { accused, modA, report } = await reviewedReport();
    const { actor: modB } = await makeStaff("MODERATOR");
    const { actor: modD } = await makeStaff("MODERATOR");
    await prisma.report.update({
      where: { id: report.id },
      data: { responseDeadline: new Date(Date.now() - 1000) },
    });
    const entry = await bl.proposeEntry(modA, {
      userId: accused.id,
      category: "NON_PAYMENT",
      publicWording: "Verified report: unpaid winnings, evidence reviewed by staff.",
      reportId: report.id,
      reason: "Clear evidence of non-payment",
    });
    await bl.approveEntry(modB, entry.id, "Concur");

    const other = await makeUser();
    await expect(
      bl.fileAppeal(player(other.id), {
        target: "BLACKLIST_ENTRY",
        targetId: entry.id,
        statement: "This is not even about me but I object anyway.",
      }),
    ).rejects.toThrow(/not found/);
    const appeal = await bl.fileAppeal(player(accused.id), {
      target: "BLACKLIST_ENTRY",
      targetId: entry.id,
      statement: "I paid on the 3rd; here is the PayPal receipt the reporter ignored.",
      evidence,
    });
    await expect(
      bl.fileAppeal(player(accused.id), {
        target: "BLACKLIST_ENTRY",
        targetId: entry.id,
        statement: "Filing again because why not, twenty chars.",
      }),
    ).rejects.toThrow(/already appealed/);

    // Approvers of the entry cannot take the appeal.
    await expect(bl.takeAppeal(modA, appeal.id, "I'll handle it")).rejects.toThrow(/not involved/);
    await expect(bl.takeAppeal(modB, appeal.id, "I'll handle it")).rejects.toThrow(/not involved/);
    await bl.takeAppeal(modD, appeal.id, "Fresh eyes on this one");
    await bl.decideAppeal(modD, {
      appealId: appeal.id,
      decision: "OVERTURNED",
      reason: "Receipt verified; payment was made before the report",
    });

    expect((await prisma.appeal.findUniqueOrThrow({ where: { id: appeal.id } })).status).toBe(
      "OVERTURNED",
    );
    expect(
      (await prisma.blacklistEntry.findUniqueOrThrow({ where: { id: entry.id } })).status,
    ).toBe("REMOVED");
    expect((await bl.publicBlacklist()).map((e) => e.id)).not.toContain(entry.id);
  });

  it("requirement-based events enforce their requirements", async () => {
    const { user: hoster } = await makeHoster();
    const event = await prisma.event.update({
      where: { id: (await makeEvent(hoster.id)).id },
      data: {
        entryType: "REQUIREMENT_BASED",
        entryRequirements: {
          minCompletedEvents: 3,
          noOpenReports: true,
          requireLinkedDiscord: false,
        },
      },
    });
    const rookie = await makeUser();
    await expect(reg.register(rookie.id, event.id)).rejects.toThrow(/requires 3 completed events/);
  });
});

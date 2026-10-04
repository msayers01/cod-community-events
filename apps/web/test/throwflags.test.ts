import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { detectThrowsForMatch } from "@cod/core";
import * as flags from "@/modules/throwflags/service";
import { cleanup, makeEvent, makeHoster, makeStaff, makeUser, makeVerifiedMatch } from "./setup";

afterAll(cleanup);

const HOUR = 3600_000;

/** X has a steady, mostly-even history in another event, so baselines exist. */
async function playerWithHistory() {
  const { user: hoster } = await makeHoster();
  const [x, t, o1, o2] = await Promise.all([
    makeUser("x"),
    makeUser("t"),
    makeUser("o"),
    makeUser("o"),
  ]);
  const past = await makeEvent(hoster.id, { status: "LIVE" });
  for (let i = 0; i < 14; i++) {
    await makeVerifiedMatch({
      eventId: past.id,
      teamA: [x.id, t.id],
      teamB: [o1.id, o2.id],
      winner: i % 2 === 0 ? "A" : "B", // an even record
      stats: { [x.id]: { kills: 9 + (i % 3), deaths: 6 + (i % 2) } },
      at: new Date(Date.now() - (40 - i) * HOUR),
    });
  }
  return { hoster, x, t, o1, o2 };
}

describe("throw detection", () => {
  it("flags a collapse in a loss, once, without any automatic consequence", async () => {
    const { hoster, x, t, o1, o2 } = await playerWithHistory();
    const event = await makeEvent(hoster.id, { status: "LIVE" });
    const bad = await makeVerifiedMatch({
      eventId: event.id,
      teamA: [x.id, t.id],
      teamB: [o1.id, o2.id],
      winner: "B",
      stats: { [x.id]: { kills: 0, deaths: 14 }, [t.id]: { kills: 8, deaths: 6 } },
    });

    const before = await Promise.all([
      prisma.sanction.count({ where: { userId: x.id } }),
      prisma.blacklistEntry.count({ where: { userId: x.id } }),
      prisma.report.count({ where: { reportedUserId: x.id } }),
    ]);
    const raised = await detectThrowsForMatch(bad.match.id);
    expect(raised).toHaveLength(1);

    const flag = await prisma.throwFlag.findUniqueOrThrow({ where: { id: raised[0]! } });
    expect(flag).toMatchObject({
      userId: x.id,
      signal: "PERFORMANCE_DROP",
      matchId: bad.match.id,
      eventId: event.id,
      status: "OPEN",
    });
    // What staff see is what was observed; the thresholds are not stored anywhere.
    expect(Object.keys(flag.details as object).sort()).toEqual([
      "baselineKillShare",
      "baselineMatches",
      "deviations",
      "observedKillShare",
    ]);
    // The teammate who played normally is not flagged, and nothing punitive happened.
    expect(await prisma.throwFlag.count({ where: { userId: t.id } })).toBe(0);
    const after = await Promise.all([
      prisma.sanction.count({ where: { userId: x.id } }),
      prisma.blacklistEntry.count({ where: { userId: x.id } }),
      prisma.report.count({ where: { reportedUserId: x.id } }),
    ]);
    expect(after).toEqual(before);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: x.id } })).status).toBe("ACTIVE");
    // The staff queue is told through the outbox, with no player named in the event.
    const outbox = await prisma.outboxEvent.findMany({ where: { type: "ThrowFlagRaised" } });
    expect(outbox.some((o) => (o.payload as { flagId: string }).flagId === flag.id)).toBe(true);

    // Re-running (an outbox retry) changes nothing.
    expect(await detectThrowsForMatch(bad.match.id)).toEqual([]);
    expect(await prisma.throwFlag.count({ where: { userId: x.id } })).toBe(1);
  });

  it("ignores a normal bad game and a win", async () => {
    const { hoster, x, t, o1, o2 } = await playerWithHistory();
    const event = await makeEvent(hoster.id, { status: "LIVE" });
    const meh = await makeVerifiedMatch({
      eventId: event.id,
      teamA: [x.id, t.id],
      teamB: [o1.id, o2.id],
      winner: "B",
      stats: { [x.id]: { kills: 6, deaths: 8 } },
    });
    expect(await detectThrowsForMatch(meh.match.id)).toEqual([]);
    const winWithZero = await makeVerifiedMatch({
      eventId: event.id,
      teamA: [x.id, t.id],
      teamB: [o1.id, o2.id],
      winner: "A",
      stats: { [x.id]: { kills: 0, deaths: 14 } },
    });
    expect(await detectThrowsForMatch(winWithZero.match.id)).toEqual([]);
  });

  it("flags losing nearly everything in one event, and a fixed pairing once it is long enough", async () => {
    const { hoster, x, o1, o2 } = await playerWithHistory();
    const u = await makeUser("u"); // a new partner: no shared history to explain the losses
    const event = await makeEvent(hoster.id, { status: "LIVE" });
    let last = "";
    for (let i = 0; i < 7; i++)
      last = (
        await makeVerifiedMatch({
          eventId: event.id,
          teamA: [x.id, u.id],
          teamB: [o1.id, o2.id],
          winner: "B",
        })
      ).match.id;
    const seven = await detectThrowsForMatch(last);
    const kinds = (await prisma.throwFlag.findMany({ where: { id: { in: seven } } })).map(
      (f) => `${f.userId === x.id ? "x" : "u"}:${f.signal}`,
    );
    // Seven straight losses is a streak for both; seven together is not yet enough for a pairing flag.
    expect(kinds.sort()).toEqual(["u:EVENT_LOSS_STREAK", "x:EVENT_LOSS_STREAK"]);

    const eighth = await makeVerifiedMatch({
      eventId: event.id,
      teamA: [x.id, u.id],
      teamB: [o1.id, o2.id],
      winner: "B",
    });
    const more = await prisma.throwFlag.findMany({
      where: { id: { in: await detectThrowsForMatch(eighth.match.id) } },
    });
    expect(more.map((f) => f.signal)).toEqual(["TEAMMATE_LOSS_PATTERN", "TEAMMATE_LOSS_PATTERN"]);
    expect(more.find((f) => f.userId === x.id)!.relatedUserId).toBe(u.id);
    // The existing streak flags are refreshed, not duplicated.
    expect(
      await prisma.throwFlag.count({ where: { userId: x.id, signal: "EVENT_LOSS_STREAK" } }),
    ).toBe(1);
  });

  it("does not blame a pairing that has always lost together by the numbers", async () => {
    // x and t lost half of their 14 history matches together; a bad night is not a pattern.
    const { hoster, x, t, o1, o2 } = await playerWithHistory();
    const event = await makeEvent(hoster.id, { status: "LIVE" });
    let last = "";
    for (let i = 0; i < 5; i++)
      last = (
        await makeVerifiedMatch({
          eventId: event.id,
          teamA: [x.id, t.id],
          teamB: [o1.id, o2.id],
          winner: i === 2 ? "A" : "B",
        })
      ).match.id;
    expect(await detectThrowsForMatch(last)).toEqual([]);
  });
});

describe("reviewing flags", () => {
  async function flagged() {
    const { hoster, x, t, o1, o2 } = await playerWithHistory();
    const event = await makeEvent(hoster.id, { status: "LIVE" });
    const bad = await makeVerifiedMatch({
      eventId: event.id,
      teamA: [x.id, t.id],
      teamB: [o1.id, o2.id],
      winner: "B",
      stats: { [x.id]: { kills: 0, deaths: 14 } },
    });
    const [id] = await detectThrowsForMatch(bad.match.id);
    return { id: id!, x, event, hoster };
  }

  it("only moderators and above can see the queue", async () => {
    const { id } = await flagged();
    const trial = await makeStaff("TRIAL_MODERATOR");
    const hosterActor = (await makeHoster()).actor;
    await expect(flags.listFlags(trial.actor)).rejects.toThrow(/not allowed/);
    await expect(flags.getFlag(hosterActor, id)).rejects.toThrow(/not allowed/);
    const mod = await makeStaff("MODERATOR");
    expect((await flags.listFlags(mod.actor)).some((f) => f.id === id)).toBe(true);
  });

  it("escalation opens an ordinary throwing report with the scoreboard as evidence; it sanctions nobody", async () => {
    const { id, x, event } = await flagged();
    const mod = await makeStaff("MODERATOR");
    const reason = "Footage shows deliberate feeding in rounds 3 and 4";

    // Cannot escalate before taking the flag.
    await expect(flags.escalateFlag(mod.actor, { flagId: id, reason })).rejects.toThrow(
      /transition/i,
    );
    await flags.startReview(mod.actor, { flagId: id, reason: "Taking this one to check the VOD" });
    // A reason is mandatory.
    await expect(flags.escalateFlag(mod.actor, { flagId: id, reason: "no" })).rejects.toThrow();

    await flags.escalateFlag(mod.actor, { flagId: id, reason });
    const flag = await prisma.throwFlag.findUniqueOrThrow({ where: { id } });
    expect(flag.status).toBe("ESCALATED");
    expect(flag.reportId).toBeTruthy();

    const report = await prisma.report.findUniqueOrThrow({
      where: { id: flag.reportId! },
      include: { evidence: true },
    });
    expect(report).toMatchObject({
      category: "THROWING",
      status: "SUBMITTED",
      reportedUserId: x.id,
      reporterId: mod.user.id,
      eventId: event.id,
    });
    expect(report.evidence).toHaveLength(1);
    expect(report.description).not.toMatch(/deviations|chance|baseline/i);
    expect(await prisma.sanction.count({ where: { userId: x.id } })).toBe(0);
    expect(await prisma.blacklistEntry.count({ where: { userId: x.id } })).toBe(0);

    const log = await prisma.staffActionLog.findMany({
      where: { targetType: "throw_flag", targetId: id },
      orderBy: { createdAt: "asc" },
    });
    expect(log.map((l) => l.action)).toEqual(["throw_flag.under_review", "throw_flag.escalated"]);

    // Resolved flags are final.
    await expect(flags.dismissFlag(mod.actor, { flagId: id, reason })).rejects.toThrow(
      /transition/i,
    );
  });

  it("dismissal closes the flag for good, and re-detection does not reopen it", async () => {
    const { id } = await flagged();
    const mod = await makeStaff("MODERATOR");
    await flags.dismissFlag(mod.actor, {
      flagId: id,
      reason: "Was playing on a broken controller",
    });
    const flag = await prisma.throwFlag.findUniqueOrThrow({ where: { id } });
    expect(flag.status).toBe("DISMISSED");
    expect(flag.resolvedAt).not.toBeNull();
    expect(await detectThrowsForMatch(flag.matchId!)).toEqual([]);
    expect((await prisma.throwFlag.findUniqueOrThrow({ where: { id } })).status).toBe("DISMISSED");
  });

  it("staff who played in the event, or are the subject, must recuse", async () => {
    const { id, event } = await flagged();
    const mod = await makeStaff("MODERATOR");
    await prisma.registration.create({
      data: { eventId: event.id, playerId: mod.user.id, status: "IN_POOL" },
    });
    await expect(
      flags.startReview(mod.actor, { flagId: id, reason: "I'll take this one, thanks" }),
    ).rejects.toThrow(/recuse/);
    const detail = await flags.getFlag(mod.actor, id);
    expect(detail.recusal).toBe("played_in_event");
  });
});

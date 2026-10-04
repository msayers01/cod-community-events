import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { refreshLeaderboard } from "@cod/core";
import * as boards from "@/modules/leaderboards/service";
import { cleanup, makeEvent, makeHoster, makeStaff, makeUser, makeVerifiedMatch } from "./setup";

afterAll(cleanup);

// Everything here happens in May 2031 so it cannot mix with other tests' data.
const MAY = (day: number) => new Date(Date.UTC(2031, 4, day, 12));

describe("seasons", () => {
  it("are an admin decision, cannot overlap, and are logged", async () => {
    const admin = await makeStaff("ADMIN");
    const mod = await makeStaff("MODERATOR");
    const input = {
      name: `Season ${Date.now()}`,
      startsAt: new Date(Date.UTC(2032, 0, 1)),
      endsAt: new Date(Date.UTC(2032, 3, 1)),
      reason: "First quarterly season",
    };
    await expect(boards.createSeason(mod.actor, input)).rejects.toThrow(/not allowed/);

    const season = await boards.createSeason(admin.actor, input);
    await expect(
      boards.createSeason(admin.actor, {
        ...input,
        name: `${input.name} b`,
        startsAt: new Date(Date.UTC(2032, 2, 1)),
        endsAt: new Date(Date.UTC(2032, 5, 1)),
      }),
    ).rejects.toThrow(/overlaps/);
    await expect(
      boards.createSeason(admin.actor, { ...input, endsAt: input.startsAt }),
    ).rejects.toThrow();

    const log = await prisma.staffActionLog.findFirst({
      where: { targetType: "season", targetId: season.id },
    });
    expect(log?.reason).toBe(input.reason);
    const queued = await prisma.outboxEvent.findMany({
      where: { type: "LeaderboardRefreshRequested" },
    });
    expect(queued.some((o) => (o.payload as { periodKey: string }).periodKey === season.id)).toBe(
      true,
    );
  });
});

describe("leaderboard refresh", () => {
  it("ranks verified results per mode, hides unranked and ineligible players, and is idempotent", async () => {
    const admin = await makeStaff("ADMIN");
    const { user: hoster } = await makeHoster();
    const snd = await makeEvent(hoster.id, { status: "LIVE" });
    const hp = await prisma.event.update({
      where: { id: (await makeEvent(hoster.id, { status: "LIVE" })).id },
      data: { mode: "HARDPOINT" },
    });
    const [a1, a2, b1, b2, rare, banned] = await Promise.all(
      ["a", "a", "b", "b", "r", "x"].map((p) => makeUser(p)),
    );
    await prisma.user.update({ where: { id: banned!.id }, data: { status: "BANNED" } });

    // Team A (a1, a2) beats team B (b1, b2) three times in SnD; 'rare' plays two; 'banned' plays three.
    for (let i = 0; i < 3; i++)
      await makeVerifiedMatch({
        eventId: snd.id,
        teamA: [a1!.id, a2!.id],
        teamB: [b1!.id, b2!.id],
        winner: "A",
        stats: { [a1!.id]: { kills: 12, deaths: 4 }, [b1!.id]: { kills: 4, deaths: 12 } },
        at: MAY(10 + i),
      });
    for (let i = 0; i < 3; i++)
      await makeVerifiedMatch({
        eventId: snd.id,
        teamA: [banned!.id, a2!.id],
        teamB: [b2!.id, b1!.id],
        winner: "A",
        at: MAY(14 + i),
      });
    for (let i = 0; i < 2; i++)
      await makeVerifiedMatch({
        eventId: snd.id,
        teamA: [rare!.id, a1!.id],
        teamB: [b1!.id, b2!.id],
        winner: "A",
        at: MAY(18 + i),
      });
    // One Hardpoint match so the modes are kept apart.
    await makeVerifiedMatch({
      eventId: hp.id,
      teamA: [a1!.id],
      teamB: [b1!.id],
      winner: "B",
      at: MAY(20),
    });
    // Outside the month: must not count.
    await makeVerifiedMatch({
      eventId: snd.id,
      teamA: [b1!.id, b2!.id],
      teamB: [a1!.id, a2!.id],
      winner: "A",
      at: new Date(Date.UTC(2031, 5, 2)),
    });

    const month = "2031-05";
    const ranked = await refreshLeaderboard("MONTH", month);
    const { entries } = await boards.getLeaderboard("MONTH", month, "SND");
    const byName = Object.fromEntries(entries.map((e) => [e.userId, e]));

    // a1: 5 SnD matches (3 + 2 with 'rare'), all wins = 15 pts. a2: 6 wins = 18 pts. b1/b2 lose all.
    expect(byName[a2!.id]).toMatchObject({ rank: 1, points: 18, wins: 6, losses: 0, matches: 6 });
    expect(byName[a1!.id]).toMatchObject({ rank: 2, points: 15, matches: 5 });
    expect(byName[b1!.id]!.rank).toBeGreaterThan(2);
    expect(byName[b1!.id]).toMatchObject({ wins: 0, losses: 8, points: 8 });
    expect(entries.map((e) => e.rank)).toEqual(entries.map((_, i) => i + 1));
    // Two matches isn't enough to be ranked; a banned player isn't shown.
    expect(byName[rare!.id]).toBeUndefined();
    expect(byName[banned!.id]).toBeUndefined();
    // Hardpoint is its own board with its own (too small) sample.
    expect((await boards.getLeaderboard("MONTH", month, "HARDPOINT")).entries).toEqual([]);
    expect(ranked).toBe(entries.length);

    // Refreshing again gives the same board (no duplicates).
    await refreshLeaderboard("MONTH", month);
    expect(
      await prisma.leaderboardEntry.count({ where: { period: "MONTH", periodKey: month } }),
    ).toBe(entries.length);

    // A season covering the same dates builds the same standings from its own window.
    const season = await boards.createSeason(admin.actor, {
      name: `May ${Date.now()}`,
      startsAt: new Date(Date.UTC(2031, 4, 1)),
      endsAt: new Date(Date.UTC(2031, 4, 31)),
      reason: "Test season for May",
    });
    await refreshLeaderboard("SEASON", season.id);
    const seasonal = await boards.getLeaderboard("SEASON", season.id, "SND");
    expect(seasonal.entries.find((e) => e.userId === a2!.id)?.points).toBe(18);

    // Profile lookups read the stored rows.
    const mine = await prisma.leaderboardEntry.findFirst({
      where: { userId: a2!.id, period: "MONTH", periodKey: month },
    });
    expect(mine?.rank).toBe(1);
  });

  it("drops a player who is later blacklisted for cheating, and ignores unknown periods", async () => {
    const { user: hoster } = await makeHoster();
    const ev = await makeEvent(hoster.id, { status: "LIVE" });
    const [p, q, r, s] = await Promise.all(["p", "q", "r", "s"].map((n) => makeUser(n)));
    for (let i = 0; i < 3; i++)
      await makeVerifiedMatch({
        eventId: ev.id,
        teamA: [p!.id, q!.id],
        teamB: [r!.id, s!.id],
        winner: "A",
        at: new Date(Date.UTC(2031, 7, 5 + i)),
      });
    await refreshLeaderboard("MONTH", "2031-08");
    expect(
      (await boards.getLeaderboard("MONTH", "2031-08", "SND")).entries.some(
        (e) => e.userId === p!.id,
      ),
    ).toBe(true);

    const staff = await makeStaff("ADMIN");
    await prisma.blacklistEntry.create({
      data: {
        userId: p!.id,
        category: "CHEATING",
        publicWording: "Verified report: cheating, evidence reviewed",
        status: "ACTIVE",
        proposedById: staff.user.id,
        activatedAt: new Date(),
      },
    });
    await refreshLeaderboard("MONTH", "2031-08");
    const after = (await boards.getLeaderboard("MONTH", "2031-08", "SND")).entries;
    expect(after.some((e) => e.userId === p!.id)).toBe(false);
    expect(after.some((e) => e.userId === q!.id)).toBe(true);

    expect(await refreshLeaderboard("MONTH", "not-a-month")).toBe(0);
    expect(await refreshLeaderboard("SEASON", "no-such-season")).toBe(0);
  });
});

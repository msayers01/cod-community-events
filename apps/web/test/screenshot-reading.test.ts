import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import {
  claimPendingReadings,
  processReading,
  queueScreenshotReading,
  type OcrEngine,
} from "@cod/core";
import * as matches from "@/modules/matches/service";
import { cleanup, makeEvent, makeHoster, makeUser } from "./setup";

afterAll(cleanup);

/** A pending result with two teams of two, optionally with manually entered stats. */
async function pendingResult(manual?: Record<string, { kills: number; deaths: number }>) {
  const { user: hoster } = await makeHoster();
  const event = await makeEvent(hoster.id, { status: "LIVE" });
  const players = await Promise.all([
    makeUser("ocr"),
    makeUser("ocr"),
    makeUser("ocr"),
    makeUser("ocr"),
  ]);
  const round = await prisma.round.create({
    data: { eventId: event.id, roundNumber: 1, status: "IN_PROGRESS" },
  });
  const [a, b] = await Promise.all(
    (
      [
        ["Team A", players.slice(0, 2)],
        ["Team B", players.slice(2)],
      ] as const
    ).map(([label, ps]) =>
      prisma.roundTeam.create({
        data: { roundId: round.id, label, members: { create: ps.map((p) => ({ userId: p.id })) } },
      }),
    ),
  );
  const match = await prisma.match.create({
    data: { roundId: round.id, teamAId: a!.id, teamBId: b!.id, status: "RESULT_PENDING" },
  });
  const submission = await prisma.resultSubmission.create({
    data: {
      matchId: match.id,
      submittedById: players[0]!.id,
      screenshotUrl: "https://i.imgur.com/scoreboard.png",
      scoreA: 6,
      scoreB: 3,
      winningTeamId: a!.id,
      verificationDeadline: new Date(Date.now() + 86_400_000),
      stats: {
        create: Object.entries(manual ?? {}).map(([playerId, s]) => ({
          matchId: match.id,
          playerId,
          ...s,
        })),
      },
    },
  });
  await prisma.$transaction((tx) => queueScreenshotReading(tx, submission.id));
  const reading = await prisma.screenshotReading.findUniqueOrThrow({
    where: { submissionId: submission.id },
  });
  return { players, submission, reading, match, event };
}

const scoreboard = (players: { displayName: string }[], kd: [number, number][]) =>
  [
    "SEARCH & DESTROY",
    "PLAYER SCORE KILLS DEATHS ASSISTS PLANTS DEFUSES",
    ...players.map((p, i) => `${p.displayName} 1200 ${kd[i]![0]} ${kd[i]![1]} 1 0 0`),
  ].join("\n");

const engine = (text: string, confidence = 88): OcrEngine => ({
  name: "fake",
  recognize: async () => ({ text, confidence }),
});
const load = async () => Buffer.from("png");

/** Mirror what the worker's claim step does, for one specific reading. */
const claim = (id: string) =>
  prisma.screenshotReading.update({
    where: { id },
    data: { status: "PROCESSING", startedAt: new Date(), attempts: { increment: 1 } },
  });

describe("screenshot reading", () => {
  it("is queued by the real submission flow, without holding up the result", async () => {
    const fx = await pendingResult();
    // A fresh match for the same teams, still waiting for its first result.
    const match = await prisma.match.create({
      data: { roundId: fx.match.roundId, teamAId: fx.match.teamAId, teamBId: fx.match.teamBId },
    });
    const sub = await matches.submitResult(
      { userId: fx.players[0]!.id, staffRole: null, isHoster: false },
      { matchId: match.id, screenshotUrl: "https://i.imgur.com/x.png", scoreA: 6, scoreB: 2 },
    );
    expect(sub.status).toBe("PENDING");
    const reading = await prisma.screenshotReading.findUniqueOrThrow({
      where: { submissionId: sub.id },
    });
    expect(reading.status).toBe("PENDING");
  });

  it("fills in blank stats from a confident reading, as unverified stats flagged as read by the machine", async () => {
    const { players, submission, reading } = await pendingResult();
    await claim(reading.id);
    const text = scoreboard(players, [
      [9, 4],
      [7, 5],
      [3, 8],
      [2, 7],
    ]);
    expect(await processReading(reading.id, { engine: engine(text), load })).toBe("completed");

    const done = await prisma.screenshotReading.findUniqueOrThrow({ where: { id: reading.id } });
    expect(done).toMatchObject({ status: "COMPLETED", filledStats: true, provider: "fake" });
    const stats = await prisma.playerMatchStat.findMany({
      where: { submissionId: submission.id },
      orderBy: { kills: "desc" },
    });
    expect(stats.map((s) => [s.kills, s.deaths, s.plants, s.source, s.verified])).toEqual([
      [9, 4, 0, "OCR", false],
      [7, 5, 0, "OCR", false],
      [3, 8, 0, "OCR", false],
      [2, 7, 0, "OCR", false],
    ]);
    // It never verifies anything by itself.
    expect(
      (await prisma.resultSubmission.findUniqueOrThrow({ where: { id: submission.id } })).status,
    ).toBe("PENDING");
    // The confirmers hear about it through the outbox.
    const events = await prisma.outboxEvent.findMany({ where: { type: "ScreenshotRead" } });
    expect(
      events.some((e) => (e.payload as { submissionId: string }).submissionId === submission.id),
    ).toBe(true);
    // Running it again is a no-op.
    expect(await processReading(reading.id, { engine: engine(text), load })).toBe("noop");
  });

  it("does not guess when the reading is unsure or the scoreboard is unrecognisable", async () => {
    const low = await pendingResult();
    await claim(low.reading.id);
    const text = scoreboard(low.players, [
      [9, 4],
      [7, 5],
      [3, 8],
      [2, 7],
    ]);
    await processReading(low.reading.id, { engine: engine(text, 35), load });
    expect(await prisma.playerMatchStat.count({ where: { submissionId: low.submission.id } })).toBe(
      0,
    );
    expect(
      (await prisma.screenshotReading.findUniqueOrThrow({ where: { id: low.reading.id } }))
        .filledStats,
    ).toBe(false);

    const junk = await pendingResult();
    await claim(junk.reading.id);
    await processReading(junk.reading.id, { engine: engine("lorem ipsum 123"), load });
    expect(
      await prisma.playerMatchStat.count({ where: { submissionId: junk.submission.id } }),
    ).toBe(0);
    expect(
      (await prisma.screenshotReading.findUniqueOrThrow({ where: { id: junk.reading.id } })).status,
    ).toBe("COMPLETED");
  });

  it("highlights fields where the typed stats disagree with the screenshot, and leaves the typed stats alone", async () => {
    const fx = await pendingResult();
    // Re-create with manual stats for two players, one of them padded.
    const { players } = fx;
    await prisma.playerMatchStat.createMany({
      data: [
        {
          matchId: fx.match.id,
          submissionId: fx.submission.id,
          playerId: players[0]!.id,
          kills: 9,
          deaths: 4,
        },
        {
          matchId: fx.match.id,
          submissionId: fx.submission.id,
          playerId: players[2]!.id,
          kills: 12,
          deaths: 8,
        },
      ],
    });
    await claim(fx.reading.id);
    const text = scoreboard(players, [
      [9, 4],
      [7, 5],
      [3, 8],
      [2, 7],
    ]);
    await processReading(fx.reading.id, { engine: engine(text), load });

    const done = await prisma.screenshotReading.findUniqueOrThrow({ where: { id: fx.reading.id } });
    expect(done.filledStats).toBe(false);
    expect(done.discrepancies).toEqual([
      { playerId: players[2]!.id, field: "kills", submitted: 12, read: 3 },
    ]);
    const typed = await prisma.playerMatchStat.findMany({
      where: { submissionId: fx.submission.id },
    });
    expect(typed).toHaveLength(2);
    expect(typed.every((s) => s.source === "MANUAL")).toBe(true);

    // And it is what reviewers and confirmers see.
    const view = matches.readingView(done, [
      ...players.map((p) => ({ user: { id: p.id, displayName: p.displayName } })),
    ]);
    expect(view?.discrepancies).toEqual([
      { player: players[2]!.displayName, field: "kills", submitted: 12, read: 3 },
    ]);
  });

  it("never touches stats once the result is no longer open for confirmation", async () => {
    const fx = await pendingResult();
    await prisma.resultSubmission.update({
      where: { id: fx.submission.id },
      data: { status: "DISPUTED" },
    });
    await claim(fx.reading.id);
    await processReading(fx.reading.id, {
      engine: engine(
        scoreboard(fx.players, [
          [9, 4],
          [7, 5],
          [3, 8],
          [2, 7],
        ]),
      ),
      load,
    });
    expect(await prisma.playerMatchStat.count({ where: { submissionId: fx.submission.id } })).toBe(
      0,
    );
  });

  it("skips screenshots it cannot access, and retries then gives up on engine failures", async () => {
    const skipped = await pendingResult();
    await claim(skipped.reading.id);
    expect(
      await processReading(skipped.reading.id, { engine: engine(""), load: async () => null }),
    ).toBe("skipped");

    const flaky = await pendingResult();
    const boom: OcrEngine = {
      name: "boom",
      recognize: async () => {
        throw new Error("engine crashed");
      },
    };
    await claim(flaky.reading.id); // attempt 1
    expect(await processReading(flaky.reading.id, { engine: boom, load })).toBe("retry");
    expect(
      (await prisma.screenshotReading.findUniqueOrThrow({ where: { id: flaky.reading.id } }))
        .status,
    ).toBe("PENDING");
    await claim(flaky.reading.id); // attempt 2
    expect(await processReading(flaky.reading.id, { engine: boom, load })).toBe("retry");
    await claim(flaky.reading.id); // attempt 3
    expect(await processReading(flaky.reading.id, { engine: boom, load })).toBe("failed");
    const failed = await prisma.screenshotReading.findUniqueOrThrow({
      where: { id: flaky.reading.id },
    });
    expect(failed).toMatchObject({ status: "FAILED", error: "engine crashed", attempts: 3 });
  });

  it("claims each pending reading once", async () => {
    const fx = await pendingResult();
    const first = await claimPendingReadings(1000);
    expect(first).toContain(fx.reading.id);
    const row = await prisma.screenshotReading.findUniqueOrThrow({ where: { id: fx.reading.id } });
    expect(row).toMatchObject({ status: "PROCESSING", attempts: 1 });
    expect(await claimPendingReadings(1000)).not.toContain(fx.reading.id);
  });

  it("falls back to reading each table and the stats card when the whole frame is unreadable", async () => {
    const fx = await pendingResult();
    await prisma.user.update({
      where: { id: fx.players[0]!.id },
      data: { activisionId: "Whoever#1768499" },
    });
    await claim(fx.reading.id);
    const word = (text: string, x0: number, y0: number, x1: number, y1: number) => ({
      text,
      x0,
      y0,
      x1,
      y1,
    });
    const cell = (text: string, x: number, y: number) => word(text, x, y, x + 60, y + 30);
    const p = fx.players.map((u) => u.displayName);
    const engine: OcrEngine = {
      name: "fake-regions",
      // The whole frame is garbage...
      recognize: async (_img, opts) => {
        if (!opts?.sparse) return { text: "??? !!!", confidence: 30 };
        const kind = _img.toString();
        if (kind === "panel")
          return {
            text: "",
            confidence: 70,
            words: [
              word("Whoever#1768499", 348, 18, 706, 45),
              word("ELIMINATIONS", 1046, 40, 1302, 68),
              word("DEATHS", 1486, 44, 1643, 73),
              word("ELIM/D", 1821, 38, 1956, 71),
              word("4]", 1116, 90, 1236, 182), // garbled, rebuilt from the ratio
              word("15", 1512, 90, 1624, 182),
              word("273", 1826, 90, 2076, 182),
            ],
          };
        const names = kind === "left" ? p.slice(0, 2) : p.slice(2, 4);
        return {
          text: "",
          confidence: 80,
          words: names.flatMap((n, i) => [
            cell(n, 100, 100 + i * 100),
            cell("3000", 600, 100 + i * 100),
            cell("500", 900, 100 + i * 100),
            cell(String(20 + i), 1200, 100 + i * 100),
          ]),
        };
      },
    };
    const regions = async () =>
      (["left", "right", "panel"] as const).map((g) => ({
        kind: g === "panel" ? ("panel" as const) : ("table" as const),
        group: g,
        image: Buffer.from(g),
      }));
    expect(await processReading(fx.reading.id, { engine, load, regions })).toBe("completed");

    const done = await prisma.screenshotReading.findUniqueOrThrow({ where: { id: fx.reading.id } });
    expect(done.filledStats).toBe(true);
    const stats = await prisma.playerMatchStat.findMany({
      where: { submissionId: fx.submission.id },
    });
    // Only the player the card belongs to is filled, with their hill time from the table.
    expect(stats.map((s) => [s.playerId, s.kills, s.deaths, s.hillTimeSeconds, s.source])).toEqual([
      [fx.players[0]!.id, 41, 15, 20, "OCR"],
    ]);
  });
});

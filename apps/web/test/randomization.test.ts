import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { verifySpin, type SpinPool, type SpinResult } from "@cod/shared";
import * as reg from "@/modules/registration/service";
import * as events from "@/modules/events/service";
import * as wheel from "@/modules/wheel/service";
import { cleanup, makeEvent, makeHoster, makeUser } from "./setup";

afterAll(cleanup);

async function liveEvent(randomization: "RANDOM" | "SKILL_BALANCED" | "NO_REPEAT_TEAMMATES") {
  const { user: hoster, actor } = await makeHoster();
  const event = await makeEvent(hoster.id, { playerCap: 8, teamSize: 2, roundCount: 3 });
  await prisma.event.update({ where: { id: event.id }, data: { randomization } });
  const players = [];
  for (let i = 0; i < 8; i++) {
    const p = await makeUser();
    const r = await reg.markPaid(actor, (await reg.register(p.id, event.id)).id);
    await events.openCheckIn(actor, event.id).catch(() => {});
    await reg.checkIn(p.id, r.id);
    players.push(p);
  }
  await events.startEvent(actor, event.id);
  return { event, actor, players };
}

const verified = (spin: {
  pool: unknown;
  commitment: string;
  revealedSecret: string | null;
  result: unknown;
}) =>
  verifySpin({
    pool: spin.pool as SpinPool,
    commitment: spin.commitment,
    revealedSecret: spin.revealedSecret!,
    result: spin.result as SpinResult,
  });

describe("team formation modes", () => {
  it("fully random events publish the original pool shape", async () => {
    const { event, actor } = await liveEvent("RANDOM");
    const spin = await wheel.commitSpin(actor, event.id);
    expect(Object.keys(spin.pool as object).sort()).toEqual(["playerIds", "teamSize"]);
    const done = await wheel.executeSpin(actor, spin.id);
    expect(verified(done)).toEqual({ ok: true });
  });

  it("skill-balanced events snapshot ratings into the committed pool and spread the strongest players", async () => {
    const { event, actor, players } = await liveEvent("SKILL_BALANCED");
    // Four proven winners and four proven strugglers.
    for (const [i, p] of players.entries()) {
      const strong = i < 4;
      await prisma.reputationSummary.create({
        data: {
          userId: p.id,
          verifiedMatches: 30,
          verifiedWins: strong ? 24 : 6,
          kills: strong ? 500 : 200,
          deaths: strong ? 250 : 450,
        },
      });
    }
    const spin = await wheel.commitSpin(actor, event.id);
    const pool = spin.pool as unknown as SpinPool;
    expect(pool.mode).toBe("SKILL_BALANCED");
    expect(pool.ratings).toHaveLength(8);
    // The commitment covers the ratings, so they cannot be swapped after the fact.
    const done = await wheel.executeSpin(actor, spin.id);
    expect(verified(done)).toEqual({ ok: true });
    const tampered = {
      ...done,
      pool: { ...pool, ratings: pool.ratings!.map(([id]) => [id, 1000] as const) },
    };
    expect(verified(tampered).ok).toBe(false);

    const strongIds = new Set(players.slice(0, 4).map((p) => p.id));
    const result = done.result as unknown as SpinResult;
    for (const team of result.teams) expect(team.filter((id) => strongIds.has(id))).toHaveLength(1);

    // The public read exposes the mode and ratings but still no unrevealed secret.
    const pub = await events.getEventBySlug(event.slug);
    expect((pub!.rounds[0]!.spin as { secret?: string }).secret).toBeUndefined();
    expect((pub!.rounds[0]!.spin!.pool as { mode?: string }).mode).toBe("SKILL_BALANCED");
  });

  it("no-repeat events carry earlier pairings forward and avoid them next round", async () => {
    const { event, actor } = await liveEvent("NO_REPEAT_TEAMMATES");
    const together = new Set<string>();
    for (let round = 1; round <= 3; round++) {
      const spin = await wheel.commitSpin(actor, event.id);
      const pool = spin.pool as unknown as SpinPool;
      expect(pool.mode).toBe("NO_REPEAT_TEAMMATES");
      expect(pool.teammateCounts!.length).toBe(round === 1 ? 0 : (round - 1) * 4);
      const done = await wheel.executeSpin(actor, spin.id);
      expect(verified(done)).toEqual({ ok: true });
      for (const team of (done.result as unknown as SpinResult).teams) {
        const [a, b] = [...team].sort();
        expect(together.has(`${a}|${b}`)).toBe(false); // 8 players can be paired 3 times without repeats
        together.add(`${a}|${b}`);
      }
      await wheel.completeRound(actor, done.roundId);
    }
  });
});

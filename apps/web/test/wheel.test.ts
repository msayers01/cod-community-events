import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { verifySpin, type SpinPool, type SpinResult } from "@cod/shared";
import * as reg from "@/modules/registration/service";
import * as events from "@/modules/events/service";
import * as wheel from "@/modules/wheel/service";
import { cleanup, makeEvent, makeHoster, makeUser } from "./setup";

afterAll(cleanup);

async function liveEventWithPool(size: number, teamSize: number) {
  const { user: hoster, actor } = await makeHoster();
  const event = await makeEvent(hoster.id, { playerCap: size, teamSize, roundCount: 2 });
  for (let i = 0; i < size; i++) {
    const p = await makeUser();
    const r = await reg.markPaid(actor, (await reg.register(p.id, event.id)).id);
    await events.openCheckIn(actor, event.id).catch(() => {}); // idempotent after first call
    await reg.checkIn(p.id, r.id);
  }
  await events.startEvent(actor, event.id);
  return { event, actor };
}

describe("provably fair wheel", () => {
  it("commits, spins, reveals, and the public log verifies", async () => {
    const { event, actor } = await liveEventWithPool(4, 2);

    const spin = await wheel.commitSpin(actor, event.id);
    expect(spin.status).toBe("COMMITTED");
    expect(spin.revealedSecret).toBeNull();

    // Commit is idempotent while the round is still waiting for the spin.
    expect((await wheel.commitSpin(actor, event.id)).id).toBe(spin.id);

    // The public read never leaks the secret before reveal.
    const publicBefore = await events.getEventBySlug(event.slug);
    expect(publicBefore!.rounds[0]!.spin!.revealedSecret).toBeNull();
    expect((publicBefore!.rounds[0]!.spin as { secret?: string }).secret).toBeUndefined();

    const done = await wheel.executeSpin(actor, spin.id);
    expect(done.status).toBe("REVEALED");
    const result = done.result as unknown as SpinResult;
    expect(result.teams).toHaveLength(2);

    const check = verifySpin({
      pool: done.pool as unknown as SpinPool,
      commitment: done.commitment,
      revealedSecret: done.revealedSecret!,
      result,
    });
    expect(check).toEqual({ ok: true });

    const teams = await prisma.roundTeam.findMany({
      where: { roundId: done.roundId },
      include: { members: true },
    });
    expect(teams.map((t) => t.members.length)).toEqual([2, 2]);

    // Cannot start round 2 until round 1 is complete.
    await expect(wheel.commitSpin(actor, event.id)).rejects.toThrow(/still in progress/);
    await wheel.completeRound(actor, done.roundId);
    const spin2 = await wheel.commitSpin(actor, event.id);
    expect(spin2.commitment).not.toBe(spin.commitment);

    // Overlay payload is display-only and keyed by the unguessable overlay key.
    const overlay = await wheel.overlayState(event.overlayKey);
    expect(overlay!.pool).toHaveLength(4);
    expect(overlay!.spin!.status).toBe("COMMITTED");
    expect(await wheel.overlayState("not-a-real-key")).toBeNull();
  });

  it("refuses to spin before the event is live or with too few players", async () => {
    const { user: hoster, actor } = await makeHoster();
    const event = await makeEvent(hoster.id, { playerCap: 4, teamSize: 2 });
    await expect(wheel.commitSpin(actor, event.id)).rejects.toThrow(/Start the event/);
    await events.openCheckIn(actor, event.id);
    await events.startEvent(actor, event.id);
    await expect(wheel.commitSpin(actor, event.id)).rejects.toThrow(/two full teams/);
  });
});

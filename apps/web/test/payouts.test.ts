import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import * as reg from "@/modules/registration/service";
import * as events from "@/modules/events/service";
import * as rep from "@/modules/reputation/service";
import { cleanup, makeEvent, makeHoster, makeUser } from "./setup";

afterAll(cleanup);

async function completedEvent() {
  const { user: hoster, actor } = await makeHoster();
  const event = await prisma.event.update({
    where: { id: (await makeEvent(hoster.id, { playerCap: 4, teamSize: 2 })).id },
    data: {
      payoutSplit: [
        { place: 1, percent: 70 },
        { place: 2, percent: 30 },
      ],
    },
  });
  const players = [];
  for (let i = 0; i < 4; i++) {
    const p = await makeUser();
    const r = await reg.markPaid(actor, (await reg.register(p.id, event.id)).id);
    await events.openCheckIn(actor, event.id).catch(() => {});
    await reg.checkIn(p.id, r.id);
    players.push(p);
  }
  await events.startEvent(actor, event.id);
  await events.completeEvent(actor, event.id);
  return { event, actor, hoster, players };
}

describe("payout confirmation", () => {
  it("records winners from the pool and prompts them; responses build the hoster record", async () => {
    const { event, actor, hoster, players } = await completedEvent();
    const outsider = await makeUser();

    await expect(
      rep.recordWinners(actor, { eventId: event.id, winners: [{ place: 1, userId: outsider.id }] }),
    ).rejects.toThrow(/in the event pool/);
    await expect(
      rep.recordWinners(actor, {
        eventId: event.id,
        winners: [{ place: 3, userId: players[0]!.id }],
      }),
    ).rejects.toThrow(/no payout/);

    await rep.recordWinners(actor, {
      eventId: event.id,
      winners: [
        { place: 1, userId: players[0]!.id },
        { place: 2, userId: players[1]!.id },
      ],
    });
    await expect(
      rep.recordWinners(actor, {
        eventId: event.id,
        winners: [{ place: 1, userId: players[0]!.id }],
      }),
    ).rejects.toThrow(/already/);

    const pending0 = await rep.pendingPayoutsFor(players[0]!.id);
    expect(pending0).toHaveLength(1);
    expect(pending0[0]!.place).toBe(1);

    // Only the winner can answer, and only once.
    await expect(rep.respondToPayout(players[2]!.id, pending0[0]!.id, true)).rejects.toThrow(
      /not found/,
    );
    await rep.respondToPayout(players[0]!.id, pending0[0]!.id, true);
    await expect(rep.respondToPayout(players[0]!.id, pending0[0]!.id, true)).rejects.toThrow(
      /already/,
    );

    const pending1 = await rep.pendingPayoutsFor(players[1]!.id);
    await rep.respondToPayout(players[1]!.id, pending1[0]!.id, false, "never got the PayPal");

    const record = await rep.hosterPayoutRecord(hoster.id);
    expect(record).toEqual({ completedEvents: 1, paid: 1, notPaid: 1, noResponse: 0 });

    const denied = await prisma.outboxEvent.findMany({ where: { type: "PayoutDenied" } });
    expect(
      denied.some((o) => (o.payload as { winnerId: string }).winnerId === players[1]!.id),
    ).toBe(true);
  });

  it("refuses to record winners before completion", async () => {
    const { user: hoster, actor } = await makeHoster();
    const event = await makeEvent(hoster.id);
    const p = await makeUser();
    await expect(
      rep.recordWinners(actor, { eventId: event.id, winners: [{ place: 1, userId: p.id }] }),
    ).rejects.toThrow(/Complete the event/);
  });
});

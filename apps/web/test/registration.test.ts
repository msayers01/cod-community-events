import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import * as reg from "@/modules/registration/service";
import * as events from "@/modules/events/service";
import { cleanup, makeEvent, makeHoster, makeUser } from "./setup";

afterAll(cleanup);

describe("registration flow", () => {
  it("waitlists on sign-up, confirms on payment, enforces the cap and renumbers the waitlist", async () => {
    const { user: hoster, actor } = await makeHoster();
    const event = await makeEvent(hoster.id, { playerCap: 2 });
    const [a, b, c] = await Promise.all([makeUser(), makeUser(), makeUser()]);

    const ra = await reg.register(a.id, event.id);
    const rb = await reg.register(b.id, event.id);
    const rc = await reg.register(c.id, event.id);
    expect([ra.status, rb.status, rc.status]).toEqual(["WAITLISTED", "WAITLISTED", "WAITLISTED"]);
    expect([ra.waitlistPosition, rb.waitlistPosition, rc.waitlistPosition]).toEqual([1, 2, 3]);

    await expect(reg.register(a.id, event.id)).rejects.toThrow(/already signed up/);

    expect((await reg.markPaid(actor, ra.id)).status).toBe("CONFIRMED");
    expect((await reg.markPaid(actor, rc.id)).status).toBe("CONFIRMED");
    await expect(reg.markPaid(actor, rb.id)).rejects.toThrow(/All paid spots are taken/);

    const waiting = await prisma.registration.findMany({
      where: { eventId: event.id, status: "WAITLISTED" },
    });
    expect(waiting).toHaveLength(1);
    expect(waiting[0]!.waitlistPosition).toBe(1);

    // A paid player withdraws; the spot opens and the worker is told via the outbox.
    await reg.withdraw(a.id, ra.id);
    expect((await reg.markPaid(actor, rb.id)).status).toBe("CONFIRMED");
    const outbox = await prisma.outboxEvent.findMany({ where: { type: "RegistrationWithdrawn" } });
    expect(
      outbox.some((o) => (o.payload as { registrationId: string }).registrationId === ra.id),
    ).toBe(true);
  });

  it("only the event's hoster can mark players paid", async () => {
    const { user: hoster } = await makeHoster();
    const { actor: otherHoster } = await makeHoster();
    const event = await makeEvent(hoster.id);
    const p = await makeUser();
    const r = await reg.register(p.id, event.id);
    await expect(reg.markPaid(otherHoster, r.id)).rejects.toThrow(/not allowed/);
  });

  it("hosters cannot enter their own event and suspended players are rejected", async () => {
    const { user: hoster, actor } = await makeHoster();
    const event = await makeEvent(hoster.id);
    await expect(reg.register(hoster.id, event.id)).rejects.toThrow(/own event/);

    const banned = await makeUser();
    await prisma.sanction.create({
      data: {
        userId: banned.id,
        type: "SUSPENSION",
        reason: "test",
        issuedById: actor.userId,
        endsAt: new Date(Date.now() + 86400_000),
      },
    });
    await expect(reg.register(banned.id, event.id)).rejects.toThrow(/suspended/);
  });

  it("check-in only works while check-in is open; starting the event marks no-shows and builds the pool", async () => {
    const { user: hoster, actor } = await makeHoster();
    const event = await makeEvent(hoster.id, { playerCap: 4 });
    const players = await Promise.all([makeUser(), makeUser(), makeUser()]);
    const regs = [];
    for (const p of players)
      regs.push(await reg.markPaid(actor, (await reg.register(p.id, event.id)).id));

    await expect(reg.checkIn(players[0]!.id, regs[0]!.id)).rejects.toThrow(/not open/);
    await events.openCheckIn(actor, event.id);
    await reg.checkIn(players[0]!.id, regs[0]!.id);
    await reg.checkIn(players[1]!.id, regs[1]!.id);

    await events.startEvent(actor, event.id);
    const after = await prisma.registration.findMany({
      where: { eventId: event.id },
      orderBy: { createdAt: "asc" },
    });
    expect(after.map((r) => r.status)).toEqual(["IN_POOL", "IN_POOL", "NO_SHOW"]);
  });

  it("quick-add resolves by display name or Activision ID", async () => {
    const { user: hoster, actor } = await makeHoster();
    const event = await makeEvent(hoster.id);
    const p = await makeUser();
    const r = await reg.quickAdd(actor, event.id, p.activisionId!, true);
    expect(r.status).toBe("CONFIRMED");
    expect(r.source).toBe("QUICK_ADD");
    await expect(reg.quickAdd(actor, event.id, "nobody#0000000", false)).rejects.toThrow(
      /No player matches/,
    );
  });
});

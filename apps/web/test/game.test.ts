import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import { eventFilterSchema } from "@cod/shared";
import * as events from "@/modules/events/service";
import { cleanup, makeHoster } from "./setup";

afterAll(cleanup);

const input = (extra: object = {}) => {
  const startsAt = new Date(Date.now() + 86_400_000);
  return {
    title: "Game test event",
    mode: "SND",
    format: "SWITCHEROO",
    teamSize: 2,
    roundCount: 2,
    playerCap: 8,
    region: "EU",
    platform: "CROSSPLAY",
    startsAt,
    checkInOpensAt: new Date(startsAt.getTime() - 3_600_000),
    checkInClosesAt: new Date(startsAt.getTime() - 600_000),
    ...extra,
  };
};

describe("event game", () => {
  it("is optional, validated, saved, carried into templates and filterable", async () => {
    const { actor } = await makeHoster();
    const none = await events.createEvent(actor, input());
    expect(none.game).toBeNull();
    const bo6 = await events.createEvent(actor, input({ game: "BO6", title: "BO6 night" }));
    expect(bo6.game).toBe("BO6");
    await expect(events.createEvent(actor, input({ game: "BO3" }))).rejects.toThrow();

    await events.saveTemplateFromEvent(actor, bo6.id, "bo6 template");
    const [tpl] = await events.listTemplates(actor);
    expect((await events.getTemplate(actor, tpl!.id)).settings.game).toBe("BO6");

    await prisma.event.updateMany({
      where: { id: { in: [none.id, bo6.id] } },
      data: { status: "OPEN" },
    });
    const found = await events.listPublicEvents(
      eventFilterSchema.parse({ game: "BO6", limit: 50 }),
    );
    expect(found.events.some((e) => e.id === bo6.id)).toBe(true);
    expect(found.events.some((e) => e.id === none.id)).toBe(false);
    expect(found.events.every((e) => e.game === "BO6")).toBe(true);
  });
});

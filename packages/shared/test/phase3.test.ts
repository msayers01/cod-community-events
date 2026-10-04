import { describe, expect, it } from "vitest";
import {
  createEventSchema,
  createSeasonSchema,
  hasPermission,
  InvalidTransitionError,
  throwFlagMachine,
  type Actor,
} from "../src/index.js";

const staff = (role: Actor["staffRole"]): Actor => ({
  userId: "u",
  staffRole: role,
  isHoster: false,
});

describe("phase 3 permissions", () => {
  it("throw flags are for moderators and above, not trial moderators or hosters", () => {
    expect(hasPermission(staff("TRIAL_MODERATOR"), "throwflag.review")).toBe(false);
    expect(hasPermission(staff("MODERATOR"), "throwflag.review")).toBe(true);
    expect(hasPermission(staff("ADMIN"), "throwflag.review")).toBe(true);
    expect(
      hasPermission({ userId: "h", staffRole: null, isHoster: true }, "throwflag.review"),
    ).toBe(false);
  });
  it("seasons are an admin decision", () => {
    expect(hasPermission(staff("MODERATOR"), "season.manage")).toBe(false);
    expect(hasPermission(staff("ADMIN"), "season.manage")).toBe(true);
  });
});

describe("throw flag lifecycle", () => {
  it("is a review queue: open -> under review -> dismissed or escalated", () => {
    expect(throwFlagMachine.canTransition("OPEN", "UNDER_REVIEW")).toBe(true);
    expect(throwFlagMachine.canTransition("OPEN", "DISMISSED")).toBe(true);
    expect(throwFlagMachine.canTransition("UNDER_REVIEW", "ESCALATED")).toBe(true);
  });
  it("cannot escalate without a review, and resolved flags stay resolved", () => {
    expect(() => throwFlagMachine.assertTransition("OPEN", "ESCALATED")).toThrow(
      InvalidTransitionError,
    );
    expect(throwFlagMachine.isTerminal("DISMISSED")).toBe(true);
    expect(throwFlagMachine.isTerminal("ESCALATED")).toBe(true);
  });
});

describe("schemas", () => {
  const base = {
    title: "Friday SnD",
    mode: "SND",
    format: "SWITCHEROO",
    teamSize: 2,
    roundCount: 3,
    playerCap: 8,
    region: "EU",
    platform: "CROSSPLAY",
    startsAt: "2030-01-01T20:00:00Z",
    checkInOpensAt: "2030-01-01T19:00:00Z",
    checkInClosesAt: "2030-01-01T19:45:00Z",
  };
  it("events default to fully random teams and accept the optional modes", () => {
    expect(createEventSchema.parse(base).randomization).toBe("RANDOM");
    expect(
      createEventSchema.parse({ ...base, randomization: "SKILL_BALANCED" }).randomization,
    ).toBe("SKILL_BALANCED");
    expect(createEventSchema.safeParse({ ...base, randomization: "RIGGED" }).success).toBe(false);
  });
  it("seasons need a sensible window and a logged reason", () => {
    const ok = {
      name: "Season 1",
      startsAt: "2031-01-01T00:00:00Z",
      endsAt: "2031-04-01T00:00:00Z",
      reason: "Quarterly season",
    };
    expect(createSeasonSchema.safeParse(ok).success).toBe(true);
    expect(createSeasonSchema.safeParse({ ...ok, endsAt: ok.startsAt }).success).toBe(false);
    expect(createSeasonSchema.safeParse({ ...ok, endsAt: "2033-01-01T00:00:00Z" }).success).toBe(
      false,
    );
    expect(createSeasonSchema.safeParse({ ...ok, reason: "short" }).success).toBe(false);
  });
});

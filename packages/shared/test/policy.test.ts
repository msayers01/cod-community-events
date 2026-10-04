import { describe, expect, it } from "vitest";
import {
  canGiveSecondApproval,
  canManageEvent,
  hasPermission,
  recusalReason,
  type Actor,
} from "../src/index.js";

const player: Actor = { userId: "u1", staffRole: null, isHoster: false };
const hoster: Actor = { userId: "h1", staffRole: null, isHoster: true };
const trial: Actor = { userId: "t1", staffRole: "TRIAL_MODERATOR", isHoster: false };
const mod: Actor = { userId: "m1", staffRole: "MODERATOR", isHoster: true };
const admin: Actor = { userId: "a1", staffRole: "ADMIN", isHoster: false };

describe("permissions", () => {
  it("anyone can file reports", () => expect(hasPermission(player, "report.file")).toBe(true));
  it("players cannot create events", () =>
    expect(hasPermission(player, "event.create")).toBe(false));
  it("trial mods recommend but do not approve blacklists", () => {
    expect(hasPermission(trial, "blacklist.recommend")).toBe(true);
    expect(hasPermission(trial, "blacklist.approve")).toBe(false);
    expect(hasPermission(trial, "suspension.issue")).toBe(false);
  });
  it("only admins issue permanent bans", () => {
    expect(hasPermission(mod, "ban.permanent")).toBe(false);
    expect(hasPermission(admin, "ban.permanent")).toBe(true);
  });
  it("hosters manage only their own events", () => {
    expect(canManageEvent(hoster, { hosterUserId: "h1" })).toBe(true);
    expect(canManageEvent(hoster, { hosterUserId: "h2" })).toBe(false);
  });
});

describe("recusal", () => {
  const base = { involvedUserIds: ["x", "y"], declaredConflictUserIds: [] as string[] };
  it("allows an uninvolved mod", () => expect(recusalReason(mod, base)).toBeNull());
  it("recuses self", () =>
    expect(recusalReason(mod, { ...base, involvedUserIds: ["m1"] })).toBe("self"));
  it("recuses declared conflicts", () =>
    expect(recusalReason(mod, { ...base, declaredConflictUserIds: ["x"] })).toBe(
      "declared_conflict",
    ));
  it("recuses the event hoster and participants", () => {
    expect(recusalReason(mod, { ...base, eventHosterUserId: "m1" })).toBe("hosted_event");
    expect(recusalReason(mod, { ...base, eventParticipantUserIds: ["m1"] })).toBe(
      "played_in_event",
    );
  });
  it("second approval requires a different, eligible mod", () => {
    expect(canGiveSecondApproval(mod, "m1", base)).toBe(false);
    expect(canGiveSecondApproval(mod, "m2", base)).toBe(true);
    expect(canGiveSecondApproval(trial, "m2", base)).toBe(false);
  });
});

describe("sanctions", () => {
  it("escalate with rank", async () => {
    const { canIssueSanction } = await import("../src/index.js");
    expect(canIssueSanction(trial, "WARNING")).toBe(true);
    expect(canIssueSanction(trial, "SUSPENSION")).toBe(false);
    expect(canIssueSanction(mod, "SUSPENSION")).toBe(true);
    expect(canIssueSanction(mod, "PERMANENT_BAN")).toBe(false);
    expect(canIssueSanction(admin, "PERMANENT_BAN")).toBe(true);
  });
});

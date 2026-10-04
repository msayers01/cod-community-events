import { describe, expect, it } from "vitest";
import {
  appealMachine,
  blacklistMachine,
  computeHosterTier,
  qualifiesVerifiedPlayer,
  submissionMachine,
  canHandleAppeal,
  type Actor,
} from "../src/index.js";

const mod: Actor = { userId: "m1", staffRole: "MODERATOR", isHoster: false };
const trial: Actor = { userId: "t1", staffRole: "TRIAL_MODERATOR", isHoster: false };

describe("phase 2 lifecycles", () => {
  it("submission: pending verifies, disputes go to review, review ends in verified or rejected", () => {
    expect(submissionMachine.canTransition("PENDING", "VERIFIED")).toBe(true);
    expect(submissionMachine.canTransition("PENDING", "DISPUTED")).toBe(true);
    expect(submissionMachine.canTransition("DISPUTED", "VERIFIED")).toBe(false);
    expect(submissionMachine.canTransition("DISPUTED", "UNDER_REVIEW")).toBe(true);
    expect(submissionMachine.canTransition("UNDER_REVIEW", "REJECTED")).toBe(true);
    expect(submissionMachine.isTerminal("VERIFIED")).toBe(true);
  });
  it("blacklist needs a second approval before going active", () => {
    expect(blacklistMachine.canTransition("PROPOSED", "ACTIVE")).toBe(false);
    expect(blacklistMachine.canTransition("PROPOSED", "AWAITING_SECOND_APPROVAL")).toBe(true);
    expect(blacklistMachine.canTransition("AWAITING_SECOND_APPROVAL", "ACTIVE")).toBe(true);
    expect(blacklistMachine.canTransition("ACTIVE", "REMOVED")).toBe(true);
  });
  it("appeals", () => {
    expect(appealMachine.canTransition("SUBMITTED", "OVERTURNED")).toBe(false);
    expect(appealMachine.canTransition("UNDER_REVIEW", "OVERTURNED")).toBe(true);
  });
});

describe("tiers and badges", () => {
  const old = new Date(Date.now() - 200 * 86400_000);
  it("new hosters stay new", () =>
    expect(
      computeHosterTier({
        completedEvents: 2,
        confirmedPayouts: 2,
        deniedPayouts: 0,
        firstEventAt: old,
      }),
    ).toBe("NEW"));
  it("verified after 5 clean events", () =>
    expect(
      computeHosterTier({
        completedEvents: 5,
        confirmedPayouts: 5,
        deniedPayouts: 0,
        firstEventAt: old,
      }),
    ).toBe("VERIFIED"));
  it("any denied payout blocks verification", () =>
    expect(
      computeHosterTier({
        completedEvents: 30,
        confirmedPayouts: 40,
        deniedPayouts: 1,
        firstEventAt: old,
      }),
    ).toBe("NEW"));
  it("trusted needs volume and tenure", () => {
    expect(
      computeHosterTier({
        completedEvents: 25,
        confirmedPayouts: 30,
        deniedPayouts: 0,
        firstEventAt: old,
      }),
    ).toBe("TRUSTED");
    expect(
      computeHosterTier({
        completedEvents: 25,
        confirmedPayouts: 30,
        deniedPayouts: 0,
        firstEventAt: new Date(),
      }),
    ).toBe("VERIFIED");
  });
  it("verified player", () => {
    expect(
      qualifiesVerifiedPlayer({
        linkedAccounts: 1,
        eventsPlayed: 10,
        sanctions: 0,
        activeBlacklist: false,
      }),
    ).toBe(true);
    expect(
      qualifiesVerifiedPlayer({
        linkedAccounts: 0,
        eventsPlayed: 10,
        sanctions: 0,
        activeBlacklist: false,
      }),
    ).toBe(false);
    expect(
      qualifiesVerifiedPlayer({
        linkedAccounts: 1,
        eventsPlayed: 10,
        sanctions: 1,
        activeBlacklist: false,
      }),
    ).toBe(false);
  });
  it("appeals need a moderator who was not involved", () => {
    const c = { involvedUserIds: ["x"], declaredConflictUserIds: [] };
    expect(canHandleAppeal(mod, ["m2"], c)).toBe(true);
    expect(canHandleAppeal(mod, ["m1"], c)).toBe(false);
    expect(canHandleAppeal(trial, ["m2"], c)).toBe(false);
  });
});

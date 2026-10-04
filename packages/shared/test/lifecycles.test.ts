import { describe, expect, it } from "vitest";
import { eventMachine, registrationMachine, InvalidTransitionError } from "../src/index.js";

describe("event lifecycle", () => {
  it("allows the happy path", () => {
    const path = ["DRAFT", "OPEN", "CHECK_IN", "LIVE", "COMPLETED", "ARCHIVED"] as const;
    for (let i = 0; i < path.length - 1; i++) {
      expect(eventMachine.canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });
  it("rejects skipping states", () => {
    expect(eventMachine.canTransition("DRAFT", "LIVE")).toBe(false);
    expect(() => eventMachine.assertTransition("COMPLETED", "LIVE")).toThrow(
      InvalidTransitionError,
    );
  });
  it("staff can pause and resume live events", () => {
    expect(eventMachine.canTransition("LIVE", "PAUSED")).toBe(true);
    expect(eventMachine.canTransition("PAUSED", "LIVE")).toBe(true);
    expect(eventMachine.canTransition("PAUSED", "CANCELLED")).toBe(true);
  });
  it("terminal states cannot move", () => {
    expect(eventMachine.isTerminal("CANCELLED")).toBe(true);
    expect(eventMachine.isTerminal("ARCHIVED")).toBe(true);
  });
});

describe("registration lifecycle", () => {
  it("waitlisted -> confirmed -> checked in -> in pool", () => {
    expect(registrationMachine.canTransition("WAITLISTED", "CONFIRMED")).toBe(true);
    expect(registrationMachine.canTransition("CONFIRMED", "CHECKED_IN")).toBe(true);
    expect(registrationMachine.canTransition("CHECKED_IN", "IN_POOL")).toBe(true);
  });
  it("cannot check in without paying", () => {
    expect(registrationMachine.canTransition("WAITLISTED", "CHECKED_IN")).toBe(false);
  });
});

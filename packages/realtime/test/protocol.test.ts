import { describe, expect, it } from "vitest";
import { isRoom, parseEnvelope, rooms } from "../src/index.js";

describe("realtime protocol", () => {
  it("builds and validates rooms", () => {
    expect(rooms.event("abc")).toBe("event:abc");
    expect(isRoom("overlay:k_-1")).toBe(true);
    expect(rooms.leaderboards()).toBe("leaderboard:all");
    expect(isRoom("leaderboard:all")).toBe(true);
    expect(isRoom("event:")).toBe(false);
    expect(isRoom("admin:x")).toBe(false);
    expect(isRoom("event:has space")).toBe(false);
  });
  it("parses only well-formed envelopes", () => {
    const ok = parseEnvelope(
      JSON.stringify({ room: "event:1", event: "event.updated", data: { eventId: "1" } }),
    );
    expect(ok?.event).toBe("event.updated");
    const lb = parseEnvelope(
      JSON.stringify({
        room: "leaderboard:all",
        event: "leaderboard.updated",
        data: { period: "MONTH", periodKey: "2026-10" },
      }),
    );
    expect(lb?.event).toBe("leaderboard.updated");
    expect(parseEnvelope("not json")).toBeNull();
    expect(parseEnvelope(JSON.stringify({ room: "event:1", event: "evil", data: {} }))).toBeNull();
    expect(
      parseEnvelope(JSON.stringify({ room: "nope", event: "event.updated", data: {} })),
    ).toBeNull();
  });
});

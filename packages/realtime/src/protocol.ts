/**
 * Real-time protocol shared by the publisher (web, worker), the Socket.IO
 * server (apps/realtime) and browser clients.
 *
 * Rooms:
 *   event:<eventId>       public; anything shown on the event page
 *   overlay:<overlayKey>  private; keyed by the unguessable overlay key
 *   leaderboard:all       public; a board was recalculated
 */

export const REDIS_CHANNEL = "cod:realtime";

export type Room = `event:${string}` | `overlay:${string}` | `leaderboard:${string}`;

export const rooms = {
  event: (eventId: string): Room => `event:${eventId}`,
  overlay: (overlayKey: string): Room => `overlay:${overlayKey}`,
  leaderboards: (): Room => "leaderboard:all",
};

export interface EventUpdated {
  eventId: string;
  status: string;
  confirmedCount: number;
  waitlistCount: number;
  checkedInCount: number;
  /** Which kind of change happened, for clients that want to react selectively. */
  reason: "registration" | "status" | "spin" | "other";
}

/** A leaderboard was recalculated. Clients re-read it from the server. */
export interface LeaderboardUpdated {
  period: string;
  periodKey: string;
}

export interface OverlayState {
  eventId: string;
  title: string;
  status: string;
  teamSize: number;
  pool: string[];
  round: { number: number; status: string } | null;
  spin: {
    id: string;
    status: string;
    commitment: string;
    poolHash: string;
    revealedSecret: string | null;
    spunAt: string | null;
    teams: string[][] | null;
  } | null;
}

/** Server -> client events. */
export interface ServerEvents {
  "event.updated": (data: EventUpdated) => void;
  "overlay.state": (data: OverlayState) => void;
  "leaderboard.updated": (data: LeaderboardUpdated) => void;
}

/** Client -> server events. */
export interface ClientEvents {
  "join.event": (eventId: string) => void;
  "join.overlay": (overlayKey: string) => void;
  "join.leaderboards": () => void;
}

/** Envelope carried over Redis pub/sub from publishers to Socket.IO instances. */
export type Envelope =
  | { room: Room; event: "event.updated"; data: EventUpdated }
  | { room: Room; event: "overlay.state"; data: OverlayState }
  | { room: Room; event: "leaderboard.updated"; data: LeaderboardUpdated };

const ROOM_RE = /^(event|overlay|leaderboard):[A-Za-z0-9_-]{1,128}$/;

export function isRoom(value: unknown): value is Room {
  return typeof value === "string" && ROOM_RE.test(value);
}

export function parseEnvelope(raw: string): Envelope | null {
  try {
    const v = JSON.parse(raw) as Partial<Envelope>;
    if (!isRoom(v.room)) return null;
    if (
      v.event !== "event.updated" &&
      v.event !== "overlay.state" &&
      v.event !== "leaderboard.updated"
    )
      return null;
    if (typeof v.data !== "object" || v.data === null) return null;
    return v as Envelope;
  } catch {
    return null;
  }
}

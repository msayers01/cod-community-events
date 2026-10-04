/** Points for a verified match. Playing counts, so active players climb; winning counts more. */
export const POINTS = { win: 3, loss: 1 } as const;

/** Matches a player needs in a period before they are ranked, so one lucky win doesn't top the board. */
export const MIN_RANKED_MATCHES = 3;

export interface PlayerMatchResult {
  userId: string;
  won: boolean;
  kills: number;
  deaths: number;
}

export interface Standing {
  userId: string;
  rank: number;
  points: number;
  matches: number;
  wins: number;
  losses: number;
  kills: number;
  deaths: number;
}

/**
 * Standings from verified match results. Order: points, then wins, then K/D, then more
 * matches played, then user id so the output is deterministic.
 */
export function computeStandings(
  results: readonly PlayerMatchResult[],
  minMatches = MIN_RANKED_MATCHES,
): Standing[] {
  const byUser = new Map<string, Omit<Standing, "rank">>();
  for (const r of results) {
    const s = byUser.get(r.userId) ?? {
      userId: r.userId,
      points: 0,
      matches: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
    };
    s.matches++;
    if (r.won) {
      s.wins++;
      s.points += POINTS.win;
    } else {
      s.losses++;
      s.points += POINTS.loss;
    }
    s.kills += r.kills;
    s.deaths += r.deaths;
    byUser.set(r.userId, s);
  }
  const kd = (s: { kills: number; deaths: number }) => (s.kills + 1) / (s.deaths + 1);
  return [...byUser.values()]
    .filter((s) => s.matches >= minMatches)
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.wins - a.wins ||
        kd(b) - kd(a) ||
        b.matches - a.matches ||
        (a.userId < b.userId ? -1 : 1),
    )
    .map((s, i) => ({ ...s, rank: i + 1 }));
}

// ───────────── Periods ─────────────

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** [start, end) of a month key like "2026-10", in UTC. Null for anything else. */
export function monthWindow(key: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(key);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]) - 1;
  return { start: new Date(Date.UTC(year, month, 1)), end: new Date(Date.UTC(year, month + 1, 1)) };
}

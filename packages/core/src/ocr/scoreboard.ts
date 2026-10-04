/**
 * Turning OCR text from a scoreboard screenshot into per-player stats. Pure functions:
 * the OCR engine lives in the worker, so everything here is testable with plain strings.
 *
 * Scoreboard layouts differ by game, mode and platform, so instead of assuming a fixed
 * column order we find the header row ("PLAYER SCORE KILLS DEATHS ...") and read each
 * data row against the order the header gives. A screenshot with no recognisable
 * header yields no rows rather than guesses.
 */

export type StatField = "kills" | "deaths" | "plants" | "defuses" | "hillTimeSeconds";

export type ReadStats = Partial<Record<StatField, number>>;

const STAT_LABELS: Record<string, StatField> = {
  KILLS: "kills",
  KILL: "kills",
  K: "kills",
  DEATHS: "deaths",
  DEATH: "deaths",
  D: "deaths",
  PLANTS: "plants",
  PLANT: "plants",
  PLANTED: "plants",
  DEFUSES: "defuses",
  DEFUSE: "defuses",
  DEFUSED: "defuses",
  TIME: "hillTimeSeconds",
  HILLTIME: "hillTimeSeconds",
  HILL: "hillTimeSeconds",
  ONHILL: "hillTimeSeconds",
};

/** Columns that exist on scoreboards but we don't track; kept so numbers still line up. */
const IGNORED_LABELS = new Set([
  "SCORE",
  "ASSISTS",
  "ASSIST",
  "A",
  "DAMAGE",
  "KD",
  "RATIO",
  "PING",
  "XP",
  "HEADSHOTS",
  "STREAK",
  "CAPTURES",
  "DEFENDS",
  "OBJ",
  "OBJECTIVE",
  "ACCURACY",
]);

type Column = StatField | null;

const MAX_STAT = 500;
const MAX_HILL_SECONDS = 36_000;

function labelOf(token: string): Column | undefined {
  const t = token.toUpperCase().replace(/[^A-Z]/g, "");
  if (t in STAT_LABELS) return STAT_LABELS[t];
  if (IGNORED_LABELS.has(t)) return null;
  return undefined;
}

/** Find the header row and the column order it implies. */
export function findHeader(lines: readonly string[]): { index: number; columns: Column[] } | null {
  for (let i = 0; i < lines.length; i++) {
    const tokens = lines[i]!.split(/\s+/).filter(Boolean);
    if (tokens.length < 2 || tokens.some((t) => /\d/.test(t))) continue;
    const columns: Column[] = [];
    for (const t of tokens) {
      const c = labelOf(t);
      if (c !== undefined) columns.push(c);
    }
    const stats = columns.filter((c): c is StatField => c !== null);
    // A header must name kills and deaths, and mostly consist of column labels.
    if (
      stats.includes("kills") &&
      stats.includes("deaths") &&
      columns.length >= Math.ceil(tokens.length / 2)
    )
      return { index: i, columns };
  }
  return null;
}

/** OCR confuses digits with look-alike letters; repair short tokens that already contain a digit. */
function repairNumber(token: string): string {
  if (token.length > 5 || !/\d/.test(token)) return token;
  return token
    .replace(/[Oo]/g, "0")
    .replace(/[Il|]/g, "1")
    .replace(/[Ss]/g, "5")
    .replace(/B/g, "8");
}

/** "17" -> 17, "1:23" -> 83 (m:ss). Null when the token isn't a number. */
export function parseNumeric(token: string): number | null {
  const t = repairNumber(token);
  const clock = /^(\d{1,3}):([0-5]\d)$/.exec(t);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);
  return /^\d{1,5}$/.test(t) ? Number(t) : null;
}

export interface ScoreboardRow {
  rawName: string;
  stats: ReadStats;
}

export function parseScoreboard(text: string): { columns: StatField[]; rows: ScoreboardRow[] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const header = findHeader(lines);
  if (!header) return { columns: [], rows: [] };

  const rows: ScoreboardRow[] = [];
  for (const line of lines.slice(header.index + 1)) {
    const tokens = line.split(/\s+/);
    // The longest run of numbers at the end of the line; extra leading numbers belong to the name.
    let start = tokens.length;
    while (start > 0 && parseNumeric(tokens[start - 1]!) !== null) start--;
    const numbers = tokens.slice(start).map((t) => parseNumeric(t)!);
    const n = header.columns.length;
    if (numbers.length < n) continue;
    const values = numbers.slice(numbers.length - n);
    const name = [...tokens.slice(0, start), ...numbers.slice(0, numbers.length - n).map(String)]
      .join(" ")
      .trim();
    if (name.replace(/[^A-Za-z0-9]/g, "").length < 2) continue;

    const stats: ReadStats = {};
    let sane = true;
    header.columns.forEach((col, i) => {
      if (!col) return;
      const v = values[i]!;
      if (v > (col === "hillTimeSeconds" ? MAX_HILL_SECONDS : MAX_STAT)) sane = false;
      stats[col] = v;
    });
    if (sane) rows.push({ rawName: name, stats });
  }
  return { columns: header.columns.filter((c): c is StatField => c !== null), rows };
}

// ───────────── Matching rows to players ─────────────

export interface PlayerCandidate {
  playerId: string;
  /** Names the player may appear under: display name, Activision ID without the #number. */
  names: readonly string[];
}

export interface MatchedRow extends ScoreboardRow {
  playerId: string | null;
  /** 0-1 similarity of the matched name; 0 when unmatched. */
  similarity: number;
}

export function normalizeName(name: string): string {
  return name
    .replace(/\[[^\]]*\]/g, "") // clan tags
    .replace(/#\d+$/, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]!;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length]!;
}

function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const edit = 1 - editDistance(a, b) / Math.max(a.length, b.length);
  // Decorations around a name ("xX_Ghost_Xx") still identify the player when the core is distinctive.
  const contained = Math.min(a.length, b.length) >= 4 && (a.includes(b) || b.includes(a));
  return contained ? Math.max(edit, 0.8) : edit;
}

const MIN_SIMILARITY = 0.75;
const MIN_MARGIN = 0.1;

/**
 * Attach each row to at most one player, each player to at most one row. Close calls
 * (two players that look alike) are left unmatched rather than guessed.
 */
export function matchRows(
  rows: readonly ScoreboardRow[],
  candidates: readonly PlayerCandidate[],
): MatchedRow[] {
  const scored = rows.map((row) => {
    const n = normalizeName(row.rawName);
    return candidates
      .map((c) => ({
        playerId: c.playerId,
        score: Math.max(0, ...c.names.map((name) => similarity(n, normalizeName(name)))),
      }))
      .sort((a, b) => b.score - a.score);
  });
  const out: MatchedRow[] = rows.map((r) => ({ ...r, playerId: null, similarity: 0 }));
  const taken = new Set<string>();
  // Most confident rows claim players first.
  const order = scored
    .map((s, i) => ({ i, best: s[0]?.score ?? 0 }))
    .sort((a, b) => b.best - a.best);
  for (const { i } of order) {
    const options = scored[i]!.filter((o) => !taken.has(o.playerId));
    const best = options[0];
    if (!best || best.score < MIN_SIMILARITY) continue;
    const second = options[1];
    if (second && best.score - second.score < MIN_MARGIN && second.score >= MIN_SIMILARITY)
      continue;
    out[i] = { ...rows[i]!, playerId: best.playerId, similarity: best.score };
    taken.add(best.playerId);
  }
  return out;
}

// ───────────── Comparing with what was submitted ─────────────

export interface Discrepancy {
  playerId: string;
  field: StatField;
  submitted: number;
  read: number;
}

export function compareToSubmitted(
  read: readonly MatchedRow[],
  submitted: readonly ({ playerId: string } & ReadStats)[],
): Discrepancy[] {
  const out: Discrepancy[] = [];
  for (const s of submitted) {
    const row = read.find((r) => r.playerId === s.playerId);
    if (!row) continue;
    for (const field of ["kills", "deaths", "plants", "defuses", "hillTimeSeconds"] as const) {
      const a = s[field];
      const b = row.stats[field];
      if (a !== undefined && a !== null && b !== undefined && a !== b)
        out.push({ playerId: s.playerId, field, submitted: a, read: b });
    }
  }
  return out;
}

/** Engine confidence below this is never used to fill in stats. */
export const MIN_FILL_CONFIDENCE = 60;

/**
 * When the submitter left stats blank, decide whether the reading is good enough to
 * pre-fill them (as unverified stats the confirmers still see and can dispute).
 * Needs a confident reading and at least half the players recognised.
 */
export function planFill(input: {
  rows: readonly MatchedRow[];
  participants: number;
  confidence: number | null;
}): ({ playerId: string } & ReadStats)[] {
  if ((input.confidence ?? 0) < MIN_FILL_CONFIDENCE) return [];
  const usable = input.rows.filter(
    (r): r is MatchedRow & { playerId: string } =>
      r.playerId !== null && r.stats.kills !== undefined && r.stats.deaths !== undefined,
  );
  if (usable.length < 2 || usable.length < Math.ceil(input.participants / 2)) return [];
  return usable.map((r) => ({ playerId: r.playerId, ...r.stats }));
}

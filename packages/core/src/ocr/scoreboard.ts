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

export type Column = StatField | null;

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
  return {
    columns: header.columns.filter((c): c is StatField => c !== null),
    rows: parseRows(lines.slice(header.index + 1), header.columns),
  };
}

/** Read "name n n n" lines against a known column order (null = a column we don't track). */
export function parseRows(lines: readonly string[], columns: readonly Column[]): ScoreboardRow[] {
  const rows: ScoreboardRow[] = [];
  for (const line of lines) {
    const tokens = line.split(/\s+/);
    // The longest run of numbers at the end of the line; extra leading numbers belong to the name.
    let start = tokens.length;
    while (start > 0 && parseNumeric(tokens[start - 1]!) !== null) start--;
    const numbers = tokens.slice(start).map((t) => parseNumeric(t)!);
    const n = columns.length;
    if (numbers.length < n) continue;
    const values = numbers.slice(numbers.length - n);
    const name = [...tokens.slice(0, start), ...numbers.slice(0, numbers.length - n).map(String)]
      .join(" ")
      .trim();
    if (name.replace(/[^A-Za-z0-9]/g, "").length < 2) continue;

    const stats: ReadStats = {};
    let sane = true;
    columns.forEach((col, i) => {
      if (!col) return;
      const v = values[i]!;
      if (v > (col === "hillTimeSeconds" ? MAX_HILL_SECONDS : MAX_STAT)) sane = false;
      stats[col] = v;
    });
    if (sane) rows.push({ rawName: name, stats });
  }
  return rows;
}

// ───────────── Word positions ─────────────

export interface OcrWord {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Rebuild text lines from positioned words. Sparse-text OCR emits each cell of a table
 * as its own line, so rows have to be reassembled from where the words sit.
 */
export function linesFromWords(words: readonly OcrWord[]): string[] {
  const usable = words.filter((w) => w.text.trim() && w.y1 > w.y0);
  if (usable.length === 0) return [];
  const heights = usable.map((w) => w.y1 - w.y0).sort((a, b) => a - b);
  const tolerance = heights[Math.floor(heights.length / 2)]! * 0.6;
  const byY = [...usable].sort((a, b) => a.y0 + a.y1 - (b.y0 + b.y1));
  const lines: OcrWord[][] = [];
  for (const w of byY) {
    const mid = (w.y0 + w.y1) / 2;
    const line = lines.find((l) => {
      const m = l.reduce((sum, x) => sum + (x.y0 + x.y1) / 2, 0) / l.length;
      return Math.abs(m - mid) <= tolerance;
    });
    if (line) line.push(w);
    else lines.push([w]);
  }
  return lines
    .sort((a, b) => a[0]!.y0 - b[0]!.y0)
    .map((l) =>
      l
        .sort((a, b) => a.x0 - b.x0)
        .map((w) => w.text.trim())
        .join(" "),
    );
}

/**
 * Hardpoint team table: "RANK PLAYER SCORE OBJ. SCORE TIME". Only time on the hill is a stat
 * we track; score and objective score are read past so the columns line up.
 */
export const HARDPOINT_TABLE_COLUMNS: Column[] = [null, null, "hillTimeSeconds"];

// ───────────── The "my stats" panel ─────────────

export interface PanelReading {
  /** The 6-8 digit id after the # in the player's name, if read. */
  idDigits: string | null;
  /** The name before the #, if read. */
  name: string | null;
  kills: number | null;
  deaths: number | null;
  ratio: number | null;
  /** True when a number was rebuilt from the other two because the read value was missing or disagreed. */
  repaired: boolean;
}

function numberBelow(label: OcrWord, words: readonly OcrWord[]): number | null {
  const cx = (label.x0 + label.x1) / 2;
  const reach = (label.x1 - label.x0) * 0.75;
  const below = words
    .filter((w) => w.y0 >= label.y1 - 4 && Math.abs((w.x0 + w.x1) / 2 - cx) <= reach)
    .map((w) => ({
      w,
      v: /^\d+([.,]\d+)?$/.test(w.text) ? Number(w.text.replace(",", ".")) : null,
    }))
    .filter((x): x is { w: OcrWord; v: number } => x.v !== null)
    .sort((a, b) => a.w.y0 - b.w.y0);
  return below[0]?.v ?? null;
}

/**
 * Read the stats card the game shows for the player who took the screenshot:
 * ELIMINATIONS, DEATHS and ELIM/D RATIO sit above their values. The ratio is redundant
 * with the other two, so we use it as a check, and to rebuild a digit OCR dropped.
 */
export function parsePanel(words: readonly OcrWord[]): PanelReading | null {
  const find = (re: RegExp) => words.find((w) => re.test(w.text.replace(/[^A-Za-z/]/g, "")));
  const elim = find(/^ELIMINATIONS$/i);
  const deaths = find(/^DEATHS$/i);
  const ratioLabel = find(/^ELIM\/?D$/i);
  if (!elim || !deaths) return null;

  let kills = numberBelow(elim, words);
  let death = numberBelow(deaths, words);
  let ratio = ratioLabel ? numberBelow(ratioLabel, words) : null;
  // OCR often drops the decimal point: "273" is 2.73.
  if (ratio !== null && Number.isInteger(ratio) && ratio >= 10) ratio /= 100;
  let repaired = false;
  if (ratio !== null && ratio > 0) {
    const r = ratio;
    const fits = (k: number | null, d: number | null) =>
      k !== null && d !== null && d > 0 && Math.abs(k / d - r) <= 0.0051;
    if (!fits(kills, death)) {
      // One number is missing or wrong. The ratio can rebuild it, but only when that is unambiguous.
      const k = death !== null ? Math.round(r * death) : null;
      const d = kills !== null ? Math.round(kills / r) : null;
      const killsFixable = fits(k, death) && (kills === null || death !== null);
      const deathsFixable = fits(kills, d) && (death === null || kills !== null);
      if (killsFixable && !deathsFixable) {
        kills = k;
        repaired = true;
      } else if (deathsFixable && !killsFixable) {
        death = d;
        repaired = true;
      }
    }
  }
  const id = words.find((w) => /#\d{4,}/.test(w.text));
  const idMatch = id ? /^(.*?)#(\d{4,})/.exec(id.text) : null;
  return {
    idDigits: idMatch?.[2] ?? null,
    name: idMatch?.[1] ? idMatch[1] : null,
    kills,
    deaths: death,
    ratio,
    repaired,
  };
}

/** A panel is only trusted when kills, deaths and the ratio agree with each other. */
export function panelIsConsistent(
  p: PanelReading,
): p is PanelReading & { kills: number; deaths: number } {
  if (p.kills === null || p.deaths === null) return false;
  if (p.ratio === null || p.deaths === 0) return false;
  return Math.abs(p.kills / p.deaths - p.ratio) <= 0.0051;
}

/** Which player the panel belongs to: exact id digits first, then a close name. */
export function panelOwner(
  panel: PanelReading,
  players: readonly { playerId: string; names: readonly string[]; activisionId?: string | null }[],
): string | null {
  if (panel.idDigits) {
    const byId = players.filter((p) => p.activisionId?.endsWith(`#${panel.idDigits}`));
    if (byId.length === 1) return byId[0]!.playerId;
  }
  if (panel.name) {
    const m = matchRows(
      [{ rawName: panel.name, stats: {} }],
      players.map((p) => ({ playerId: p.playerId, names: p.names })),
    )[0];
    return m?.playerId ?? null;
  }
  return null;
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

/**
 * Remove "[TAG]" groups. Done with a scan instead of a regex: `/\[[^\]]*\]/g` is quadratic on
 * input with many "[" and no "]", and this runs on OCR text.
 */
export function stripBracketTags(text: string): string {
  let out = "";
  let i = 0;
  while (i < text.length) {
    if (text[i] === "[") {
      const close = text.indexOf("]", i + 1);
      // No "]" anywhere after this point means no later "[" can close either: keep the rest.
      if (close === -1) return out + text.slice(i);
      i = close + 1;
    } else out += text[i++];
  }
  return out;
}

export function normalizeName(name: string): string {
  return stripBracketTags(name) // clan tags
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

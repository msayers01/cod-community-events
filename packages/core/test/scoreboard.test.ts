import { describe, expect, it } from "vitest";
import {
  compareToSubmitted,
  findHeader,
  matchRows,
  parseNumeric,
  parseScoreboard,
  planFill,
} from "../src/ocr/scoreboard.js";

const SND = `
SEARCH & DESTROY
PLAYER        SCORE  KILLS  DEATHS  ASSISTS  PLANTS  DEFUSES
[ABC] Viper   2400   9      4       1        2       0
NightOwl      1900   7      5       2        0       1
xX_Ghost_Xx   1100   3      8       0        0       0
Ra1nb0w       950    2      7       1        0       0
some noise line
`;

describe("scoreboard parsing", () => {
  it("reads the column order from the header", () => {
    const { columns, rows } = parseScoreboard(SND);
    expect(columns).toEqual(["kills", "deaths", "plants", "defuses"]);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toEqual({
      rawName: "[ABC] Viper",
      stats: { kills: 9, deaths: 4, plants: 2, defuses: 0 },
    });
  });

  it("adapts to a different layout (hardpoint with m:ss hill time)", () => {
    const { rows } = parseScoreboard(`
      Name  Kills  Deaths  Time
      Viper 21 14 1:23
    `);
    expect(rows[0]!.stats).toEqual({ kills: 21, deaths: 14, hillTimeSeconds: 83 });
  });

  it("returns nothing when there is no recognisable header", () => {
    expect(parseScoreboard("Viper 9 4\nNightOwl 7 5").rows).toEqual([]);
    expect(findHeader(["KILLS"])).toBeNull();
  });

  it("repairs digit look-alikes and drops implausible rows", () => {
    expect(parseNumeric("1O")).toBe(10);
    expect(parseNumeric("l7")).toBe(17);
    expect(parseNumeric("Boss")).toBeNull();
    const { rows } = parseScoreboard("PLAYER KILLS DEATHS\nViper 1O 4\nGlitch 99999 4");
    expect(rows.map((r) => r.stats.kills)).toEqual([10]);
  });

  it("keeps digits that belong to the name", () => {
    const { rows } = parseScoreboard("PLAYER KILLS DEATHS\nPlayer 7 12 3");
    expect(rows[0]).toEqual({ rawName: "Player 7", stats: { kills: 12, deaths: 3 } });
  });
});

describe("matching rows to players", () => {
  const players = [
    { playerId: "p1", names: ["Viper", "Viper#1234567"] },
    { playerId: "p2", names: ["NightOwl"] },
    { playerId: "p3", names: ["Ghost"] },
    { playerId: "p4", names: ["Rainbow"] },
  ];
  it("matches through clan tags and small OCR errors", () => {
    const { rows } = parseScoreboard(SND);
    const m = matchRows(rows, players);
    expect(m.map((r) => r.playerId)).toEqual(["p1", "p2", "p3", null]); // Ra1nb0w is too far from Rainbow
  });
  it("does not guess between look-alike names", () => {
    const m = matchRows(
      [{ rawName: "Viper1", stats: {} }],
      [
        { playerId: "a", names: ["Viper"] },
        { playerId: "b", names: ["Viper2"] },
      ],
    );
    expect(m[0]!.playerId).toBeNull();
  });
  it("uses each player once", () => {
    const m = matchRows(
      [
        { rawName: "Viper", stats: {} },
        { rawName: "Viper", stats: {} },
      ],
      [{ playerId: "a", names: ["Viper"] }],
    );
    expect(m.filter((r) => r.playerId).length).toBe(1);
  });
});

describe("comparison and fill", () => {
  const matched = matchRows(parseScoreboard(SND).rows, [
    { playerId: "p1", names: ["Viper"] },
    { playerId: "p2", names: ["NightOwl"] },
    { playerId: "p3", names: ["Ghost"] },
    { playerId: "p4", names: ["Rainbow"] },
  ]);
  it("reports only fields that differ", () => {
    const d = compareToSubmitted(matched, [
      { playerId: "p1", kills: 9, deaths: 4 },
      { playerId: "p2", kills: 12, deaths: 5 },
    ]);
    expect(d).toEqual([{ playerId: "p2", field: "kills", submitted: 12, read: 7 }]);
  });
  it("fills blanks only from a confident reading that recognised enough players", () => {
    expect(planFill({ rows: matched, participants: 4, confidence: 85 })).toHaveLength(3);
    expect(planFill({ rows: matched, participants: 4, confidence: 40 })).toEqual([]);
    expect(planFill({ rows: matched, participants: 8, confidence: 85 })).toEqual([]);
  });
});

// ───────────── Hardpoint card (measured on a real screenshot) ─────────────

import {
  linesFromWords,
  panelIsConsistent,
  panelOwner,
  parsePanel,
  parseRows,
  HARDPOINT_TABLE_COLUMNS,
} from "../src/ocr/scoreboard.js";

const w = (text: string, x0: number, y0: number, x1: number, y1: number) => ({
  text,
  x0,
  y0,
  x1,
  y1,
});
// Word boxes as Tesseract reported them for the stats card on a real Hardpoint scoreboard.
const card = (kills: string, deaths: string, ratio: string) => [
  w("Mr", 294, 18, 337, 45),
  w("Waternoos#1768499", 348, 18, 706, 45),
  w("ELIMINATIONS", 1046, 40, 1302, 68),
  w("DEATHS", 1486, 44, 1643, 73),
  w("ELIM/D", 1821, 38, 1956, 71),
  w("RATIO", 1975, 40, 2076, 68),
  w(kills, 1116, 90, 1236, 182),
  w(deaths, 1512, 90, 1624, 182),
  w(ratio, 1826, 90, 2076, 182),
  w("555", 2226, 90, 2453, 182),
];

describe("stats card", () => {
  it("reads kills, deaths and the ratio under their labels, restoring the dropped decimal point", () => {
    expect(parsePanel(card("41", "15", "273"))).toMatchObject({
      kills: 41,
      deaths: 15,
      ratio: 2.73,
      idDigits: "1768499",
      name: "Waternoos",
      repaired: false,
    });
  });
  it("rebuilds a number that OCR dropped or garbled, using the ratio as a check", () => {
    expect(parsePanel(card("4]", "15", "273"))).toMatchObject({
      kills: 41,
      deaths: 15,
      repaired: true,
    });
    expect(parsePanel(card("41", "5", "273"))).toMatchObject({
      kills: 41,
      deaths: 15,
      repaired: true,
    });
    expect(parsePanel(card("41", "", "273"))).toMatchObject({
      kills: 41,
      deaths: 15,
      repaired: true,
    });
  });
  it("refuses to trust a card whose numbers cannot be reconciled", () => {
    const bad = parsePanel(card("41", "15", "310"))!;
    expect(panelIsConsistent(bad)).toBe(false);
    expect(panelIsConsistent(parsePanel(card("41", "15", "273"))!)).toBe(true);
    expect(parsePanel([w("nothing", 0, 0, 10, 10)])).toBeNull();
  });
  it("is attributed to a player by the id in their name, or failing that a close name", () => {
    const players = [
      { playerId: "a", names: ["Mr Waternoos"], activisionId: "Mr Waternoos#1768499" },
      { playerId: "b", names: ["Snaz"], activisionId: "Snaz#7777777" },
    ];
    const p = parsePanel(card("41", "15", "273"))!;
    expect(panelOwner(p, players)).toBe("a");
    expect(panelOwner({ ...p, idDigits: "1768400" }, players)).toBe("a"); // id misread, name still fits
    expect(panelOwner({ ...p, idDigits: null, name: "Nobody" }, players)).toBeNull();
  });
});

describe("table cells reassembled by position", () => {
  it("turns one-word-per-line OCR into rows and reads the hill time column", () => {
    const cell = (text: string, x: number, y: number) => w(text, x, y, x + 60, y + 30);
    const lines = linesFromWords([
      cell("3545", 600, 100),
      cell("Snaz", 100, 102),
      cell("525", 900, 98),
      cell("29", 1200, 101),
      cell("[5]Fiji", 100, 200),
      cell("2725", 600, 203),
      cell("515", 900, 199),
      cell("42", 1200, 202),
      cell("RANK", 20, 20),
      cell("PLAYER", 100, 22),
    ]);
    expect(lines).toEqual(["RANK PLAYER", "Snaz 3545 525 29", "[5]Fiji 2725 515 42"]);
    expect(parseRows(lines, HARDPOINT_TABLE_COLUMNS)).toEqual([
      { rawName: "Snaz", stats: { hillTimeSeconds: 29 } },
      { rawName: "[5]Fiji", stats: { hillTimeSeconds: 42 } },
    ]);
  });
});

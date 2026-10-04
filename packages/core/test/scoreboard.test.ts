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

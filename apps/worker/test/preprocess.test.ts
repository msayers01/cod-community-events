import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cutRegions } from "../src/preprocess.js";

const blank = (width: number, height: number) =>
  sharp({ create: { width, height, channels: 3, background: "#222" } })
    .png()
    .toBuffer();

describe("scoreboard region cutting", () => {
  it("cuts both tables and the stats card at two contrast levels, enlarged, at any resolution", async () => {
    for (const [w, h] of [
      [1206, 682],
      [1920, 1080],
    ] as const) {
      const regions = await cutRegions(await blank(w, h));
      expect(regions.map((r) => `${r.kind}:${r.group}`).sort()).toEqual([
        "panel:panel",
        "panel:panel",
        "table:left",
        "table:left",
        "table:right",
        "table:right",
      ]);
      for (const r of regions) {
        const meta = await sharp(r.image).metadata();
        expect(meta.width).toBeGreaterThanOrEqual(1400);
      }
    }
  });
  it("leaves tiny images to the whole-frame read", async () => {
    expect(await cutRegions(await blank(320, 180))).toEqual([]);
  });
});

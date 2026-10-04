import sharp from "sharp";
import type { ImageRegion, RegionCutter } from "@cod/core";

/**
 * Crops for the in-game scoreboard, as fractions of the frame so any resolution works:
 * the two team tables side by side, and the stats card underneath the left table.
 * Measured on a 16:9 Hardpoint scoreboard; other layouts fall through to the whole-frame read.
 */
const TABLES = {
  left: { x: 0.108, y: 0.27, w: 0.39, h: 0.245 },
  right: { x: 0.504, y: 0.27, w: 0.39, h: 0.245 },
};
const PANEL = { x: 0.11, y: 0.505, w: 0.73, h: 0.125 };

/** Light-on-dark game text becomes dark-on-light, enlarged, at a couple of contrast cut-offs. */
const THRESHOLDS = [110, 130];
const TARGET_WIDTH = 1400;

type Box = { x: number; y: number; w: number; h: number };

export const cutRegions: RegionCutter = async (image) => {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height || width < 600) return []; // too small to read reliably
  const crop = (b: Box) => ({
    left: Math.round(b.x * width),
    top: Math.round(b.y * height),
    width: Math.min(Math.round(b.w * width), width - Math.round(b.x * width)),
    height: Math.min(Math.round(b.h * height), height - Math.round(b.y * height)),
  });
  const variants = async (box: Box, thr: number) => {
    const c = crop(box);
    return sharp(image)
      .extract(c)
      .resize({ width: Math.max(TARGET_WIDTH, c.width * 3), kernel: "lanczos3" })
      .grayscale()
      .normalize()
      .negate()
      .threshold(255 - thr)
      .png()
      .toBuffer();
  };
  const out: ImageRegion[] = [];
  for (const thr of THRESHOLDS) {
    out.push({ kind: "table", group: "left", image: await variants(TABLES.left, thr) });
    out.push({ kind: "table", group: "right", image: await variants(TABLES.right, thr) });
    out.push({ kind: "panel", group: "panel", image: await variants(PANEL, thr) });
  }
  return out;
};

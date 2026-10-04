import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { createWorker, PSM, type Worker } from "tesseract.js";
import type { OcrEngine, OcrWord } from "@cod/core";

/**
 * Where English language data comes from. The `@tesseract.js-data/eng` package ships it, so the
 * worker needs no network (no CDN call on first use, which would also fail in a locked-down
 * container). TESSERACT_LANG_PATH overrides it; if the package is missing, Tesseract falls back
 * to its CDN.
 */
export function langPath(): string | undefined {
  if (process.env.TESSERACT_LANG_PATH) return process.env.TESSERACT_LANG_PATH;
  try {
    const pkg = createRequire(import.meta.url).resolve("@tesseract.js-data/eng/package.json");
    return path.join(path.dirname(pkg), "4.0.0_best_int");
  } catch {
    return undefined;
  }
}

/**
 * Tesseract (free, open source) running in-process, fully offline.
 * If accuracy proves insufficient, implement OcrEngine against Cloud Vision or Textract.
 */
export function createTesseractEngine(): OcrEngine & { close(): Promise<void> } {
  let worker: Promise<Worker> | null = null;
  const get = () =>
    (worker ??= createWorker("eng", 1, {
      ...(langPath() && { langPath: langPath() }),
      // Tesseract caches the decompressed data next to where it runs; keep that out of the app
      // directory, which may be read-only in a container.
      cachePath: process.env.TESSERACT_CACHE_PATH ?? tmpdir(),
    }));
  return {
    name: "tesseract",
    async recognize(image, opts) {
      const w = await get();
      // Keep the gaps between scoreboard columns so numbers stay separate tokens.
      await w.setParameters({
        preserve_interword_spaces: "1",
        tessedit_pageseg_mode: opts?.sparse ? PSM.SPARSE_TEXT : PSM.AUTO,
      });
      const { data } = await w.recognize(image, {}, { text: true, blocks: true });
      const words: OcrWord[] = (data.blocks ?? []).flatMap((b) =>
        b.paragraphs.flatMap((p) =>
          p.lines.flatMap((l) =>
            l.words.map((x) => ({
              text: x.text,
              x0: x.bbox.x0,
              y0: x.bbox.y0,
              x1: x.bbox.x1,
              y1: x.bbox.y1,
            })),
          ),
        ),
      );
      return { text: data.text, confidence: data.confidence, words };
    },
    async close() {
      if (worker) await (await worker).terminate();
      worker = null;
    },
  };
}

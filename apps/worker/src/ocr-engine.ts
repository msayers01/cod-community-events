import { createWorker, PSM, type Worker } from "tesseract.js";
import type { OcrEngine, OcrWord } from "@cod/core";

/**
 * Tesseract (free, open source) running in-process. Language data is fetched on first use;
 * set TESSERACT_LANG_PATH to a directory or URL holding eng.traineddata(.gz) to run offline.
 * If accuracy proves insufficient, implement OcrEngine against Cloud Vision or Textract.
 */
export function createTesseractEngine(): OcrEngine & { close(): Promise<void> } {
  let worker: Promise<Worker> | null = null;
  const get = () =>
    (worker ??= createWorker("eng", 1, {
      ...(process.env.TESSERACT_LANG_PATH && { langPath: process.env.TESSERACT_LANG_PATH }),
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

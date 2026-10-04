import { createWorker, type Worker } from "tesseract.js";
import type { OcrEngine } from "@cod/core";

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
    }).then(async (w) => {
      // Keep the gaps between scoreboard columns so numbers stay separate tokens.
      await w.setParameters({ preserve_interword_spaces: "1" });
      return w;
    }));
  return {
    name: "tesseract",
    async recognize(image) {
      const w = await get();
      const { data } = await w.recognize(image);
      return { text: data.text, confidence: data.confidence };
    },
    async close() {
      if (worker) await (await worker).terminate();
      worker = null;
    },
  };
}

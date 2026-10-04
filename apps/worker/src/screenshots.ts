import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import type { ScreenshotLoader } from "@cod/core";

const MAX_BYTES = 15 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Hosts we will fetch a pasted screenshot link from. The worker never requests arbitrary
 * URLs a user typed in (that would let anyone point it at internal services); anything
 * else is skipped and the submission just doesn't get an automatic reading.
 */
// Read lazily: the worker loads the root .env after its imports have been evaluated.
const allowedHosts = () =>
  new Set(
    (process.env.SCREENSHOT_URL_HOSTS ?? "i.imgur.com,cdn.discordapp.com,media.discordapp.net")
      .split(",")
      .map((h) => h.trim().toLowerCase())
      .filter(Boolean),
  );

export function isAllowedScreenshotUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      allowedHosts().has(u.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

const cfg = () => ({
  endpoint: process.env.R2_ENDPOINT ?? "",
  bucket: process.env.R2_BUCKET ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
});
const storageConfigured = () => Object.values(cfg()).every(Boolean);

let s3: S3Client | null = null;
const client = () =>
  (s3 ??= new S3Client({
    region: "auto",
    endpoint: cfg().endpoint,
    credentials: { accessKeyId: cfg().accessKeyId, secretAccessKey: cfg().secretAccessKey },
  }));

async function readCapped(stream: ReadableStream<Uint8Array> | null): Promise<Buffer | null> {
  if (!stream) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of stream) {
    size += chunk.byteLength;
    if (size > MAX_BYTES) throw new Error("Screenshot is too large to read");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export const loadScreenshot: ScreenshotLoader = async ({ screenshotKey, screenshotUrl }) => {
  if (screenshotKey) {
    if (!storageConfigured()) return null;
    const res = await client().send(
      new GetObjectCommand({ Bucket: cfg().bucket, Key: screenshotKey }),
    );
    const bytes = await res.Body?.transformToByteArray();
    if (!bytes) return null;
    if (bytes.byteLength > MAX_BYTES) throw new Error("Screenshot is too large to read");
    return Buffer.from(bytes);
  }
  if (screenshotUrl && isAllowedScreenshotUrl(screenshotUrl)) {
    const res = await fetch(screenshotUrl, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`Screenshot link returned ${res.status}`);
    if (!res.headers.get("content-type")?.startsWith("image/")) return null;
    return readCapped(res.body);
  }
  return null;
};

import { randomBytes } from "node:crypto";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Private object storage for evidence (Cloudflare R2, S3-compatible).
 * Files go browser -> storage via short-lived pre-signed PUT URLs and are read
 * back through short-lived GET URLs. Nothing is public.
 */
const cfg = {
  endpoint: process.env.R2_ENDPOINT ?? "",
  bucket: process.env.R2_BUCKET ?? "",
  accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
};

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "video/mp4"]);

export function uploadsEnabled(): boolean {
  return !!(cfg.endpoint && cfg.bucket && cfg.accessKeyId && cfg.secretAccessKey);
}

let client: S3Client | null = null;
function s3(): S3Client {
  if (!uploadsEnabled()) throw new Error("File storage is not configured");
  client ??= new S3Client({
    region: "auto",
    endpoint: cfg.endpoint,
    credentials: { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey },
  });
  return client;
}

export function newObjectKey(userId: string, contentType: string): string {
  const ext =
    { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "video/mp4": "mp4" }[
      contentType
    ] ?? "bin";
  const day = new Date().toISOString().slice(0, 10);
  return `evidence/${day}/${userId}/${randomBytes(12).toString("hex")}.${ext}`;
}

export async function presignUpload(
  key: string,
  contentType: string,
  size: number,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
    }),
    { expiresIn: 300 },
  );
}

export async function presignDownload(key: string): Promise<string> {
  return getSignedUrl(s3(), new GetObjectCommand({ Bucket: cfg.bucket, Key: key }), {
    expiresIn: 600,
  });
}

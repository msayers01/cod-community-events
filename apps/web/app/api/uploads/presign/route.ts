import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/session";
import {
  ALLOWED_TYPES,
  MAX_UPLOAD_BYTES,
  newObjectKey,
  presignUpload,
  uploadsEnabled,
} from "@/lib/storage";

const body = z.object({ contentType: z.string(), size: z.number().int().positive() });

export async function POST(req: Request) {
  if (!uploadsEnabled())
    return NextResponse.json({ error: "Uploads are not configured" }, { status: 503 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { contentType, size } = parsed.data;
  if (!ALLOWED_TYPES.has(contentType))
    return NextResponse.json({ error: "Only PNG, JPEG, WebP or MP4 files" }, { status: 400 });
  if (size > MAX_UPLOAD_BYTES)
    return NextResponse.json({ error: "File is too large (25 MB max)" }, { status: 400 });
  const key = newObjectKey(user.id, contentType);
  const url = await presignUpload(key, contentType, size);
  return NextResponse.json({ url, key });
}

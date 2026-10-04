import { NextResponse } from "next/server";
import { getAvatar } from "@/modules/identity/avatars";

/**
 * Public by design: a profile picture is shown on public pages. Served with a version
 * parameter (`?v=`) so browsers can cache it for a year and still see a new upload at once.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return new NextResponse(null, { status: 404 });
  const avatar = await getAvatar(id);
  if (!avatar) return new NextResponse(null, { status: 404 });

  const etag = `"${avatar.updatedAt.getTime()}"`;
  const versioned = new URL(req.url).searchParams.has("v");
  const headers = {
    "content-type": avatar.contentType,
    "x-content-type-options": "nosniff",
    etag,
    "cache-control": versioned ? "public, max-age=31536000, immutable" : "public, max-age=300",
  };
  if (req.headers.get("if-none-match") === etag)
    return new NextResponse(null, { status: 304, headers });
  return new NextResponse(new Uint8Array(avatar.data), { headers });
}

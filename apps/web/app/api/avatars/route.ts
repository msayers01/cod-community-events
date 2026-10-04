import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { DomainError } from "@/lib/errors";
import { MAX_AVATAR_BYTES, removeOwnAvatar, setAvatar } from "@/modules/identity/avatars";

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !origin || origin === new URL(req.url).origin;
}

function fail(e: unknown) {
  if (e instanceof DomainError)
    return NextResponse.json({ error: e.message }, { status: e.code === "FORBIDDEN" ? 403 : 400 });
  throw e;
}

/** Upload or replace your own picture (multipart form, field "file"). */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  // Reject oversized bodies before reading them.
  const length = Number(req.headers.get("content-length") ?? 0);
  if (length > MAX_AVATAR_BYTES + 64 * 1024)
    return NextResponse.json({ error: "That image is over 5 MB" }, { status: 413 });
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ error: "Choose an image first" }, { status: 400 });
    const res = await setAvatar(user.actor, Buffer.from(await file.arrayBuffer()));
    return NextResponse.json({ ok: true, v: res.avatarUpdatedAt.getTime() });
  } catch (e) {
    return fail(e);
  }
}

/** Remove your own picture. */
export async function DELETE(req: Request) {
  if (!sameOrigin(req)) return NextResponse.json({ error: "Bad origin" }, { status: 403 });
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  await removeOwnAvatar(user.actor);
  return NextResponse.json({ ok: true });
}

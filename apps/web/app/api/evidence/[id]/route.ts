import { NextResponse } from "next/server";
import { prisma } from "@cod/db";
import { isStaff } from "@cod/shared";
import { getCurrentUser } from "@/lib/session";
import { presignDownload, uploadsEnabled } from "@/lib/storage";

/** Evidence files are private: staff, the reporter and the accused may view. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const ev = await prisma.evidence.findUnique({
    where: { id: (await params).id },
    include: { report: { select: { reporterId: true, reportedUserId: true } } },
  });
  if (!ev) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const allowed =
    isStaff(user.actor) || ev.report.reporterId === user.id || ev.report.reportedUserId === user.id;
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (ev.url) return NextResponse.redirect(ev.url);
  if (!ev.storageKey || !uploadsEnabled())
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(await presignDownload(ev.storageKey));
}

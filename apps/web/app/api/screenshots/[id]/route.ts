import { NextResponse } from "next/server";
import { prisma } from "@cod/db";
import { presignDownload, uploadsEnabled } from "@/lib/storage";

/** Scoreboard screenshots are part of the public spin/result record, so anyone may view them. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sub = await prisma.resultSubmission.findUnique({
    where: { id: (await params).id },
    select: { screenshotUrl: true, screenshotKey: true },
  });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (sub.screenshotUrl) return NextResponse.redirect(sub.screenshotUrl);
  if (!sub.screenshotKey || !uploadsEnabled())
    return NextResponse.json({ error: "File unavailable" }, { status: 404 });
  return NextResponse.redirect(await presignDownload(sub.screenshotKey));
}

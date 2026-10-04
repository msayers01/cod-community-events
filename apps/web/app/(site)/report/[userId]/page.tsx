import { notFound, redirect } from "next/navigation";
import { prisma } from "@cod/db";
import { getCurrentUser } from "@/lib/session";
import { uploadsEnabled } from "@/lib/storage";
import { ReportForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ReportPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/sign-in");
  if (viewer.id === userId) redirect("/");
  const reported = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, displayName: true },
  });
  if (!reported) notFound();

  // Events the two of you shared, to attach context.
  const sharedEvents = await prisma.event.findMany({
    where: {
      OR: [
        { hosterId: userId, registrations: { some: { playerId: viewer.id } } },
        { hosterId: viewer.id, registrations: { some: { playerId: userId } } },
        {
          AND: [
            { registrations: { some: { playerId: userId } } },
            { registrations: { some: { playerId: viewer.id } } },
          ],
        },
      ],
    },
    select: { id: true, title: true, startsAt: true },
    orderBy: { startsAt: "desc" },
    take: 20,
  });

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Report {reported.displayName}</h1>
      <p className="mt-1 text-sm text-muted">
        Reports are reviewed by staff before anything happens. Evidence is required: screenshots,
        clips or VOD links with timestamps, or payment records. The reported user can respond before
        any action is taken. False or malicious reports carry a reputation penalty.
      </p>
      <ReportForm
        reportedUserId={reported.id}
        sharedEvents={sharedEvents.map((e) => ({ id: e.id, title: e.title }))}
        uploads={uploadsEnabled()}
      />
    </div>
  );
}

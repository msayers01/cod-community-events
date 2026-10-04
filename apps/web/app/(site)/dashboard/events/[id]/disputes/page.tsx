import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@cod/db";
import { canManageEvent } from "@cod/shared";
import { getCurrentUser } from "@/lib/session";
import { reviewQueue } from "@/modules/matches/service";
import { DisputeList } from "@/components/dispute-list";

export const dynamic = "force-dynamic";

export default async function EventDisputesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const event = await prisma.event.findUnique({
    where: { id },
    select: { id: true, title: true, slug: true, hosterId: true },
  });
  if (!event || !canManageEvent(user.actor, { hosterUserId: event.hosterId })) notFound();
  const queue = (await reviewQueue(user.actor)).filter((s) => s.match.round.event.id === id);
  return (
    <div className="mx-auto max-w-3xl">
      <p className="text-sm text-muted">
        <Link href={`/dashboard/events/${id}`} className="text-accent">
          {event.title}
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">Disputed results</h1>
      <p className="mt-1 text-sm text-muted">
        You watched these matches and have the VOD. Rule after the stream. Disputes involving you go
        to site staff.
      </p>
      <div className="mt-6">
        <DisputeList items={queue} viewerId={user.id} eventId={id} />
      </div>
    </div>
  );
}

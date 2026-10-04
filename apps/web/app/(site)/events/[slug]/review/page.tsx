import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@cod/db";
import { getCurrentUser } from "@/lib/session";
import { ReviewForm } from "./form";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const event = await prisma.event.findUnique({
    where: { slug },
    select: {
      id: true,
      title: true,
      status: true,
      hoster: { include: { user: { select: { displayName: true } } } },
      registrations: { where: { playerId: user.id }, select: { status: true } },
      reviews: { where: { reviewerId: user.id }, select: { id: true } },
    },
  });
  if (!event) notFound();
  const participated = event.registrations[0]?.status === "IN_POOL";
  const done = event.reviews.length > 0;
  return (
    <div className="mx-auto max-w-md">
      <p className="text-sm text-muted">
        <Link href={`/events/${slug}`} className="text-accent">
          {event.title}
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">Review {event.hoster.user.displayName}</h1>
      <p className="mt-1 text-sm text-muted">
        Only players who took part can review. Your review appears on the hoster&apos;s profile with
        your name.
      </p>
      {done ? (
        <p className="card mt-6 text-sm text-ok">You already reviewed this event. Thanks!</p>
      ) : !participated ? (
        <p className="card mt-6 text-sm text-muted">
          You did not take part in this event, so you cannot review it.
        </p>
      ) : !["COMPLETED", "ARCHIVED"].includes(event.status) ? (
        <p className="card mt-6 text-sm text-muted">Reviews open once the event is completed.</p>
      ) : (
        <ReviewForm eventId={event.id} eventSlug={slug} />
      )}
    </div>
  );
}

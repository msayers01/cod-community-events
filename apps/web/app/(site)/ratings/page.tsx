import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { pendingRatingsFor } from "@/modules/reputation/service";
import { RatingCard } from "./rating-card";

export const dynamic = "force-dynamic";

export default async function RatingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const pending = await pendingRatingsFor(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Rate your teammates</h1>
      <p className="mt-1 text-sm text-muted">
        Short, honest ratings from actual teammates. Aggregated over many matches, so one salty loss
        won&apos;t dent anyone.
      </p>
      <div className="mt-6 space-y-4">
        {pending.length === 0 && (
          <p className="card text-sm text-muted">Nobody left to rate. Play more switcheroos!</p>
        )}
        {pending.map((m) => (
          <div key={m.matchId} className="card text-sm">
            <p className="mb-2">
              <Link href={`/events/${m.event.slug}`} className="text-accent">
                {m.event.title}
              </Link>{" "}
              · round {m.round}
            </p>
            <div className="space-y-3">
              {m.teammates.map((t) => (
                <RatingCard key={t.id} matchId={m.matchId} teammate={t} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

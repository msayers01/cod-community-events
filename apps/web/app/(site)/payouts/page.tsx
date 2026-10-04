import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { pendingPayoutsFor } from "@/modules/reputation/service";
import { PayoutPrompt } from "./prompt";

export const dynamic = "force-dynamic";

export default async function PayoutsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const pending = await pendingPayoutsFor(user.id);
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Payout confirmations</h1>
      <p className="mt-1 text-sm text-muted">
        You won a place in these events. Confirming whether the hoster paid you builds their public
        track record. Saying “not paid” opens a report for staff to review.
      </p>
      <div className="mt-6 space-y-3">
        {pending.length === 0 && (
          <p className="card text-sm text-muted">Nothing to confirm right now.</p>
        )}
        {pending.map((p) => (
          <PayoutPrompt
            key={p.id}
            id={p.id}
            place={p.place}
            deadline={p.deadline}
            eventTitle={p.event.title}
            eventHref={`/events/${p.event.slug}`}
            hoster={p.event.hoster.user.displayName}
          />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">
        Back to{" "}
        <Link href="/" className="text-accent">
          events
        </Link>
      </p>
    </div>
  );
}

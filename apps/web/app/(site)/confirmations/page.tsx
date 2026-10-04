import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { pendingConfirmationsFor } from "@/modules/matches/service";
import { ConfirmCard } from "./confirm-card";

export const dynamic = "force-dynamic";

export default async function ConfirmationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const pending = await pendingConfirmationsFor(user.id);
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Confirm match results</h1>
      <p className="mt-1 text-sm text-muted">
        A teammate or opponent submitted these results with a scoreboard screenshot. Confirm if it
        matches what you saw, or dispute with a short reason. Nothing counts toward anyone&apos;s
        profile until it&apos;s verified.
      </p>
      <div className="mt-6 space-y-4">
        {pending.length === 0 && <p className="card text-sm text-muted">Nothing waiting on you.</p>}
        {pending.map((s) => (
          <ConfirmCard
            key={s.id}
            submission={{
              id: s.id,
              screenshotHref: s.screenshotUrl ?? `/api/screenshots/${s.id}`,
              scoreA: s.scoreA,
              scoreB: s.scoreB,
              submittedBy: s.submittedBy.displayName,
              deadline: s.verificationDeadline.toISOString(),
              eventTitle: s.match.round.event.title,
              eventSlug: s.match.round.event.slug,
              mode: s.match.round.event.mode,
              round: s.match.round.roundNumber,
              teamA: s.match.teamA.members.map((m) => m.user.displayName),
              teamB: s.match.teamB.members.map((m) => m.user.displayName),
              stats: s.stats.map((st) => ({
                name: st.player.displayName,
                kills: st.kills,
                deaths: st.deaths,
                plants: st.plants,
                defuses: st.defuses,
                hillTimeSeconds: st.hillTimeSeconds,
              })),
            }}
          />
        ))}
      </div>
      <p className="mt-6 text-xs text-muted">
        <Link href="/ratings" className="text-accent">
          Rate teammates
        </Link>{" "}
        from verified matches.
      </p>
    </div>
  );
}

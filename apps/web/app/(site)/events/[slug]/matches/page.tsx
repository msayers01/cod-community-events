import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@cod/db";
import { getCurrentUser } from "@/lib/session";
import { matchesForRound } from "@/modules/matches/service";
import { uploadsEnabled } from "@/lib/storage";
import { SubmitResultForm } from "./submit-form";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = {
  SCHEDULED: "Awaiting result",
  RESULT_PENDING: "Awaiting confirmations",
  VERIFIED: "Verified",
  DISPUTED: "Disputed",
  UNDER_REVIEW: "Under review",
  REJECTED: "Rejected, resubmit",
};

export default async function MatchesPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [event, user] = await Promise.all([
    prisma.event.findUnique({
      where: { slug },
      select: {
        id: true,
        title: true,
        mode: true,
        hosterId: true,
        rounds: {
          orderBy: { roundNumber: "asc" },
          select: { id: true, roundNumber: true, status: true },
        },
      },
    }),
    getCurrentUser(),
  ]);
  if (!event) notFound();
  const rounds = await Promise.all(
    event.rounds.map(async (r) => ({ ...r, matches: await matchesForRound(r.id) })),
  );
  const uploads = uploadsEnabled();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header>
        <p className="text-sm text-muted">
          <Link href={`/events/${slug}`} className="text-accent">
            {event.title}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Matches & results</h1>
        <p className="mt-1 text-sm text-muted">
          Results need a scoreboard screenshot and are verified by the players in the match. Stats
          only count once verified.
        </p>
      </header>
      {rounds.length === 0 && <p className="card text-sm text-muted">No rounds yet.</p>}
      {rounds.map((r) => (
        <section key={r.id} className="card">
          <h2 className="mb-3 font-semibold">Round {r.roundNumber}</h2>
          {r.matches.length === 0 && (
            <p className="text-sm text-muted">
              The hoster has not created matches for this round yet.
            </p>
          )}
          <div className="space-y-3">
            {r.matches.map((m) => {
              const a = m.teamA.members.map((x) => x.user);
              const b = m.teamB.members.map((x) => x.user);
              const canSubmit =
                !!user &&
                (user.id === event.hosterId || [...a, ...b].some((u) => u.id === user.id)) &&
                (m.status === "SCHEDULED" || m.status === "REJECTED");
              const latest = m.submissions[0];
              return (
                <div key={m.id} className="rounded border border-line p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p>
                      <span className={m.winningTeamId === m.teamAId ? "text-ok" : ""}>
                        {m.teamA.label}: {a.map((u) => u.displayName).join(", ")}
                      </span>
                      <span className="text-muted"> vs </span>
                      <span className={m.winningTeamId === m.teamBId ? "text-ok" : ""}>
                        {m.teamB.label}: {b.map((u) => u.displayName).join(", ")}
                      </span>
                    </p>
                    <span
                      className={`tag ${m.status === "VERIFIED" ? "border-ok text-ok" : m.status === "DISPUTED" ? "border-warn text-warn" : ""}`}
                    >
                      {STATUS[m.status]}
                    </span>
                  </div>
                  {latest && (
                    <p className="mt-1 text-xs text-muted">
                      Latest submission: {latest.scoreA}–{latest.scoreB} ·{" "}
                      {latest.confirmations.filter((c) => c.response === "CONFIRM").length}{" "}
                      confirmed ·{" "}
                      {latest.confirmations.filter((c) => c.response === "DISPUTE").length} disputed
                      ·{" "}
                      <a
                        className="text-accent"
                        href={latest.screenshotUrl ?? `/api/screenshots/${latest.id}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        screenshot
                      </a>
                    </p>
                  )}
                  {canSubmit && (
                    <SubmitResultForm
                      matchId={m.id}
                      eventSlug={slug}
                      mode={event.mode}
                      teamA={a}
                      teamB={b}
                      uploads={uploads}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

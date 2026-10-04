import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@cod/shared";
import { requireStaff } from "@/lib/session";
import { getFlag } from "@/modules/throwflags/service";
import { LocalTime } from "@/components/local-time";
import { FlagActions } from "./flag-actions";
import { SIGNAL_LABEL } from "../labels";

export const dynamic = "force-dynamic";

const DETAIL_LABEL: Record<string, string> = {
  observedKillShare: "Kill share this match",
  baselineKillShare: "Their usual kill share",
  deviations: "Standard deviations from usual",
  baselineMatches: "Matches in their baseline",
  matches: "Verified matches",
  losses: "Losses",
  usualLossRate: "Their usual loss rate",
  chanceByLuck: "Chance of this by luck alone",
};

export default async function FlagPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireStaff();
  if (!hasPermission(actor, "throwflag.review")) redirect("/staff");
  const { id } = await params;
  const { flag, event, match, otherFlags, reports, log, recusal } = await getFlag(actor, id);
  const details = flag.details as Record<string, number>;
  const proof = match?.submissions[0];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-lg font-semibold">
            {flag.user.displayName}
            {flag.relatedUser && (
              <span className="text-muted"> with {flag.relatedUser.displayName}</span>
            )}
          </h1>
          <span className="tag">{flag.status.toLowerCase().replace("_", " ")}</span>
        </div>
        <p className="mt-1 text-muted">{SIGNAL_LABEL[flag.signal]}</p>
        <dl className="mt-3 grid gap-1 sm:grid-cols-[240px_1fr]">
          {Object.entries(details).map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{DETAIL_LABEL[k] ?? k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-xs text-muted">
          Raised <LocalTime date={flag.createdAt} />
          {event && (
            <>
              {" "}
              ·{" "}
              <Link href={`/events/${event.slug}`} className="text-accent">
                {event.title}
              </Link>
              {match && ` · round ${match.round.roundNumber}`}
            </>
          )}
          {proof?.screenshotUrl && (
            <>
              {" "}
              ·{" "}
              <a
                href={proof.screenshotUrl}
                target="_blank"
                rel="noreferrer"
                className="text-accent"
              >
                scoreboard
              </a>
            </>
          )}
        </p>
        <p className="mt-3 text-xs text-muted">
          Check the VOD and the player&apos;s teammates before deciding. A statistical oddity is not
          proof of anything.
        </p>
      </div>

      {(otherFlags.length > 0 || reports.length > 0) && (
        <div className="card text-sm">
          <h2 className="font-medium">Other signals for this player</h2>
          <ul className="mt-2 space-y-1 text-xs">
            {otherFlags.map((f) => (
              <li key={f.id}>
                <Link href={`/staff/flags/${f.id}`} className="text-accent">
                  {SIGNAL_LABEL[f.signal]}
                </Link>{" "}
                <span className="text-muted">
                  · {f.status.toLowerCase().replace("_", " ")} ·{" "}
                  <LocalTime date={f.createdAt} withZone={false} />
                </span>
              </li>
            ))}
            {reports.map((r) => (
              <li key={r.id}>
                <Link href={`/staff/reports/${r.id}`} className="text-accent">
                  Throwing report
                </Link>{" "}
                <span className="text-muted">
                  · {r.status.toLowerCase().replace("_", " ")} ·{" "}
                  <LocalTime date={r.createdAt} withZone={false} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {recusal ? (
        <p className="card text-sm text-warn">
          You must recuse from this case ({recusal.replace("_", " ")}). Another moderator will pick
          it up.
        </p>
      ) : (
        <FlagActions flagId={flag.id} status={flag.status} />
      )}

      {flag.reviewNote && (
        <p className="text-xs text-muted">
          Last note{flag.reviewedBy && ` from ${flag.reviewedBy.displayName}`}: {flag.reviewNote}
          {flag.reportId && (
            <>
              {" "}
              ·{" "}
              <Link href={`/staff/reports/${flag.reportId}`} className="text-accent">
                report
              </Link>
            </>
          )}
        </p>
      )}
      {log.length > 0 && (
        <ul className="text-xs text-muted">
          {log.map((l) => (
            <li key={l.id}>
              <LocalTime date={l.createdAt} withZone={false} /> · {l.action} · {l.reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

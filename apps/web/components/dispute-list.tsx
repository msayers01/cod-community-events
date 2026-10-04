import { DisputeActions } from "./dispute-actions";

type Item = Awaited<ReturnType<typeof import("@/modules/matches/service").reviewQueue>>[number];

export function DisputeList({
  items,
  viewerId,
  eventId,
}: {
  items: Item[];
  viewerId: string;
  eventId?: string;
}) {
  if (items.length === 0) return <p className="card text-sm text-muted">Nothing to review.</p>;
  return (
    <div className="space-y-4">
      {items.map((s) => {
        const canRule =
          s.submittedById !== viewerId &&
          ![...s.match.teamA.members, ...s.match.teamB.members].some((m) => m.userId === viewerId);
        return (
          <div key={s.id} className="card text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <span className="font-medium">{s.match.round.event.title}</span> · round{" "}
                {s.match.round.roundNumber}
              </p>
              <span className="tag border-warn text-warn">
                {s.status.toLowerCase().replace("_", " ")}
              </span>
            </div>
            <p className="mt-2">
              {s.match.teamA.members.map((m) => m.user.displayName).join(", ")}{" "}
              <span className="font-bold">{s.scoreA}</span> :{" "}
              <span className="font-bold">{s.scoreB}</span>{" "}
              {s.match.teamB.members.map((m) => m.user.displayName).join(", ")}
            </p>
            <p className="text-xs text-muted">
              Submitted by {s.submittedBy.displayName} ·{" "}
              <a
                className="text-accent"
                href={s.screenshotUrl ?? `/api/screenshots/${s.id}`}
                target="_blank"
                rel="noreferrer"
              >
                screenshot
              </a>
            </p>
            <ul className="mt-2 space-y-1 text-xs">
              {s.confirmations.map((c) => (
                <li key={c.id}>
                  <span className={c.response === "DISPUTE" ? "text-warn" : "text-ok"}>
                    {c.response.toLowerCase()}
                  </span>{" "}
                  · {c.player.displayName}
                  {c.disputeReason && <span className="text-muted"> · “{c.disputeReason}”</span>}
                </li>
              ))}
              {s.confirmations.length === 0 && (
                <li className="text-muted">No confirmations before the window closed.</li>
              )}
            </ul>
            {canRule ? (
              <DisputeActions submissionId={s.id} eventId={eventId} />
            ) : (
              <p className="mt-2 text-xs text-muted">
                You are involved in this match; staff will rule on it.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import {
  commitSpinAction,
  completeRoundAction,
  eventTransitionAction,
  executeSpinAction,
  markPaidAction,
  quickAddAction,
  recordWinnersAction,
  regenerateOverlayKeyAction,
  removePlayerAction,
  saveTemplateAction,
  inviteAction,
} from "@/app/(site)/dashboard/actions";
import { createMatchesAction } from "@/app/(site)/confirmations/actions";
import Link from "next/link";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";
import { label } from "@/lib/format";

interface Row {
  id: string;
  status: string;
  waitlistPosition: number | null;
  source: string;
  flagged: boolean;
  checkedIn: boolean;
  displayName: string;
  activisionId: string | null;
  streamUrl: string | null;
  noShows: number;
  openReports: number;
}
interface Round {
  id: string;
  roundNumber: number;
  status: string;
  spin: { id: string; status: string; commitment: string; spunAt: Date | null } | null;
  teams: { label: string; members: string[] }[];
  matchCount: number;
}
interface Props {
  event: {
    id: string;
    status: string;
    joinCode: string;
    overlayKey: string;
    appUrl: string;
    roundCount: number | null;
    teamSize: number;
    poolSize: number;
    payoutPlaces: number[];
    poolPlayers: { id: string; displayName: string }[];
    winners: { place: number; displayName: string; response: string }[];
    winnersRecorded: boolean;
    slug: string;
    entryType: string;
    invites: { displayName: string; status: string }[];
    openDisputes: number;
  };
  rounds: Round[];
  waitlist: Row[];
  paid: Row[];
  removed: Row[];
}

export function ManagePanel({ event, rounds, waitlist, paid, removed }: Props) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  const [identifier, setIdentifier] = useState("");
  const [showRemoved, setShowRemoved] = useState(false);
  const [winnerPicks, setWinnerPicks] = useState<Record<number, string>>({});
  const [inviteName, setInviteName] = useState("");

  const joinUrl = `${event.appUrl}/join/${event.joinCode}`;
  const overlayUrl = `${event.appUrl}/overlay/${event.overlayKey}`;
  const lastRound = rounds[rounds.length - 1];
  const canCommit =
    event.status === "LIVE" &&
    (!lastRound || lastRound.status === "COMPLETE") &&
    (!event.roundCount || rounds.length < event.roundCount);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {/* Lifecycle */}
        <section className="card">
          <h2 className="mb-3 font-semibold">Event controls</h2>
          <div className="flex flex-wrap gap-2">
            {event.status === "DRAFT" && (
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() => run(() => eventTransitionAction(event.id, "publish"))}
              >
                Publish
              </button>
            )}
            {event.status === "OPEN" && (
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() => run(() => eventTransitionAction(event.id, "openCheckIn"))}
              >
                Open check-in
              </button>
            )}
            {event.status === "CHECK_IN" && (
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() =>
                  confirm("Close check-in and mark anyone not checked in as a no-show?") &&
                  run(() => eventTransitionAction(event.id, "start"))
                }
              >
                Start event (closes check-in)
              </button>
            )}
            {event.status === "LIVE" && (
              <button
                className="btn btn-primary"
                disabled={pending}
                onClick={() =>
                  confirm("Mark the event as completed?") &&
                  run(() => eventTransitionAction(event.id, "complete"))
                }
              >
                Complete event
              </button>
            )}
            {["DRAFT", "OPEN", "CHECK_IN"].includes(event.status) && (
              <button
                className="btn btn-danger"
                disabled={pending}
                onClick={() => {
                  const r = prompt("Reason for cancelling?");
                  if (r !== null) run(() => eventTransitionAction(event.id, "cancel", r));
                }}
              >
                Cancel event
              </button>
            )}
            {["COMPLETED", "ARCHIVED", "CANCELLED"].includes(event.status) && (
              <p className="text-sm text-muted">
                This event is {label(event.status).toLowerCase()}.
              </p>
            )}
            <button
              className="btn"
              disabled={pending}
              onClick={() => {
                const name = prompt("Template name?");
                if (name) run(() => saveTemplateAction(event.id, name));
              }}
            >
              Save as template
            </button>
          </div>
          <FormMessage
            error={result && !result.ok ? result.error : null}
            ok={result?.ok ? result.message : null}
          />
        </section>

        {/* Wheel */}
        {["LIVE", "COMPLETED", "ARCHIVED"].includes(event.status) && (
          <section className="card">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">
                Wheel{" "}
                <Link
                  href={`/events/${event.slug}/matches`}
                  className="ml-2 text-xs font-normal text-accent"
                >
                  matches & results
                </Link>
                <Link
                  href={`/dashboard/events/${event.id}/disputes`}
                  className={`ml-2 text-xs font-normal ${event.openDisputes ? "text-warn" : "text-muted"}`}
                >
                  {event.openDisputes ? `${event.openDisputes} to review` : "disputes"}
                </Link>
              </h2>
              <span className="text-sm text-muted">
                {event.poolSize} in pool · {Math.floor(event.poolSize / event.teamSize)} teams
                {event.roundCount ? ` · ${rounds.length}/${event.roundCount} rounds` : ""}
              </span>
            </div>
            <ol className="space-y-2 text-sm">
              {rounds.map((r) => (
                <li key={r.id} className="rounded border border-line p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      Round {r.roundNumber}{" "}
                      <span className="tag ml-2">{r.status.replace("_", " ")}</span>
                    </span>
                    <div className="flex gap-2">
                      {r.spin?.status === "COMMITTED" && (
                        <button
                          className="btn btn-primary"
                          disabled={pending}
                          onClick={() => run(() => executeSpinAction(r.spin!.id, event.id))}
                        >
                          Spin!
                        </button>
                      )}
                      {(r.status === "SPUN" || r.status === "IN_PROGRESS") &&
                        r.matchCount === 0 && (
                          <button
                            className="btn"
                            disabled={pending}
                            onClick={() => run(() => createMatchesAction(r.id, event.id))}
                          >
                            Create matches
                          </button>
                        )}
                      {(r.status === "SPUN" || r.status === "IN_PROGRESS") && (
                        <button
                          className="btn"
                          disabled={pending}
                          onClick={() => run(() => completeRoundAction(r.id, event.id))}
                        >
                          Round finished
                        </button>
                      )}
                    </div>
                  </div>
                  {r.spin?.status === "COMMITTED" && (
                    <p className="mt-1 break-all font-mono text-[11px] text-muted">
                      commitment {r.spin.commitment}
                    </p>
                  )}
                  {r.teams.length > 0 && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {r.teams.map((t) => (
                        <div key={t.label} className="rounded bg-bg p-2">
                          <span className="text-xs text-accent">{t.label}</span>
                          <p>{t.members.join(", ")}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
            {canCommit && (
              <button
                className="btn btn-primary mt-3"
                disabled={pending || event.poolSize < event.teamSize * 2}
                onClick={() => run(() => commitSpinAction(event.id))}
              >
                Prepare round {rounds.length + 1} (publish commitment)
              </button>
            )}
          </section>
        )}

        {/* Winners & payouts */}
        {["COMPLETED", "ARCHIVED"].includes(event.status) && (
          <section className="card">
            <h2 className="mb-1 font-semibold">Winners & payout confirmation</h2>
            {event.winnersRecorded ? (
              <ul className="space-y-1 text-sm">
                {event.winners.map((w) => (
                  <li key={w.place} className="flex items-center justify-between">
                    <span>
                      #{w.place} {w.displayName}
                    </span>
                    <span
                      className={`tag ${w.response === "PAID" ? "border-ok text-ok" : w.response === "NOT_PAID" ? "border-warn text-warn" : ""}`}
                    >
                      {w.response === "PAID"
                        ? "Payout confirmed"
                        : w.response === "NOT_PAID"
                          ? "Reported unpaid"
                          : "Awaiting confirmation"}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <p className="mb-3 text-xs text-muted">
                  Record who won each paid place. Winners get a prompt to confirm you paid them;
                  confirmed payouts build your public record.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {event.payoutPlaces.map((place) => (
                    <label key={place} className="text-sm">
                      <span className="label">Place {place}</span>
                      <select
                        className="input"
                        value={winnerPicks[place] ?? ""}
                        onChange={(e) =>
                          setWinnerPicks({ ...winnerPicks, [place]: e.target.value })
                        }
                      >
                        <option value="">Select player</option>
                        {event.poolPlayers.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.displayName}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
                <button
                  className="btn btn-primary mt-3"
                  disabled={pending || event.payoutPlaces.some((p) => !winnerPicks[p])}
                  onClick={() =>
                    confirm("Record these winners? This cannot be changed.") &&
                    run(() =>
                      recordWinnersAction(
                        event.id,
                        event.payoutPlaces.map((place) => ({ place, userId: winnerPicks[place]! })),
                      ),
                    )
                  }
                >
                  Record winners
                </button>
              </>
            )}
          </section>
        )}

        {/* Players */}
        <section className="card">
          <h2 className="mb-3 font-semibold">
            Paid players ({paid.filter((r) => r.status !== "NO_SHOW").length})
          </h2>
          <PlayerTable
            rows={paid}
            eventId={event.id}
            eventStatus={event.status}
            pending={pending}
            run={run}
          />
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Waitlist ({waitlist.length})</h2>
          <p className="mb-3 text-xs text-muted">
            Mark a player as paid once you have received their entry. Unpaid players stay here until
            the spins start.
          </p>
          <PlayerTable
            rows={waitlist}
            eventId={event.id}
            eventStatus={event.status}
            pending={pending}
            run={run}
          />
        </section>
        {removed.length > 0 && (
          <section className="card">
            <button
              className="text-sm text-muted hover:text-ink"
              onClick={() => setShowRemoved(!showRemoved)}
            >
              {showRemoved ? "Hide" : "Show"} removed ({removed.length})
            </button>
            {showRemoved && (
              <div className="mt-3">
                <PlayerTable
                  rows={removed}
                  eventId={event.id}
                  eventStatus={event.status}
                  pending={pending}
                  run={run}
                />
              </div>
            )}
          </section>
        )}
      </div>

      <aside className="space-y-6">
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Twitch chat join link</h2>
          <code className="block break-all rounded bg-bg p-2 text-xs">{joinUrl}</code>
          <p className="mt-2 text-xs text-muted">
            Drop this in chat. Viewers sign in and land on the waitlist.
          </p>
        </section>

        {["OPEN", "CHECK_IN", "LIVE"].includes(event.status) && (
          <section className="card text-sm">
            <h2 className="mb-2 font-semibold">Quick-add a player</h2>
            <input
              className="input"
              placeholder="Display name or Activision ID"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
            <div className="mt-2 flex gap-2">
              <button
                className="btn"
                disabled={pending || !identifier}
                onClick={() => run(() => quickAddAction(event.id, identifier, false))}
              >
                Add to waitlist
              </button>
              <button
                className="btn btn-primary"
                disabled={pending || !identifier}
                onClick={() => run(() => quickAddAction(event.id, identifier, true))}
              >
                Add as paid
              </button>
            </div>
          </section>
        )}

        {event.entryType === "INVITE_ONLY" && (
          <section className="card text-sm">
            <h2 className="mb-2 font-semibold">Invites</h2>
            <ul className="mb-2 space-y-1 text-xs">
              {event.invites.length === 0 && <li className="text-muted">Nobody invited yet.</li>}
              {event.invites.map((i) => (
                <li key={i.displayName}>
                  {i.displayName} <span className="text-muted">· {i.status.toLowerCase()}</span>
                </li>
              ))}
            </ul>
            <input
              className="input"
              placeholder="Display name or Activision ID"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
            />
            <button
              className="btn mt-2"
              disabled={pending || !inviteName}
              onClick={() =>
                run(async () => {
                  const r = await inviteAction(event.id, inviteName);
                  if (r.ok) setInviteName("");
                  return r;
                })
              }
            >
              Invite
            </button>
          </section>
        )}

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">OBS wheel overlay</h2>
          <code className="block break-all rounded bg-bg p-2 text-xs">{overlayUrl}</code>
          <p className="mt-2 text-xs text-muted">
            Add as a Browser Source (1920×1080, transparent). Keep this URL private; regenerate it
            if it leaks.
          </p>
          <button
            className="btn mt-2"
            disabled={pending}
            onClick={() =>
              confirm("Regenerate the overlay URL? Your current OBS source will stop working.") &&
              run(() => regenerateOverlayKeyAction(event.id))
            }
          >
            Regenerate URL
          </button>
        </section>
      </aside>
    </div>
  );
}

function PlayerTable({
  rows,
  eventId,
  eventStatus,
  pending,
  run,
}: {
  rows: Row[];
  eventId: string;
  eventStatus: string;
  pending: boolean;
  run: (fn: () => Promise<ActionResult>) => void;
}) {
  if (rows.length === 0) return <p className="text-sm text-muted">Nobody here yet.</p>;
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase tracking-wide text-muted">
        <tr>
          <th className="py-1">#</th>
          <th>Player</th>
          <th>Activision ID</th>
          <th>History</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-line">
            <td className="py-2 text-muted">{r.waitlistPosition ?? ""}</td>
            <td>
              {r.displayName}
              {r.flagged && <span className="tag ml-2 border-warn text-warn">flag</span>}
              {r.source !== "WEBSITE" && (
                <span className="tag ml-2">{r.source === "JOIN_LINK" ? "chat" : "quick-add"}</span>
              )}
              {r.streamUrl && (
                <a
                  className="ml-2 text-xs text-muted hover:text-accent"
                  href={r.streamUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  stream
                </a>
              )}
            </td>
            <td className="font-mono text-xs text-muted">{r.activisionId ?? "—"}</td>
            <td className="text-xs text-muted">
              {r.noShows} no-shows
              {r.openReports > 0 && <span className="text-warn"> · {r.openReports} reports</span>}
            </td>
            <td>
              <span className="tag">{label(r.status)}</span>
            </td>
            <td className="text-right">
              <div className="flex justify-end gap-1">
                {r.status === "WAITLISTED" && (
                  <button
                    className="btn btn-primary"
                    disabled={pending}
                    onClick={() => run(() => markPaidAction(r.id, eventId))}
                  >
                    Mark paid
                  </button>
                )}
                {["WAITLISTED", "CONFIRMED", "CHECKED_IN"].includes(r.status) &&
                  eventStatus !== "LIVE" && (
                    <button
                      className="btn btn-danger"
                      disabled={pending}
                      onClick={() => {
                        const reason = prompt(`Remove ${r.displayName}? Reason:`);
                        if (reason !== null) run(() => removePlayerAction(r.id, eventId, reason));
                      }}
                    >
                      Remove
                    </button>
                  )}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

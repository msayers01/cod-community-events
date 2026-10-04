import { LocalTime } from "./local-time";

/** A prominent notice on an event page when it has started, paused, finished or been cancelled. */
export function StatusBanner({
  status,
  cancelReason,
  cancelledAt,
}: {
  status: string;
  cancelReason?: string | null;
  cancelledAt?: Date | null;
}) {
  if (status === "CANCELLED")
    return (
      <div role="status" className="rounded border border-warn bg-warn/10 p-3 text-sm">
        <p className="font-semibold text-warn">This event was cancelled</p>
        {cancelReason && <p className="mt-1">Reason: {cancelReason}</p>}
        {cancelledAt && (
          <p className="mt-1 text-xs text-muted">
            Cancelled <LocalTime date={cancelledAt} />. Nothing is owed to the site; contact the
            hoster about any entry fee you paid them.
          </p>
        )}
      </div>
    );
  if (status === "LIVE")
    return (
      <div role="status" className="rounded border border-ok bg-ok/10 p-3 text-sm">
        <p className="font-semibold text-ok">This event has started</p>
        <p className="mt-1 text-xs text-muted">It is live now. Rounds and teams appear below.</p>
      </div>
    );
  if (status === "PAUSED")
    return (
      <div role="status" className="rounded border border-accent bg-accent/10 p-3 text-sm">
        <p className="font-semibold text-accent">This event is paused</p>
        <p className="mt-1 text-xs text-muted">It has started and will resume shortly.</p>
      </div>
    );
  if (status === "COMPLETED" || status === "ARCHIVED")
    return (
      <div role="status" className="rounded border border-line p-3 text-sm text-muted">
        This event has finished.
      </div>
    );
  return null;
}

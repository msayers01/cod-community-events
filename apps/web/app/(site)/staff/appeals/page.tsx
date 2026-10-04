import { requireStaff } from "@/lib/session";
import { appealQueue } from "@/modules/moderation/blacklist";
import { LocalTime } from "@/components/local-time";
import { AppealActions } from "./appeal-actions";

export const dynamic = "force-dynamic";

export default async function StaffAppealsPage() {
  const user = await requireStaff();
  const appeals = await appealQueue(user.actor).catch(() => []);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Appeals must be handled by a moderator who was not involved in the original decision.
        Overturning lifts the decision immediately.
      </p>
      <div className="space-y-3">
        {appeals.length === 0 && <p className="card text-sm text-muted">No open appeals.</p>}
        {appeals.map((a) => (
          <div key={a.id} className="card text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <span className="font-medium">{a.appellant.displayName}</span> appeals a{" "}
                {a.target.toLowerCase().replace(/_/g, " ")}
              </p>
              <span className="tag">
                {a.status.toLowerCase().replace("_", " ")}
                {a.handledBy && ` · ${a.handledBy.displayName}`}
              </span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{a.statement}</p>
            {Array.isArray(a.evidence) && a.evidence.length > 0 && (
              <ul className="mt-2 text-xs">
                {(a.evidence as { type: string; url?: string; note?: string }[]).map((e, i) => (
                  <li key={i}>
                    <span className="text-accent">{e.type.toLowerCase()}</span>{" "}
                    {e.url && (
                      <a href={e.url} target="_blank" rel="noreferrer" className="underline">
                        {e.url}
                      </a>
                    )}{" "}
                    {e.note}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-1 text-xs text-muted">
              Filed <LocalTime date={a.createdAt} withZone={false} />
            </p>
            <AppealActions appealId={a.id} status={a.status} mine={a.handledById === user.id} />
          </div>
        ))}
      </div>
    </div>
  );
}

import { requireStaff } from "@/lib/session";
import { pendingEntries } from "@/modules/moderation/blacklist";
import { LocalTime } from "@/components/local-time";
import { EntryActions } from "./entry-actions";

export const dynamic = "force-dynamic";

export default async function StaffBlacklistPage() {
  const user = await requireStaff();
  const entries = await pendingEntries(user.actor);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Proposed entries need two different, non-recused moderators. Propose entries from a
        report&apos;s page. Public wording must describe a verified report, never a label.
      </p>
      <div className="space-y-3">
        {entries.length === 0 && (
          <p className="card text-sm text-muted">Nothing awaiting approval.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="card text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p>
                <span className="font-medium">{e.user.displayName}</span> ·{" "}
                {e.category.toLowerCase().replace(/_/g, " ")}
              </p>
              <span className="tag">{e.status.toLowerCase().replace(/_/g, " ")}</span>
            </div>
            <p className="mt-1 italic text-muted">“{e.publicWording}”</p>
            <p className="mt-1 text-xs text-muted">
              Proposed by {e.proposedBy.displayName}{" "}
              <LocalTime date={e.createdAt} withZone={false} /> · approvals:{" "}
              {e.approvals.map((a) => a.staffUser.displayName).join(", ") || "none"} · expires{" "}
              {e.expiresAt ? <LocalTime date={e.expiresAt} withZone={false} /> : "never"}
              {e.report && (
                <>
                  {" "}
                  ·{" "}
                  <a className="text-accent" href={`/staff/reports/${e.report.id}`}>
                    report
                  </a>
                </>
              )}
            </p>
            <EntryActions
              entryId={e.id}
              alreadyApproved={e.approvals.some((a) => a.staffUserId === user.id)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

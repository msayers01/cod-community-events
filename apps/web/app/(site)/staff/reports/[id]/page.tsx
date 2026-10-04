import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { getReportForStaff } from "@/modules/moderation/service";
import { NotFoundError } from "@/lib/errors";
import { LocalTime } from "@/components/local-time";
import { ReportActions } from "./report-actions";
import { uploadsEnabled } from "@/lib/storage";

export const dynamic = "force-dynamic";

export default async function StaffReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireStaff();
  let data;
  try {
    data = await getReportForStaff(user.actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const { report, recusal, log } = data;
  const accused = report.reportedUser;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <header className="card">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold">
              {report.category.replace(/_/g, " ")} · {accused.displayName}
            </h1>
            <span className="tag">{report.status.replace(/_/g, " ").toLowerCase()}</span>
            {recusal && (
              <span className="tag border-warn text-warn">
                You are recused: {recusal.replace("_", " ")}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm text-muted">
            Filed <LocalTime date={report.createdAt} /> by{" "}
            <Link className="text-ink" href={`/staff/users/${report.reporter.id}`}>
              {report.reporter.displayName}
            </Link>
            {report.event && (
              <>
                {" "}
                · event{" "}
                <Link className="text-ink" href={`/events/${report.event.slug}`}>
                  {report.event.title}
                </Link>
              </>
            )}
            {report.assignedStaff && <> · assigned to {report.assignedStaff.displayName}</>}
          </p>
          <p className="mt-3 whitespace-pre-wrap text-sm">{report.description}</p>
        </header>

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Evidence ({report.evidence.length})</h2>
          <ul className="space-y-1">
            {report.evidence.map((e) => (
              <li key={e.id} className="flex items-center justify-between rounded bg-bg px-2 py-1">
                <span>
                  <span className="text-accent">{e.type.replace("_", " ").toLowerCase()}</span> ·
                  from {e.submittedBy.displayName}
                  {e.note && <span className="text-muted"> · {e.note}</span>}
                </span>
                <a
                  href={`/api/evidence/${e.id}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted hover:text-accent"
                >
                  open
                </a>
              </li>
            ))}
          </ul>
        </section>

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Response from {accused.displayName}</h2>
          {report.accusedResponse ? (
            <p className="whitespace-pre-wrap">{report.accusedResponse}</p>
          ) : report.status === "AWAITING_RESPONSE" ? (
            <p className="text-muted">
              Waiting. Deadline{" "}
              {report.responseDeadline ? <LocalTime date={report.responseDeadline} /> : "—"}.
            </p>
          ) : (
            <p className="text-muted">
              Not yet requested. Move the report to “Awaiting response” to notify them.
            </p>
          )}
        </section>

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Case log</h2>
          <ul className="space-y-1 text-xs">
            {log.length === 0 && <li className="text-muted">No staff actions yet.</li>}
            {log.map((l) => (
              <li key={l.id} className="flex gap-3">
                <span className="shrink-0 text-muted">
                  <LocalTime date={l.createdAt} withZone={false} />
                </span>
                <span>
                  <span className="text-accent">{l.action}</span> · {l.reason}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">
            Publicly, every action is attributed to “staff”. Individual names are visible only here.
          </p>
        </section>
      </div>

      <aside className="space-y-6">
        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">About {accused.displayName}</h2>
          <dl className="grid grid-cols-2 gap-1 text-xs">
            <dt className="text-muted">Account</dt>
            <dd>{accused.status.toLowerCase()}</dd>
            <dt className="text-muted">Activision ID</dt>
            <dd className="font-mono">{accused.activisionId ?? "—"}</dd>
            <dt className="text-muted">Reports received</dt>
            <dd>{accused._count.reportsReceived}</dd>
            <dt className="text-muted">No-shows</dt>
            <dd>{accused._count.registrations}</dd>
            <dt className="text-muted">Sanctions</dt>
            <dd>{accused.sanctions.length}</dd>
          </dl>
          <Link href={`/staff/users/${accused.id}`} className="btn mt-3 w-full justify-center">
            Full staff view
          </Link>
        </section>

        <ReportActions
          reportId={report.id}
          status={report.status}
          accusedId={accused.id}
          recused={!!recusal}
          assignedToMe={report.assignedStaff?.id === user.id}
          staffRole={user.actor.staffRole!}
          uploads={uploadsEnabled()}
          notes={accused.staffNotes.map((n) => ({
            id: n.id,
            body: n.body,
            author: n.author.displayName,
            at: n.createdAt.toISOString(),
          }))}
        />
      </aside>
    </div>
  );
}

import Link from "next/link";
import { ReportStatus } from "@cod/shared";
import { requireStaff } from "@/lib/session";
import { listReportQueue } from "@/modules/moderation/service";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  SUBMITTED: "New",
  GATHERING_EVIDENCE: "Gathering evidence",
  AWAITING_RESPONSE: "Awaiting response",
  UNDER_REVIEW: "Under review",
  ACTIONED: "Actioned",
  DISMISSED: "Dismissed",
};

export default async function StaffQueuePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { actor } = await requireStaff();
  const { status } = await searchParams;
  const valid = Object.values(ReportStatus).includes(status as ReportStatus)
    ? (status as ReportStatus)
    : undefined;
  const reports = await listReportQueue(actor, valid);
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/staff" className={`tag ${!valid ? "border-accent text-accent" : ""}`}>
          Open
        </Link>
        {Object.values(ReportStatus).map((s) => (
          <Link
            key={s}
            href={`/staff?status=${s}`}
            className={`tag ${valid === s ? "border-accent text-accent" : ""}`}
          >
            {STATUS_LABEL[s]}
          </Link>
        ))}
      </div>
      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">Filed</th>
              <th>Reported</th>
              <th>Category</th>
              <th>By</th>
              <th>Event</th>
              <th>Evidence</th>
              <th>Assigned</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {reports.length === 0 && (
              <tr>
                <td colSpan={8} className="p-4 text-muted">
                  Queue is empty.
                </td>
              </tr>
            )}
            {reports.map((r) => (
              <tr key={r.id} className="border-t border-line hover:bg-bg/50">
                <td className="p-3">
                  <Link href={`/staff/reports/${r.id}`} className="text-accent">
                    <LocalTime date={r.createdAt} withZone={false} />
                  </Link>
                </td>
                <td>{r.reportedUser.displayName}</td>
                <td>{r.category.replace(/_/g, " ").toLowerCase()}</td>
                <td className="text-muted">{r.reporter.displayName}</td>
                <td className="text-muted">{r.event?.title ?? "—"}</td>
                <td className="text-muted">{r._count.evidence}</td>
                <td className="text-muted">{r.assignedStaff?.displayName ?? "—"}</td>
                <td>
                  <span className="tag">{STATUS_LABEL[r.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

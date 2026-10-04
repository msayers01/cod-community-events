import { requireStaff } from "@/lib/session";
import { listActionLog } from "@/modules/moderation/service";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

export default async function StaffLogPage() {
  const { actor } = await requireStaff();
  const log = await listActionLog(actor);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Append-only. Rows cannot be edited or deleted, enforced by the database.
      </p>
      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">When</th>
              <th>Staff</th>
              <th>Action</th>
              <th>Target</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {log.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-muted">
                  No actions yet.
                </td>
              </tr>
            )}
            {log.map((l) => (
              <tr key={l.id} className="border-t border-line align-top">
                <td className="p-3 whitespace-nowrap text-muted">
                  <LocalTime date={l.createdAt} withZone={false} />
                </td>
                <td>{l.staffUser.displayName}</td>
                <td className="text-accent">{l.action}</td>
                <td className="font-mono text-xs text-muted">
                  {l.targetType}:{l.targetId.slice(0, 8)}
                </td>
                <td className="text-muted">{l.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

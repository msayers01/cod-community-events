import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@cod/shared";
import { ThrowFlagStatus } from "@cod/shared";
import { requireStaff } from "@/lib/session";
import { listFlags } from "@/modules/throwflags/service";
import { LocalTime } from "@/components/local-time";
import { SIGNAL_LABEL } from "./labels";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  UNDER_REVIEW: "Under review",
  DISMISSED: "Dismissed",
  ESCALATED: "Escalated",
};

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { actor } = await requireStaff();
  if (!hasPermission(actor, "throwflag.review")) redirect("/staff");
  const { status } = await searchParams;
  const valid = Object.values(ThrowFlagStatus).includes(status as ThrowFlagStatus)
    ? (status as ThrowFlagStatus)
    : undefined;
  const flags = await listFlags(actor, valid);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Flags are leads, not findings. Anyone can have a bad game and SnD is high-variance, so a
        flag only means &ldquo;look at the footage&rdquo;. Nothing here sanctions anyone; escalate
        to open an ordinary report. The players concerned are never told a flag exists, and the
        detection criteria stay private.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/staff/flags" className={`tag ${!valid ? "border-accent text-accent" : ""}`}>
          Needs review
        </Link>
        {Object.values(ThrowFlagStatus).map((s) => (
          <Link
            key={s}
            href={`/staff/flags?status=${s}`}
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
              <th className="p-3">Raised</th>
              <th>Player</th>
              <th>Observation</th>
              <th>With</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {flags.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-muted">
                  Nothing to review.
                </td>
              </tr>
            )}
            {flags.map((f) => (
              <tr key={f.id} className="border-t border-line hover:bg-bg/50">
                <td className="p-3">
                  <Link href={`/staff/flags/${f.id}`} className="text-accent">
                    <LocalTime date={f.createdAt} withZone={false} />
                  </Link>
                </td>
                <td>{f.user.displayName}</td>
                <td className="text-muted">{SIGNAL_LABEL[f.signal]}</td>
                <td className="text-muted">{f.relatedUser?.displayName ?? "—"}</td>
                <td>
                  <span className="tag">{STATUS_LABEL[f.status]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

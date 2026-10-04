import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/session";
import { staffUserView } from "@/modules/moderation/service";
import { NotFoundError } from "@/lib/errors";
import { LocalTime } from "@/components/local-time";
import { Avatar } from "@/components/avatar";
import { UserStaffActions } from "./user-actions";

export const dynamic = "force-dynamic";

export default async function StaffUserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff();
  let user;
  try {
    user = await staffUserView(me.actor, id);
  } catch (e) {
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <header className="card">
          <div className="flex flex-wrap items-center gap-3">
            <Avatar user={user} size={48} />
            <h1 className="text-xl font-semibold">
              <Link
                href={`/u/${encodeURIComponent(user.displayName)}`}
                className="hover:text-accent"
              >
                {user.displayName}
              </Link>
            </h1>
            <span className={`tag ${user.status !== "ACTIVE" ? "border-warn text-warn" : ""}`}>
              {user.status.toLowerCase()}
            </span>
            {user.staffRole && (
              <span className="tag">{user.staffRole.role.toLowerCase().replace("_", " ")}</span>
            )}
          </div>
          <dl className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
            <dt className="text-muted">Activision ID</dt>
            <dd className="font-mono">{user.activisionId ?? "—"}</dd>
            <dt className="text-muted">Linked</dt>
            <dd>
              {user.accounts
                .map((a) => `${a.providerId}${a.handle ? ` (${a.handle})` : ""}`)
                .join(", ") || "—"}
            </dd>
            <dt className="text-muted">Joined</dt>
            <dd>
              <LocalTime date={user.createdAt} withZone={false} />
            </dd>
            <dt className="text-muted">No-shows</dt>
            <dd>{user._count.registrations}</dd>
          </dl>
          <p className="mt-2 text-[11px] text-muted">Email addresses are not shown to staff.</p>
        </header>

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Sanctions ({user.sanctions.length})</h2>
          <ul className="space-y-1">
            {user.sanctions.length === 0 && <li className="text-muted">None.</li>}
            {user.sanctions.map((s) => (
              <li key={s.id} className="rounded bg-bg p-2">
                <span className="text-warn">{s.type.toLowerCase().replace("_", " ")}</span> ·{" "}
                <LocalTime date={s.createdAt} withZone={false} />
                {s.endsAt && (
                  <>
                    {" "}
                    → <LocalTime date={s.endsAt} withZone={false} />
                  </>
                )}{" "}
                · by {s.issuedBy.displayName}
                <p className="text-muted">{s.reason}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="grid gap-6 sm:grid-cols-2">
          <ReportList title="Reports received" items={user.reportsReceived} />
          <ReportList title="Reports filed" items={user.reportsFiled} />
        </section>
      </div>
      <aside>
        <UserStaffActions
          userId={user.id}
          staffRole={me.actor.staffRole!}
          hasAvatar={!!user.avatarUpdatedAt}
          notes={user.staffNotes.map((n) => ({
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

function ReportList({
  title,
  items,
}: {
  title: string;
  items: { id: string; category: string; status: string; createdAt: Date }[];
}) {
  return (
    <section className="card text-sm">
      <h2 className="mb-2 font-semibold">
        {title} ({items.length})
      </h2>
      <ul className="space-y-1 text-xs">
        {items.length === 0 && <li className="text-muted">None.</li>}
        {items.map((r) => (
          <li key={r.id}>
            <Link href={`/staff/reports/${r.id}`} className="text-accent">
              <LocalTime date={r.createdAt} withZone={false} />
            </Link>{" "}
            · {r.category.toLowerCase().replace(/_/g, " ")} ·{" "}
            <span className="text-muted">{r.status.toLowerCase().replace(/_/g, " ")}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

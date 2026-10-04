import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@cod/db";
import { label } from "@/lib/format";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ displayName: string }>;
}) {
  const displayName = decodeURIComponent((await params).displayName);
  const user = await prisma.user.findUnique({
    where: { displayName },
    include: {
      staffRole: true,
      hosterProfile: {
        include: {
          _count: { select: { events: { where: { status: { in: ["COMPLETED", "ARCHIVED"] } } } } },
        },
      },
      accounts: { select: { providerId: true, handle: true } },
      registrations: {
        where: { status: { in: ["CONFIRMED", "CHECKED_IN", "IN_POOL", "NO_SHOW"] } },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { event: { select: { slug: true, title: true, startsAt: true, status: true } } },
      },
    },
  });
  if (!user) notFound();

  const noShows = user.registrations.filter((r) => r.status === "NO_SHOW").length;
  const played = user.registrations.filter(
    (r) => r.status !== "NO_SHOW" && ["COMPLETED", "ARCHIVED"].includes(r.event.status),
  ).length;
  const confirmedPayouts = user.hosterProfile
    ? await prisma.payoutConfirmation.count({
        where: { event: { hosterId: user.id }, response: "PAID" },
      })
    : 0;
  const badges = [
    user.staffRole && !user.staffRole.badgeHidden
      ? user.staffRole.role === "FOUNDER"
        ? "Founder"
        : user.staffRole.role === "ADMIN"
          ? "Admin"
          : "Moderator"
      : null,
    user.hosterProfile ? label(user.hosterProfile.tier) : null,
    user.hosterProfile?.foundingHoster ? "Founding Hoster" : null,
  ].filter(Boolean) as string[];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="card">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{user.displayName}</h1>
          {badges.map((b) => (
            <span key={b} className="tag border-accent/60 text-accent">
              {b}
            </span>
          ))}
        </div>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="label">Activision ID</dt>
            <dd className="font-mono">{user.activisionId ?? "—"}</dd>
          </div>
          <div>
            <dt className="label">Stream</dt>
            <dd>
              {user.streamUrl ? (
                <a className="text-accent" href={user.streamUrl} target="_blank" rel="noreferrer">
                  {user.streamUrl.replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="label">Linked</dt>
            <dd>
              {user.accounts.length
                ? user.accounts
                    .map((a) => `${a.providerId}${a.handle ? ` (${a.handle})` : ""}`)
                    .join(", ")
                : "—"}
            </dd>
          </div>
        </dl>
        {user.bio && <p className="mt-3 text-sm text-muted">{user.bio}</p>}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Events played" value={played} />
        <Stat label="No-shows" value={noShows} warn={noShows > 0} />
        {user.hosterProfile && (
          <Stat
            label="Events hosted"
            value={user.hosterProfile._count.events}
            sub={`${confirmedPayouts} confirmed payouts`}
          />
        )}
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Recent events</h2>
        {user.registrations.length === 0 ? (
          <p className="text-sm text-muted">No events yet.</p>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {user.registrations.map((r) => (
              <li key={r.id} className="flex items-center justify-between py-2">
                <Link href={`/events/${r.event.slug}`} className="hover:text-accent">
                  {r.event.title}
                </Link>
                <span className="flex items-center gap-3 text-xs text-muted">
                  <LocalTime date={r.event.startsAt} withZone={false} />
                  <span className="tag">{label(r.status)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({
  label: l,
  value,
  sub,
  warn,
}: {
  label: string;
  value: number;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="card">
      <p className="label">{l}</p>
      <p className={`text-2xl font-semibold ${warn ? "text-warn" : ""}`}>{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

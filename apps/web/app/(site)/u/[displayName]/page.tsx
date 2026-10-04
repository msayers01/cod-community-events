import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@cod/db";
import { label } from "@/lib/format";
import { LocalTime } from "@/components/local-time";
import { getCurrentUser } from "@/lib/session";
import { hosterPayoutRecord, reputationFor, reviewsForHoster } from "@/modules/reputation/service";
import { activeEntriesFor } from "@/modules/moderation/blacklist";
import { standingsForUser } from "@/modules/leaderboards/service";

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
      badges: true,
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
  const [viewer, payoutRecord, rep, reviews, blacklist, standings] = await Promise.all([
    getCurrentUser(),
    user.hosterProfile ? hosterPayoutRecord(user.id) : null,
    reputationFor(user.id),
    user.hosterProfile ? reviewsForHoster(user.id) : [],
    activeEntriesFor(user.id),
    standingsForUser(user.id),
  ]);
  const BADGE_LABEL: Record<string, string> = {
    FOUNDER: "Founder",
    ADMIN: "Admin",
    MODERATOR: "Moderator",
    NEW_HOSTER: "New Hoster",
    VERIFIED_HOSTER: "Verified Hoster",
    TRUSTED_HOSTER: "Trusted Hoster",
    FOUNDING_HOSTER: "Founding Hoster",
    VERIFIED_PLAYER: "Verified Player",
    SUPPORTER: "Supporter",
  };
  const staffHidden = user.staffRole?.badgeHidden ?? false;
  const badges =
    user.badges.length > 0
      ? user.badges
          .filter((b) => !(staffHidden && ["FOUNDER", "ADMIN", "MODERATOR"].includes(b.badge)))
          .map((b) => BADGE_LABEL[b.badge] ?? b.badge)
      : ([
          user.staffRole && !staffHidden
            ? user.staffRole.role === "FOUNDER"
              ? "Founder"
              : user.staffRole.role === "ADMIN"
                ? "Admin"
                : "Moderator"
            : null,
          user.hosterProfile ? label(user.hosterProfile.tier) : null,
          user.hosterProfile?.foundingHoster ? "Founding Hoster" : null,
        ].filter(Boolean) as string[]);

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
          {user.status !== "ACTIVE" && (
            <span className="tag border-warn text-warn">{user.status.toLowerCase()}</span>
          )}
          {viewer && viewer.id !== user.id && (
            <Link
              href={`/report/${user.id}`}
              className="ml-auto text-xs text-muted hover:text-warn"
            >
              Report this user
            </Link>
          )}
          {viewer?.actor.staffRole && (
            <Link href={`/staff/users/${user.id}`} className="text-xs text-muted hover:text-accent">
              Staff view
            </Link>
          )}
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
        {standings.length > 0 && (
          <p className="mt-3 text-xs text-muted">
            This month:{" "}
            {standings.map((st, i) => (
              <span key={st.mode}>
                {i > 0 && " · "}
                <Link href={`/leaderboards?period=MONTH&mode=${st.mode}`} className="text-accent">
                  #{st.rank} {label(st.mode)}
                </Link>{" "}
                ({st.points} pts)
              </span>
            ))}
          </p>
        )}
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        <Stat label="Events played" value={played} />
        <Stat label="No-shows" value={noShows} warn={noShows > 0} />
        {user.hosterProfile && payoutRecord && (
          <Stat
            label="Events hosted"
            value={payoutRecord.completedEvents}
            sub={`${payoutRecord.paid} confirmed payouts${payoutRecord.notPaid ? ` · ${payoutRecord.notPaid} reported unpaid` : ""}`}
            warn={payoutRecord.notPaid > 0}
          />
        )}
      </section>

      {blacklist.length > 0 && (
        <section className="card border-warn/60">
          <h2 className="mb-2 font-semibold text-warn">Verified reports</h2>
          <ul className="space-y-1 text-sm">
            {blacklist.map((e) => (
              <li key={e.id}>
                {e.publicWording}
                {e.expiresAt && (
                  <span className="text-xs text-muted">
                    {" "}
                    · expires <LocalTime date={e.expiresAt} withZone={false} />
                  </span>
                )}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Reviewed and approved by staff.</p>
        </section>
      )}

      {rep && rep.verifiedMatches > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Verified stats</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="label">Matches</dt>
              <dd className="text-xl font-semibold">
                {rep.verifiedMatches}{" "}
                <span className="text-xs text-muted">({rep.verifiedWins} W)</span>
              </dd>
            </div>
            <div>
              <dt className="label">K/D</dt>
              <dd className="text-xl font-semibold">
                {rep.deaths > 0 ? (rep.kills / rep.deaths).toFixed(2) : rep.kills}
              </dd>
            </div>
            <div>
              <dt className="label">Kills / match</dt>
              <dd className="text-xl font-semibold">
                {(rep.kills / rep.verifiedMatches).toFixed(1)}
              </dd>
            </div>
            <div>
              <dt className="label">Plants + defuses</dt>
              <dd className="text-xl font-semibold">{rep.plants + rep.defuses}</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">
            Only results confirmed by players in the match count here.
          </p>
        </section>
      )}

      {rep && rep.ratingCount > 0 && (
        <section className="card">
          <h2 className="mb-2 font-semibold">Teammate rating</h2>
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="label">Would play again</dt>
              <dd className="text-xl font-semibold">{rep.wouldPlayAgainPct?.toFixed(0)}%</dd>
            </div>
            <div>
              <dt className="label">Communication</dt>
              <dd className="text-xl font-semibold">{rep.communicationAvg?.toFixed(1)} / 5</dd>
            </div>
            <div>
              <dt className="label">Effort</dt>
              <dd className="text-xl font-semibold">{rep.effortAvg?.toFixed(1)} / 5</dd>
            </div>
          </dl>
          <p className="mt-2 text-xs text-muted">From {rep.ratingCount} teammate ratings.</p>
        </section>
      )}

      {user.hosterProfile && (
        <section className="card">
          <h2 className="mb-2 font-semibold">
            Hoster reviews {rep?.reviewCount ? `(${rep.reviewCount})` : ""}
          </h2>
          {rep && rep.reviewCount > 0 && (
            <p className="mb-3 text-sm text-muted">
              Organization {rep.organizationAvg?.toFixed(1)} · Communication{" "}
              {rep.hosterCommunicationAvg?.toFixed(1)} · Fairness {rep.fairnessAvg?.toFixed(1)} (out
              of 5)
            </p>
          )}
          {reviews.length === 0 ? (
            <p className="text-sm text-muted">
              No reviews yet. Only participants can review an event.
            </p>
          ) : (
            <ul className="divide-y divide-line text-sm">
              {reviews.map((r) => (
                <li key={r.id} className="py-2">
                  <p className="text-xs text-muted">
                    {r.reviewer.displayName} ·{" "}
                    <Link href={`/events/${r.event.slug}`} className="hover:text-accent">
                      {r.event.title}
                    </Link>{" "}
                    · {r.organization}/{r.communication}/{r.fairness}
                  </p>
                  {r.comment && <p>{r.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

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

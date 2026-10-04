import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { getEventBySlug } from "@/modules/events/service";
import { getCurrentUser } from "@/lib/session";
import { label, money } from "@/lib/format";
import { LocalTime } from "@/components/local-time";
import { StatusTag } from "@/components/event-card";
import { SignupPanel } from "./signup-panel";
import { SpinLog } from "./spin-log";
import { LiveEvent } from "@/components/live-event";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const e = await getEventBySlug((await params).slug);
  return { title: e?.title ?? "Event" };
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [event, user] = await Promise.all([getEventBySlug(slug), getCurrentUser()]);
  if (!event || event.status === "DRAFT") notFound();

  const rules = event.rules as {
    mapPool?: string[];
    bannedItems?: string[];
    streamingRequired?: boolean;
    monicamOnRequest?: boolean;
    notes?: string;
  };
  const split = event.payoutSplit as { place: number; percent: number }[];
  const occupying = event.registrations.filter((r) =>
    ["CONFIRMED", "CHECKED_IN", "IN_POOL"].includes(r.status),
  );
  const waitlist = event.registrations.filter((r) => r.status === "WAITLISTED");
  const mine = user ? (event.registrations.find((r) => r.playerId === user.id) ?? null) : null;
  const isHoster = user?.id === event.hosterId;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <header>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">{event.title}</h1>
            <StatusTag status={event.status} />
            <LiveEvent eventId={event.id} />
          </div>
          <p className="mt-1 text-muted">
            Hosted by{" "}
            <Link
              className="text-ink hover:text-accent"
              href={`/u/${encodeURIComponent(event.hoster.user.displayName)}`}
            >
              {event.hoster.user.displayName}
            </Link>{" "}
            · <span className="text-accent">{label(event.hoster.tier)}</span>
            {event.hoster.foundingHoster && <span className="tag ml-2">Founding Hoster</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="tag">{label(event.mode)}</span>
            <span className="tag">
              {event.teamSize}v{event.teamSize} {label(event.format)}
            </span>
            {event.roundCount && <span className="tag">{event.roundCount} rounds</span>}
            <span className="tag">{label(event.region)}</span>
            <span className="tag">{label(event.platform)}</span>
            <span className="tag">{label(event.entryType)}</span>
          </div>
        </header>

        <section className="card grid gap-4 sm:grid-cols-3">
          <div>
            <p className="label">Starts</p>
            <LocalTime date={event.startsAt} />
          </div>
          <div>
            <p className="label">Check-in</p>
            <LocalTime date={event.checkInOpensAt} withZone={false} /> –{" "}
            <LocalTime date={event.checkInClosesAt} withZone={false} />
          </div>
          <div>
            <p className="label">Entry</p>
            {money(event.entryFeeCents, event.currency)}
            <span className="text-muted"> · paid to the hoster directly</span>
          </div>
          <div className="sm:col-span-3">
            <p className="label">Payout split</p>
            {split.map((s) => `${ordinal(s.place)} ${s.percent}%`).join(" · ")}
          </div>
        </section>

        {event.description && (
          <section className="card whitespace-pre-wrap text-sm leading-relaxed">
            {event.description}
          </section>
        )}

        <section className="card text-sm">
          <h2 className="mb-2 font-semibold">Rules</h2>
          <ul className="space-y-1 text-muted">
            <li>
              <span className="text-ink">Map pool:</span>{" "}
              {rules.mapPool?.length ? rules.mapPool.join(", ") : "Hoster's choice"}
            </li>
            <li>
              <span className="text-ink">Banned:</span>{" "}
              {rules.bannedItems?.length ? rules.bannedItems.join(", ") : "Nothing"}
            </li>
            <li>
              <span className="text-ink">Streaming:</span>{" "}
              {rules.streamingRequired ? "Required for all players" : "Not required"}
              {rules.monicamOnRequest ? " · monicam on request" : ""}
            </li>
            {rules.notes && <li className="whitespace-pre-wrap">{rules.notes}</li>}
          </ul>
        </section>

        <SpinLog rounds={event.rounds} />
      </div>

      <aside className="space-y-6">
        <SignupPanel
          eventId={event.id}
          status={event.status}
          signedIn={!!user}
          isHoster={isHoster}
          mine={
            mine
              ? { id: mine.id, status: mine.status, waitlistPosition: mine.waitlistPosition }
              : null
          }
          confirmed={occupying.length}
          cap={event.playerCap}
          waitlisted={waitlist.length}
        />

        <section className="card">
          <h2 className="mb-2 font-semibold">
            Players ({occupying.length}/{event.playerCap})
          </h2>
          <ul className="space-y-1 text-sm">
            {occupying.map((r) => (
              <li key={r.id} className="flex items-center justify-between">
                <Link
                  href={`/u/${encodeURIComponent(r.player.displayName)}`}
                  className="hover:text-accent"
                >
                  {r.player.displayName}
                </Link>
                <span className="flex items-center gap-2 text-xs text-muted">
                  {r.player.streamUrl && (
                    <a
                      href={r.player.streamUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-accent"
                    >
                      stream
                    </a>
                  )}
                  {label(r.status)}
                </span>
              </li>
            ))}
            {occupying.length === 0 && <li className="text-muted">No paid players yet.</li>}
          </ul>
          {waitlist.length > 0 && (
            <>
              <h3 className="mb-1 mt-4 text-xs uppercase tracking-wide text-muted">
                Waitlist ({waitlist.length})
              </h3>
              <ol className="space-y-1 text-sm text-muted">
                {waitlist.map((r) => (
                  <li key={r.id}>
                    {r.waitlistPosition}. {r.player.displayName}
                  </li>
                ))}
              </ol>
            </>
          )}
        </section>
      </aside>
    </div>
  );
}

function ordinal(n: number) {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

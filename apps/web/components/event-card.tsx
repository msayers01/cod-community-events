import Link from "next/link";
import { label, money } from "@/lib/format";
import { LocalTime } from "./local-time";

export interface EventCardData {
  slug: string;
  title: string;
  mode: string;
  format: string;
  teamSize: number;
  region: string;
  platform: string;
  entryFeeCents: number;
  currency: string;
  startsAt: Date;
  status: string;
  playerCap: number;
  confirmedCount: number;
  hosterName: string;
  hosterTier: string;
}

export function EventCard({ e }: { e: EventCardData }) {
  const spotsLeft = e.playerCap - e.confirmedCount;
  return (
    <Link href={`/events/${e.slug}`} className="card block hover:border-accent/60">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold">{e.title}</h3>
          <p className="text-sm text-muted">
            {e.hosterName} · <span className="text-ink/80">{label(e.hosterTier)}</span>
          </p>
        </div>
        <StatusTag status={e.status} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <span className="tag">{label(e.mode)}</span>
        <span className="tag">
          {e.teamSize}v{e.teamSize} {label(e.format)}
        </span>
        <span className="tag">{label(e.region)}</span>
        <span className="tag">{label(e.platform)}</span>
        <span className="tag">{money(e.entryFeeCents, e.currency)}</span>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <LocalTime date={e.startsAt} />
        <span className={spotsLeft > 0 ? "text-ok" : "text-muted"}>
          {e.confirmedCount}/{e.playerCap} paid ·{" "}
          {spotsLeft > 0 ? `${spotsLeft} spots left` : "Full (waitlist open)"}
        </span>
      </div>
    </Link>
  );
}

export function StatusTag({ status }: { status: string }) {
  const color =
    status === "LIVE"
      ? "border-warn text-warn"
      : status === "CHECK_IN"
        ? "border-accent text-accent"
        : status === "OPEN"
          ? "border-ok text-ok"
          : "";
  return <span className={`tag ${color}`}>{label(status)}</span>;
}

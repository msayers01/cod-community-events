import { eventFilterSchema, GameMode, Region, Platform } from "@cod/shared";
import { listPublicEvents } from "@/modules/events/service";
import { EventCard } from "@/components/event-card";
import { label } from "@/lib/format";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const filter = eventFilterSchema.parse(sp);
  const { events, nextCursor } = await listPublicEvents(filter);

  return (
    <div>
      <section className="mb-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Community switcheroos & tournaments
        </h1>
        <p className="mt-2 max-w-2xl text-muted">
          Find legit hosters, sign up in one click, and verify every wheel spin. Hosters get
          sign-ups, check-in, a provably fair OBS wheel overlay and a public track record.
        </p>
      </section>

      <form className="card mb-6 grid grid-cols-2 gap-3 md:grid-cols-5" method="get">
        <Select
          name="mode"
          value={sp.mode}
          options={Object.values(GameMode)}
          placeholder="Any mode"
        />
        <Select
          name="region"
          value={sp.region}
          options={Object.values(Region)}
          placeholder="Any region"
        />
        <Select
          name="platform"
          value={sp.platform}
          options={Object.values(Platform)}
          placeholder="Any platform"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="startingSoon"
            value="true"
            defaultChecked={sp.startingSoon === "true"}
          />{" "}
          Starting in 6h
        </label>
        <div className="flex gap-2">
          <button className="btn btn-primary">Filter</button>
          <Link href="/" className="btn">
            Reset
          </Link>
        </div>
      </form>

      {events.length === 0 ? (
        <p className="card text-muted">
          No events match. Hosters:{" "}
          <Link className="text-accent" href="/dashboard">
            post one
          </Link>
          .
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {events.map((e) => (
            <EventCard
              key={e.id}
              e={{ ...e, hosterName: e.hoster.user.displayName, hosterTier: e.hoster.tier }}
            />
          ))}
        </div>
      )}
      {nextCursor && (
        <div className="mt-6 text-center">
          <Link className="btn" href={{ pathname: "/", query: { ...sp, cursor: nextCursor } }}>
            Load more
          </Link>
        </div>
      )}
    </div>
  );
}

function Select({
  name,
  value,
  options,
  placeholder,
}: {
  name: string;
  value?: string;
  options: string[];
  placeholder: string;
}) {
  return (
    <select name={name} defaultValue={value ?? ""} className="input">
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );
}

import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listHosterEvents } from "@/modules/events/service";
import { registerAsHosterAction } from "./actions";
import { StatusTag } from "@/components/event-card";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!user.actor.isHoster) {
    return (
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold">Become a hoster</h1>
        <p className="mt-1 text-sm text-muted">
          Hosters post events, mark payments, run the wheel and build a public payout record. New
          hosters start at the “New Hoster” tier and move up automatically with completed events and
          confirmed payouts.
        </p>
        <form action={registerAsHosterAction} className="card mt-6 space-y-3">
          <div>
            <label className="label" htmlFor="twitterHandle">
              X / Twitter handle (optional)
            </label>
            <input
              id="twitterHandle"
              name="twitterHandle"
              className="input"
              placeholder="@yourhandle"
            />
          </div>
          <div>
            <label className="label" htmlFor="discordInvite">
              Discord invite (optional)
            </label>
            <input
              id="discordInvite"
              name="discordInvite"
              className="input"
              placeholder="https://discord.gg/..."
            />
          </div>
          <button className="btn btn-primary">Register as hoster</button>
        </form>
      </div>
    );
  }

  const events = await listHosterEvents(user.actor);
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Your events</h1>
        <Link href="/dashboard/events/new" className="btn btn-primary">
          New event
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="card text-muted">No events yet. Create your first one.</p>
      ) : (
        <div className="card divide-y divide-line p-0">
          {events.map((e) => (
            <Link
              key={e.id}
              href={`/dashboard/events/${e.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-bg/50"
            >
              <div>
                <p className="font-medium">{e.title}</p>
                <p className="text-xs text-muted">
                  <LocalTime date={e.startsAt} />
                </p>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <span className="text-muted">
                  {e._count.registrations}/{e.playerCap} paid
                </span>
                <StatusTag status={e.status} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

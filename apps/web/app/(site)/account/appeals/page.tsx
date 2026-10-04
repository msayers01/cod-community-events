import { redirect } from "next/navigation";
import { prisma } from "@cod/db";
import { getCurrentUser } from "@/lib/session";
import { activeEntriesFor, myAppeals } from "@/modules/moderation/blacklist";
import { LocalTime } from "@/components/local-time";
import { uploadsEnabled } from "@/lib/storage";
import { AppealForm } from "./form";

export const dynamic = "force-dynamic";

export default async function AppealsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const [entries, sanctions, appeals] = await Promise.all([
    activeEntriesFor(user.id),
    prisma.sanction.findMany({
      where: { userId: user.id, OR: [{ endsAt: null }, { endsAt: { gt: new Date() } }] },
      orderBy: { createdAt: "desc" },
    }),
    myAppeals(user.id),
  ]);
  const appealed = new Set(appeals.map((a) => `${a.target}:${a.targetId}`));
  const uploads = uploadsEnabled();
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Appeals</h1>
        <p className="mt-1 text-sm text-muted">
          Appeals are the official channel for disputing a decision. They are handled by a moderator
          who was not involved in the original decision. Harassing staff over decisions is itself a
          rule violation.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="font-semibold">Decisions you can appeal</h2>
        {entries.length === 0 && sanctions.length === 0 && (
          <p className="card text-sm text-muted">No active entries or sanctions on your account.</p>
        )}
        {entries.map((e) => (
          <div key={e.id} className="card text-sm">
            <p>
              <span className="text-warn">Verified report</span> · {e.publicWording}
            </p>
            {appealed.has(`BLACKLIST_ENTRY:${e.id}`) ? (
              <p className="mt-1 text-xs text-muted">Appeal filed.</p>
            ) : (
              <AppealForm target="BLACKLIST_ENTRY" targetId={e.id} uploads={uploads} />
            )}
          </div>
        ))}
        {sanctions.map((s) => (
          <div key={s.id} className="card text-sm">
            <p>
              <span className="text-warn">{s.type.toLowerCase().replace("_", " ")}</span> ·{" "}
              {s.reason}
              {s.endsAt && (
                <>
                  {" "}
                  · until <LocalTime date={s.endsAt} withZone={false} />
                </>
              )}
            </p>
            {appealed.has(`SANCTION:${s.id}`) ? (
              <p className="mt-1 text-xs text-muted">Appeal filed.</p>
            ) : (
              <AppealForm target="SANCTION" targetId={s.id} uploads={uploads} />
            )}
          </div>
        ))}
      </section>

      {appeals.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Your appeals</h2>
          <ul className="card divide-y divide-line p-0 text-sm">
            {appeals.map((a) => (
              <li key={a.id} className="p-3">
                <div className="flex items-center justify-between">
                  <span>{a.target.toLowerCase().replace("_", " ")}</span>
                  <span className="tag">{a.status.toLowerCase().replace("_", " ")}</span>
                </div>
                {a.decisionReason && (
                  <p className="mt-1 text-xs text-muted">Decision: {a.decisionReason}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

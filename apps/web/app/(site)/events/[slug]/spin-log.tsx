import { LocalTime } from "@/components/local-time";

interface Member {
  user: { id: string; displayName: string };
}
interface Team {
  id: string;
  label: string;
  members: Member[];
}
interface Spin {
  id: string;
  status: string;
  commitment: string;
  poolHash: string;
  revealedSecret: string | null;
  committedAt: Date;
  spunAt: Date | null;
  pool: unknown;
}
interface Round {
  id: string;
  roundNumber: number;
  status: string;
  spin: Spin | null;
  teams: Team[];
}

/** Public, permanent spin log. Anyone can recompute the result from pool + revealed secret. */
export function SpinLog({ rounds }: { rounds: Round[] }) {
  if (rounds.length === 0) return null;
  return (
    <section className="card">
      <h2 className="mb-1 font-semibold">Spin log</h2>
      <p className="mb-4 text-xs text-muted">
        Each spin is committed before it happens (the commitment hash) and the secret is revealed
        after. Verify with{" "}
        <code className="rounded bg-bg px-1">
          sha256(secret + &quot;:&quot; + poolHash) == commitment
        </code>
        ; the teams are derived deterministically from the secret and the pool.
      </p>
      <div className="space-y-4">
        {rounds.map((r) => (
          <div key={r.id} className="rounded border border-line p-3 text-sm">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Round {r.roundNumber}</h3>
              <span className="tag">{r.status.replace("_", " ")}</span>
            </div>
            {r.teams.length > 0 && (
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {r.teams.map((t) => (
                  <div key={t.id} className="rounded bg-bg p-2">
                    <p className="text-xs uppercase tracking-wide text-accent">{t.label}</p>
                    <p>{t.members.map((m) => m.user.displayName).join(", ")}</p>
                  </div>
                ))}
              </div>
            )}
            {r.spin && (
              <dl className="mt-3 grid gap-1 font-mono text-[11px] text-muted sm:grid-cols-[110px_1fr]">
                <dt>committed</dt>
                <dd>
                  <LocalTime date={r.spin.committedAt} />
                </dd>
                <dt>commitment</dt>
                <dd className="break-all">{r.spin.commitment}</dd>
                <dt>pool hash</dt>
                <dd className="break-all">{r.spin.poolHash}</dd>
                {r.spin.spunAt && (
                  <>
                    <dt>spun</dt>
                    <dd>
                      <LocalTime date={r.spin.spunAt} />
                    </dd>
                  </>
                )}
                <dt>secret</dt>
                <dd className="break-all">
                  {r.spin.revealedSecret ?? "(revealed after the spin)"}
                </dd>
                <dt>pool</dt>
                <dd className="break-all">{JSON.stringify(r.spin.pool)}</dd>
              </dl>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

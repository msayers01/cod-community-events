import type { Metadata } from "next";
import Link from "next/link";
import { GameMode, type LeaderboardPeriod } from "@cod/shared";
import { label } from "@/lib/format";
import { LocalTime } from "@/components/local-time";
import { LiveLeaderboard } from "@/components/live-leaderboard";
import { Avatar } from "@/components/avatar";
import {
  getLeaderboard,
  isValidMonthKey,
  listBoards,
  MIN_RANKED_MATCHES,
  POINTS,
} from "@/modules/leaderboards/service";

export const metadata: Metadata = { title: "Leaderboards" };
export const dynamic = "force-dynamic";

export default async function LeaderboardsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; key?: string; mode?: string }>;
}) {
  const q = await searchParams;
  const boards = await listBoards();
  const mode = Object.values(GameMode).includes(q.mode as GameMode)
    ? (q.mode as GameMode)
    : GameMode.SND;
  // Fall back to the current month when the link points at nothing we know about.
  const chosen =
    boards.find((b) => b.period === q.period && b.periodKey === q.key) ??
    (q.period === "MONTH" && q.key && isValidMonthKey(q.key)
      ? { period: "MONTH" as LeaderboardPeriod, periodKey: q.key, label: q.key }
      : boards[0]!);
  const { entries, updatedAt } = await getLeaderboard(chosen.period, chosen.periodKey, mode);
  const href = (b: { period: string; periodKey: string }, m: string) =>
    `/leaderboards?period=${b.period}&key=${encodeURIComponent(b.periodKey)}&mode=${m}`;

  return (
    <div className="mx-auto max-w-3xl">
      <LiveLeaderboard period={chosen.period} periodKey={chosen.periodKey} />
      <h1 className="text-2xl font-semibold">Leaderboards</h1>
      <p className="mt-1 text-sm text-muted">
        Standings across every event on the site, built only from verified results. A win is worth{" "}
        {POINTS.win} points and a loss {POINTS.loss}, so showing up counts, and you need{" "}
        {MIN_RANKED_MATCHES} verified matches in a period to be ranked. Players who are suspended,
        banned or on the verified-reports list for cheating, throwing or falsified results are not
        shown.
      </p>

      <div className="mt-5 flex flex-wrap gap-2 text-sm">
        {Object.values(GameMode).map((m) => (
          <Link
            key={m}
            href={href(chosen, m)}
            className={`tag ${m === mode ? "border-accent text-accent" : ""}`}
          >
            {label(m)}
          </Link>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {boards.map((b) => (
          <Link
            key={`${b.period}:${b.periodKey}`}
            href={href(b, mode)}
            className={`tag ${b.period === chosen.period && b.periodKey === chosen.periodKey ? "border-accent text-accent" : ""}`}
          >
            {b.label}
          </Link>
        ))}
      </div>

      <div className="card mt-6 p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">#</th>
              <th>Player</th>
              <th className="text-right">Points</th>
              <th className="text-right">W–L</th>
              <th className="text-right">K/D</th>
              <th className="p-3 text-right">Matches</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-muted">
                  Nobody is ranked here yet.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line">
                <td className="p-3 text-muted">{e.rank}</td>
                <td>
                  <Link
                    href={`/u/${encodeURIComponent(e.user.displayName)}`}
                    className="inline-flex items-center gap-2 hover:text-accent"
                  >
                    <Avatar user={e.user} size={24} />
                    {e.user.displayName}
                  </Link>
                </td>
                <td className="text-right font-medium">{e.points}</td>
                <td className="text-right text-muted">
                  {e.wins}–{e.losses}
                </td>
                <td className="text-right text-muted">
                  {e.deaths === 0 ? e.kills : (e.kills / e.deaths).toFixed(2)}
                </td>
                <td className="p-3 text-right text-muted">{e.matches}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {updatedAt && (
        <p className="mt-2 text-xs text-muted">
          Updated <LocalTime date={updatedAt} />. Standings update live when a result is verified.
        </p>
      )}
    </div>
  );
}

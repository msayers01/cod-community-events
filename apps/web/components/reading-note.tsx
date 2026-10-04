import type { ReadingView } from "@/modules/matches/service";

const FIELD: Record<string, string> = {
  kills: "kills",
  deaths: "deaths",
  plants: "plants",
  defuses: "defuses",
  hillTimeSeconds: "hill time (s)",
};

/**
 * What the automatic scoreboard reading found. Purely advisory: it helps people spot a
 * typo or a padded stat, but a reading never verifies or rejects a result on its own.
 */
export function ReadingNote({ reading }: { reading: ReadingView | null }) {
  if (!reading) return null;
  if (reading.status === "PENDING" || reading.status === "PROCESSING")
    return <p className="mt-2 text-xs text-muted">Scoreboard is being read automatically…</p>;
  if (reading.status !== "COMPLETED") return null;
  if (reading.discrepancies.length > 0)
    return (
      <div className="mt-3 rounded border border-warn p-2 text-xs">
        <p className="font-medium text-warn">The screenshot reading disagrees with the stats</p>
        <ul className="mt-1 space-y-0.5">
          {reading.discrepancies.map((d, i) => (
            <li key={i}>
              {d.player}: {FIELD[d.field] ?? d.field} entered as {d.submitted}, screenshot reads{" "}
              {d.read}
            </li>
          ))}
        </ul>
        <p className="mt-1 text-muted">
          Automatic reading can misread digits. Check the screenshot yourself.
        </p>
      </div>
    );
  if (reading.filledStats)
    return (
      <p className="mt-3 rounded border border-line p-2 text-xs text-muted">
        These stats were read from the screenshot automatically. Check them before you confirm.
      </p>
    );
  return null;
}

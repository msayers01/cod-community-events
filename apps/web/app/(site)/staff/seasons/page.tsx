import Link from "next/link";
import { redirect } from "next/navigation";
import { hasPermission } from "@cod/shared";
import { requireStaff } from "@/lib/session";
import { listSeasons } from "@/modules/leaderboards/service";
import { LocalTime } from "@/components/local-time";
import { SeasonForm } from "./season-form";

export const dynamic = "force-dynamic";

export default async function SeasonsPage() {
  const { actor } = await requireStaff();
  if (!hasPermission(actor, "season.manage")) redirect("/staff");
  const seasons = await listSeasons();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <p className="text-xs text-muted">
        Seasons are fixed windows with their own standings, on top of the monthly and all-time
        boards. They cannot overlap, and results already verified inside the window count.
      </p>
      <SeasonForm />
      <div className="card p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">Season</th>
              <th>Starts</th>
              <th>Ends</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {seasons.length === 0 && (
              <tr>
                <td colSpan={4} className="p-4 text-muted">
                  No seasons yet.
                </td>
              </tr>
            )}
            {seasons.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="p-3">
                  <Link href={`/leaderboards?period=SEASON&key=${s.id}`} className="text-accent">
                    {s.name}
                  </Link>
                </td>
                <td>
                  <LocalTime date={s.startsAt} withZone={false} />
                </td>
                <td>
                  <LocalTime date={s.endsAt} withZone={false} />
                </td>
                <td className="text-muted">{s.createdBy.displayName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import Link from "next/link";
import { publicBlacklist } from "@/modules/moderation/blacklist";
import { LocalTime } from "@/components/local-time";

export const dynamic = "force-dynamic";

const CATEGORY: Record<string, string> = {
  NON_PAYMENT: "Non-payment",
  CHEATING: "Cheating",
  THROWING: "Throwing",
  REPEATED_NO_SHOWS: "Repeated no-shows",
  HARASSMENT: "Harassment",
  FALSIFIED_RESULTS: "Falsified results",
};

export default async function BlacklistPage() {
  const entries = await publicBlacklist();
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold">Verified reports</h1>
      <p className="mt-1 text-sm text-muted">
        Every entry here is a report that staff reviewed with evidence, after the person was given
        the chance to respond, and that two different staff members approved. Lesser categories
        expire. Every entry can be appealed. Entries are reviewed and approved by staff; individual
        staff are never named.
      </p>
      <div className="card mt-6 p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">User</th>
              <th>Category</th>
              <th>Entry</th>
              <th>Since</th>
              <th>Expires</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={5} className="p-4 text-muted">
                  No active entries.
                </td>
              </tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-line align-top">
                <td className="p-3">
                  <Link
                    href={`/u/${encodeURIComponent(e.user.displayName)}`}
                    className="hover:text-accent"
                  >
                    {e.user.displayName}
                  </Link>
                </td>
                <td className="text-warn">{CATEGORY[e.category]}</td>
                <td className="text-muted">{e.publicWording}</td>
                <td className="whitespace-nowrap text-xs text-muted">
                  {e.activatedAt && <LocalTime date={e.activatedAt} withZone={false} />}
                </td>
                <td className="whitespace-nowrap text-xs text-muted">
                  {e.expiresAt ? <LocalTime date={e.expiresAt} withZone={false} /> : "No expiry"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted">
        Reviewed and approved by staff. To dispute an entry about you, use the appeals page in your
        account.
      </p>
    </div>
  );
}

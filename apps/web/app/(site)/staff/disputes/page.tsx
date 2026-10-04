import { requireStaff } from "@/lib/session";
import { reviewQueue } from "@/modules/matches/service";
import { DisputeList } from "@/components/dispute-list";

export const dynamic = "force-dynamic";

export default async function StaffDisputesPage() {
  const user = await requireStaff();
  const queue = await reviewQueue(user.actor);
  return (
    <div>
      <p className="mb-3 text-xs text-muted">
        Hosters rule on disputes in their own events first. This queue shows every open dispute and
        unconfirmed result for escalations and cases involving the hoster.
      </p>
      <DisputeList items={queue} viewerId={user.id} />
    </div>
  );
}

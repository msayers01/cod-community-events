import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { myReports } from "@/modules/moderation/service";
import { LocalTime } from "@/components/local-time";
import { uploadsEnabled } from "@/lib/storage";
import { RespondForm } from "./respond-form";

export const dynamic = "force-dynamic";

const PUBLIC_STATUS: Record<string, string> = {
  SUBMITTED: "Submitted",
  GATHERING_EVIDENCE: "Being reviewed",
  AWAITING_RESPONSE: "Awaiting response",
  UNDER_REVIEW: "Being reviewed",
  ACTIONED: "Closed: action taken",
  DISMISSED: "Closed: dismissed",
};

export default async function MyReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ filed?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  const { filed } = await searchParams;
  const reports = await myReports(user.id);
  const uploads = uploadsEnabled();
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold">Reports</h1>
      {filed && (
        <p className="mt-2 text-sm text-ok">
          Report submitted. Staff will review it; you will be notified of the outcome.
        </p>
      )}
      <div className="mt-6 space-y-4">
        {reports.length === 0 && (
          <p className="card text-sm text-muted">No reports involving you.</p>
        )}
        {reports.map((r) => {
          const iAmAccused = r.reportedUserId === user.id;
          return (
            <div key={r.id} className="card text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  {iAmAccused ? (
                    <span className="text-warn">Report about you</span>
                  ) : (
                    <>
                      You reported <span className="font-medium">{r.reportedUser.displayName}</span>
                    </>
                  )}
                  {" · "}
                  {r.category.toLowerCase().replace(/_/g, " ")}
                </p>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <LocalTime date={r.createdAt} withZone={false} />
                  <span className="tag">{PUBLIC_STATUS[r.status]}</span>
                </span>
              </div>
              {iAmAccused && r.status === "AWAITING_RESPONSE" && !r.accusedResponse && (
                <>
                  <p className="mt-2 text-muted">
                    Staff are reviewing a {r.category.toLowerCase().replace(/_/g, " ")} report about
                    you. You can give your side and attach evidence before any decision.
                    {r.responseDeadline && (
                      <>
                        {" "}
                        Respond by <LocalTime date={r.responseDeadline} />.
                      </>
                    )}
                  </p>
                  <RespondForm reportId={r.id} uploads={uploads} />
                </>
              )}
              {iAmAccused && r.accusedResponse && (
                <p className="mt-2 text-muted">Your response: “{r.accusedResponse}”</p>
              )}
              {!iAmAccused &&
                r.resolution &&
                (r.status === "ACTIONED" || r.status === "DISMISSED") && (
                  <p className="mt-2 text-muted">Outcome: {r.resolution}</p>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

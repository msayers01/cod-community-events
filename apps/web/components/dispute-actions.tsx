"use client";
import { useState, useTransition } from "react";
import { resolveDisputeAction } from "@/app/(site)/confirmations/actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "./form-message";

export function DisputeActions({
  submissionId,
  eventId,
}: {
  submissionId: string;
  eventId?: string;
}) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (o: "VERIFIED" | "REJECTED") =>
    start(async () => setResult(await resolveDisputeAction(submissionId, o, reason, eventId)));
  if (result?.ok) return <FormMessage ok={result.message} />;
  return (
    <div className="mt-3 space-y-2">
      <input
        className="input"
        placeholder="Ruling reason (at least 10 characters, e.g. VOD at 1:12:30 shows 6-4)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending || reason.length < 10}
          onClick={() => run("VERIFIED")}
        >
          Verify as submitted
        </button>
        <button
          className="btn btn-danger"
          disabled={pending || reason.length < 10}
          onClick={() => run("REJECTED")}
        >
          Reject (allow resubmission)
        </button>
      </div>
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

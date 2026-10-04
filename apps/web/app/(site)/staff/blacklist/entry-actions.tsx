"use client";
import { useState, useTransition } from "react";
import { approveEntryAction, removeEntryAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";

export function EntryActions({
  entryId,
  alreadyApproved,
}: {
  entryId: string;
  alreadyApproved: boolean;
}) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-3 space-y-2">
      <input
        className="input"
        placeholder="Reason (logged, at least 10 characters)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        {!alreadyApproved && (
          <button
            className="btn btn-primary"
            disabled={pending || reason.length < 10}
            onClick={() =>
              confirm("Approve this entry?") &&
              start(async () => setResult(await approveEntryAction(entryId, reason)))
            }
          >
            Approve
          </button>
        )}
        <button
          className="btn btn-danger"
          disabled={pending || reason.length < 10}
          onClick={() =>
            confirm("Withdraw this proposal?") &&
            start(async () => setResult(await removeEntryAction(entryId, reason)))
          }
        >
          Withdraw
        </button>
      </div>
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? result.message : null}
      />
    </div>
  );
}

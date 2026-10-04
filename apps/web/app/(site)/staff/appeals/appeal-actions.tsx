"use client";
import { useState, useTransition } from "react";
import { decideAppealAction, takeAppealAction } from "@/app/(site)/staff/blacklist/actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";

export function AppealActions({
  appealId,
  status,
  mine,
}: {
  appealId: string;
  status: string;
  mine: boolean;
}) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  return (
    <div className="mt-3 space-y-2">
      <input
        className="input"
        placeholder="Reason (logged, at least 10 characters)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex gap-2">
        {status === "SUBMITTED" && (
          <button
            className="btn"
            disabled={pending || reason.length < 10}
            onClick={() => run(() => takeAppealAction(appealId, reason))}
          >
            Take this appeal
          </button>
        )}
        {status === "UNDER_REVIEW" && mine && (
          <>
            <button
              className="btn btn-primary"
              disabled={pending || reason.length < 10}
              onClick={() =>
                confirm("Overturn the original decision?") &&
                run(() => decideAppealAction(appealId, "OVERTURNED", reason))
              }
            >
              Overturn
            </button>
            <button
              className="btn btn-danger"
              disabled={pending || reason.length < 10}
              onClick={() =>
                confirm("Uphold the original decision?") &&
                run(() => decideAppealAction(appealId, "UPHELD", reason))
              }
            >
              Uphold
            </button>
          </>
        )}
      </div>
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? (result.message ?? "Done") : null}
      />
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import { flagStepAction } from "../actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";

export function FlagActions({ flagId, status }: { flagId: string; status: string }) {
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (step: "start" | "dismiss" | "escalate", ask: string) =>
    confirm(ask) && start(async () => setResult(await flagStepAction(flagId, step, reason)));
  if (status === "DISMISSED" || status === "ESCALATED") return null;
  const ready = reason.trim().length >= 10;
  return (
    <div className="mt-4 space-y-2">
      <input
        className="input"
        placeholder="Reason (logged, at least 10 characters)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {status === "OPEN" && (
          <button
            className="btn btn-primary"
            disabled={pending || !ready}
            onClick={() => run("start", "Start reviewing this flag?")}
          >
            Start review
          </button>
        )}
        {status === "UNDER_REVIEW" && (
          <button
            className="btn btn-danger"
            disabled={pending || !ready}
            onClick={() =>
              run(
                "escalate",
                "Open a throwing report? The player will be told and can respond before any decision.",
              )
            }
          >
            Escalate to a report
          </button>
        )}
        <button
          className="btn"
          disabled={pending || !ready}
          onClick={() => run("dismiss", "Dismiss this flag? The player is not notified.")}
        >
          Dismiss
        </button>
      </div>
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? result.message : null}
      />
    </div>
  );
}

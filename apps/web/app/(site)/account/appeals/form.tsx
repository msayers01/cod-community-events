"use client";
import { useState, useTransition } from "react";
import { fileAppealAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import type { EvidenceInput } from "@/app/(site)/report/actions";
import { FormMessage } from "@/components/form-message";
import { EvidenceEditor } from "@/components/evidence-editor";

export function AppealForm({
  target,
  targetId,
  uploads,
}: {
  target: "BLACKLIST_ENTRY" | "SANCTION" | "DISPUTE_RULING";
  targetId: string;
  uploads: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <FormMessage ok={result.message} />;
  if (!open)
    return (
      <button className="btn mt-2" onClick={() => setOpen(true)}>
        Appeal
      </button>
    );
  return (
    <div className="mt-3 space-y-2">
      <textarea
        className="input"
        rows={4}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        placeholder="Why the decision should be overturned (at least 20 characters)"
      />
      <EvidenceEditor value={evidence} onChange={setEvidence} uploads={uploads} />
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending || statement.trim().length < 20}
          onClick={() =>
            start(async () =>
              setResult(await fileAppealAction({ target, targetId, statement, evidence })),
            )
          }
        >
          Submit appeal
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

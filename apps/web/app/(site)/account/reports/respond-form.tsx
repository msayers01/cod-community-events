"use client";
import { useState, useTransition } from "react";
import { respondAsAccusedAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import type { EvidenceInput } from "@/app/(site)/report/actions";
import { FormMessage } from "@/components/form-message";
import { EvidenceEditor } from "@/components/evidence-editor";

export function RespondForm({ reportId, uploads }: { reportId: string; uploads: boolean }) {
  const [statement, setStatement] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <FormMessage ok={result.message} />;
  return (
    <div className="mt-3 space-y-2">
      <textarea
        className="input"
        rows={4}
        value={statement}
        onChange={(e) => setStatement(e.target.value)}
        placeholder="Your side of the story (at least 10 characters)"
      />
      <EvidenceEditor value={evidence} onChange={setEvidence} uploads={uploads} />
      <button
        className="btn btn-primary"
        disabled={pending || statement.trim().length < 10}
        onClick={() =>
          start(async () => setResult(await respondAsAccusedAction(reportId, statement, evidence)))
        }
      >
        Send response
      </button>
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

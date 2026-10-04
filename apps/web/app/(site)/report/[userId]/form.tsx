"use client";
import { useState, useTransition } from "react";
import { ReportCategory } from "@cod/shared";
import { fileReportAction, type EvidenceInput } from "../actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";
import { EvidenceEditor } from "@/components/evidence-editor";

const CATEGORY_LABELS: Record<string, string> = {
  NON_PAYMENT: "Non-payment / scamming",
  CHEATING: "Cheating",
  THROWING: "Throwing",
  REPEATED_NO_SHOWS: "Repeated no-shows",
  HARASSMENT: "Harassment",
  FALSIFIED_RESULTS: "Falsified results",
};

export function ReportForm({
  reportedUserId,
  sharedEvents,
  uploads,
}: {
  reportedUserId: string;
  sharedEvents: { id: string; title: string }[];
  uploads: boolean;
}) {
  const [category, setCategory] = useState<string>("NON_PAYMENT");
  const [eventId, setEventId] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput[]>([]);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="card mt-6 space-y-4 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () =>
          setResult(
            await fileReportAction({
              reportedUserId,
              category,
              description,
              eventId: eventId || undefined,
              evidence,
            }),
          ),
        );
      }}
    >
      <div>
        <label className="label" htmlFor="category">
          Category
        </label>
        <select
          id="category"
          className="input"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          {Object.values(ReportCategory).map((c) => (
            <option key={c} value={c}>
              {CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
      {sharedEvents.length > 0 && (
        <div>
          <label className="label" htmlFor="eventId">
            Related event (optional)
          </label>
          <select
            id="eventId"
            className="input"
            value={eventId}
            onChange={(e) => setEventId(e.target.value)}
          >
            <option value="">None</option>
            {sharedEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="label" htmlFor="description">
          What happened?
        </label>
        <textarea
          id="description"
          className="input"
          rows={5}
          minLength={20}
          required
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Be specific: when, which match or round, what you saw. At least 20 characters."
        />
      </div>
      <div>
        <p className="label">Evidence (required)</p>
        <EvidenceEditor value={evidence} onChange={setEvidence} uploads={uploads} />
      </div>
      <FormMessage error={result && !result.ok ? result.error : null} />
      <button
        className="btn btn-primary"
        disabled={pending || evidence.length === 0 || description.trim().length < 20}
      >
        Submit report
      </button>
    </form>
  );
}

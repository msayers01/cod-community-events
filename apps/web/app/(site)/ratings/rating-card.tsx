"use client";
import { useState, useTransition } from "react";
import { rateTeammateAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";

export function Scale({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted">{label}</span>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            className={`h-7 w-7 rounded border text-xs ${value >= n ? "border-accent bg-accent text-accent-ink" : "border-line"}`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export function RatingCard({
  matchId,
  teammate,
}: {
  matchId: string;
  teammate: { id: string; displayName: string };
}) {
  const [again, setAgain] = useState<boolean | null>(null);
  const [comm, setComm] = useState(0);
  const [effort, setEffort] = useState(0);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok) return <p className="text-xs text-ok">Rated {teammate.displayName}.</p>;
  return (
    <div className="rounded bg-bg p-3">
      <p className="mb-2 font-medium">{teammate.displayName}</p>
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted">Would play with again?</span>
          <div className="flex gap-1">
            <button
              type="button"
              className={`btn ${again === true ? "btn-primary" : ""}`}
              onClick={() => setAgain(true)}
            >
              Yes
            </button>
            <button
              type="button"
              className={`btn ${again === false ? "btn-danger" : ""}`}
              onClick={() => setAgain(false)}
            >
              No
            </button>
          </div>
        </div>
        <Scale label="Communication" value={comm} onChange={setComm} />
        <Scale label="Effort" value={effort} onChange={setEffort} />
      </div>
      <button
        className="btn btn-primary mt-3"
        disabled={pending || again === null || !comm || !effort}
        onClick={() =>
          start(async () =>
            setResult(
              await rateTeammateAction({
                matchId,
                ratedId: teammate.id,
                wouldPlayAgain: again!,
                communication: comm,
                effort,
              }),
            ),
          )
        }
      >
        Save
      </button>
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

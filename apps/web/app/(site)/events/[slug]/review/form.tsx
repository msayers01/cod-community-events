"use client";
import { useState, useTransition } from "react";
import { reviewHosterAction } from "@/app/(site)/ratings/actions";
import { Scale } from "@/app/(site)/ratings/rating-card";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";

export function ReviewForm({ eventId, eventSlug }: { eventId: string; eventSlug: string }) {
  const [org, setOrg] = useState(0);
  const [comm, setComm] = useState(0);
  const [fair, setFair] = useState(0);
  const [comment, setComment] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  if (result?.ok)
    return (
      <div className="card mt-6 text-sm">
        <FormMessage ok={result.message} />
      </div>
    );
  return (
    <div className="card mt-6 space-y-3 text-sm">
      <Scale label="Organization" value={org} onChange={setOrg} />
      <Scale label="Communication" value={comm} onChange={setComm} />
      <Scale label="Fairness" value={fair} onChange={setFair} />
      <textarea
        className="input"
        rows={3}
        placeholder="Optional comment (be specific and civil; staff can hide abusive comments)"
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      <button
        className="btn btn-primary"
        disabled={pending || !org || !comm || !fair}
        onClick={() =>
          start(async () =>
            setResult(
              await reviewHosterAction({
                eventId,
                eventSlug,
                organization: org,
                communication: comm,
                fairness: fair,
                comment: comment || undefined,
              }),
            ),
          )
        }
      >
        Submit review
      </button>
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { respondToPayoutAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";
import { LocalTime } from "@/components/local-time";

export function PayoutPrompt(p: {
  id: string;
  place: number;
  deadline: Date;
  eventTitle: string;
  eventHref: string;
  hoster: string;
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const run = (paid: boolean) =>
    start(async () => setResult(await respondToPayoutAction(p.id, paid, note || undefined)));
  return (
    <div className="card text-sm">
      <p>
        You placed <span className="font-semibold">#{p.place}</span> in{" "}
        <Link href={p.eventHref} className="text-accent">
          {p.eventTitle}
        </Link>{" "}
        hosted by {p.hoster}.
      </p>
      <p className="mt-1 text-xs text-muted">
        Please respond by <LocalTime date={p.deadline} />
      </p>
      {!result?.ok && (
        <>
          <input
            className="input mt-3"
            placeholder="Optional note (e.g. paid via PayPal on the 3rd)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={pending} onClick={() => run(true)}>
              I was paid
            </button>
            <button
              className="btn btn-danger"
              disabled={pending}
              onClick={() =>
                confirm("This opens a non-payment report for staff. Continue?") && run(false)
              }
            >
              I was not paid
            </button>
          </div>
        </>
      )}
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? result.message : null}
      />
    </div>
  );
}

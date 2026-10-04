"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { respondToSubmissionAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";
import { LocalTime } from "@/components/local-time";

export interface SubmissionView {
  id: string;
  screenshotHref: string;
  scoreA: number;
  scoreB: number;
  submittedBy: string;
  deadline: string;
  eventTitle: string;
  eventSlug: string;
  mode: string;
  round: number;
  teamA: string[];
  teamB: string[];
  stats: {
    name: string;
    kills: number;
    deaths: number;
    plants: number | null;
    defuses: number | null;
    hillTimeSeconds: number | null;
  }[];
}

export function ConfirmCard({ submission: s }: { submission: SubmissionView }) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [disputing, setDisputing] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const run = (r: "CONFIRM" | "DISPUTE") =>
    start(async () =>
      setResult(await respondToSubmissionAction(s.id, r, r === "DISPUTE" ? reason : undefined)),
    );
  if (result?.ok)
    return (
      <div className="card text-sm">
        <FormMessage ok={result.message} />
      </div>
    );
  return (
    <div className="card text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p>
          <Link href={`/events/${s.eventSlug}`} className="text-accent">
            {s.eventTitle}
          </Link>{" "}
          · round {s.round}
        </p>
        <p className="text-xs text-muted">
          submitted by {s.submittedBy} · respond by <LocalTime date={s.deadline} />
        </p>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded bg-bg p-2">
          <p className="text-xs text-accent">Team A</p>
          {s.teamA.join(", ")}
        </div>
        <p className="text-center text-2xl font-bold">
          {s.scoreA} <span className="text-muted">:</span> {s.scoreB}
        </p>
        <div className="rounded bg-bg p-2">
          <p className="text-xs text-accent">Team B</p>
          {s.teamB.join(", ")}
        </div>
      </div>
      <a
        href={s.screenshotHref}
        target="_blank"
        rel="noreferrer"
        className="mt-3 block overflow-hidden rounded border border-line"
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- screenshots come from arbitrary hosts or signed URLs */}
        <img
          src={s.screenshotHref}
          alt="Scoreboard screenshot"
          className="max-h-72 w-full object-contain bg-bg"
        />
      </a>
      {s.stats.length > 0 && (
        <table className="mt-3 w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th>Player</th>
              <th>K</th>
              <th>D</th>
              {s.mode === "SND" ? (
                <>
                  <th>Plants</th>
                  <th>Defuses</th>
                </>
              ) : (
                <th>Hill time</th>
              )}
            </tr>
          </thead>
          <tbody>
            {s.stats.map((st) => (
              <tr key={st.name} className="border-t border-line">
                <td className="py-1">{st.name}</td>
                <td>{st.kills}</td>
                <td>{st.deaths}</td>
                {s.mode === "SND" ? (
                  <>
                    <td>{st.plants ?? "—"}</td>
                    <td>{st.defuses ?? "—"}</td>
                  </>
                ) : (
                  <td>{st.hillTimeSeconds != null ? `${st.hillTimeSeconds}s` : "—"}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!disputing ? (
        <div className="mt-3 flex gap-2">
          <button className="btn btn-primary" disabled={pending} onClick={() => run("CONFIRM")}>
            Confirm
          </button>
          <button className="btn btn-danger" disabled={pending} onClick={() => setDisputing(true)}>
            Dispute
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            className="input"
            placeholder="What's wrong? e.g. score was 6-3, not 6-4"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="flex gap-2">
            <button
              className="btn btn-danger"
              disabled={pending || reason.trim().length < 5}
              onClick={() => run("DISPUTE")}
            >
              File dispute
            </button>
            <button className="btn" onClick={() => setDisputing(false)}>
              Back
            </button>
          </div>
        </div>
      )}
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

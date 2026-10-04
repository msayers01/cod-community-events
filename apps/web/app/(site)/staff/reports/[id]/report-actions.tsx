"use client";
import { useState, useTransition } from "react";
import { reportMachine, type ReportStatus, type StaffRole } from "@cod/shared";
import {
  addEvidenceAction,
  addStaffNoteAction,
  assignReportAction,
  issueSanctionAction,
  transitionReportAction,
} from "@/app/(site)/staff/actions";
import type { ActionResult } from "@/lib/actions";
import type { EvidenceInput } from "@/app/(site)/report/actions";
import { FormMessage } from "@/components/form-message";
import { EvidenceEditor } from "@/components/evidence-editor";

const NEXT_LABEL: Record<string, string> = {
  GATHERING_EVIDENCE: "Start gathering evidence",
  AWAITING_RESPONSE: "Request response from accused",
  UNDER_REVIEW: "Move to review",
  ACTIONED: "Close as actioned",
  DISMISSED: "Dismiss",
};

interface Props {
  reportId: string;
  status: ReportStatus;
  accusedId: string;
  recused: boolean;
  assignedToMe: boolean;
  staffRole: StaffRole;
  uploads: boolean;
  notes: { id: string; body: string; author: string; at: string }[];
}

export function ReportActions(p: Props) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  const [reason, setReason] = useState("");
  const [sanctionType, setSanctionType] = useState<"WARNING" | "SUSPENSION" | "PERMANENT_BAN">(
    "WARNING",
  );
  const [days, setDays] = useState(7);
  const [evidence, setEvidence] = useState<EvidenceInput[]>([]);
  const [note, setNote] = useState("");

  const next = reportMachine.table[p.status];
  const closed = p.status === "ACTIONED" || p.status === "DISMISSED";
  const canSuspend = p.staffRole !== "TRIAL_MODERATOR";
  const canBan = p.staffRole === "ADMIN" || p.staffRole === "FOUNDER";

  if (p.recused) {
    return (
      <section className="card text-sm text-muted">
        You are recused from this case and cannot act on it. Another staff member will handle it.
      </section>
    );
  }

  return (
    <>
      <section className="card space-y-3 text-sm">
        <h2 className="font-semibold">Actions</h2>
        <div>
          <label className="label" htmlFor="reason">
            Reason (required, goes in the log)
          </label>
          <textarea
            id="reason"
            className="input"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why you are taking this step"
          />
        </div>
        {!p.assignedToMe && !closed && (
          <button
            className="btn w-full justify-center"
            disabled={pending || reason.length < 10}
            onClick={() => run(() => assignReportAction(p.reportId, reason))}
          >
            Assign to me
          </button>
        )}
        <div className="flex flex-col gap-2">
          {next.map((s) => (
            <button
              key={s}
              className={`btn w-full justify-center ${s === "DISMISSED" ? "btn-danger" : s === "ACTIONED" ? "btn-primary" : ""}`}
              disabled={pending || reason.length < 10}
              onClick={() =>
                (s === "ACTIONED" || s === "DISMISSED"
                  ? confirm(`${NEXT_LABEL[s]}? This closes the report.`)
                  : true) && run(() => transitionReportAction(p.reportId, s, reason))
              }
            >
              {NEXT_LABEL[s]}
            </button>
          ))}
        </div>
        <FormMessage
          error={result && !result.ok ? result.error : null}
          ok={result?.ok ? (result.message ?? "Done") : null}
        />
      </section>

      {!closed && (
        <section className="card space-y-3 text-sm">
          <h2 className="font-semibold">Sanction the reported user</h2>
          <p className="text-xs text-muted">
            Warnings are internal. Suspensions block sign-ups until they expire. Permanent bans need
            an admin. Public blacklist entries come in Phase 2.
          </p>
          <select
            className="input"
            value={sanctionType}
            onChange={(e) => setSanctionType(e.target.value as typeof sanctionType)}
          >
            <option value="WARNING">Warning</option>
            {canSuspend && <option value="SUSPENSION">Temporary suspension</option>}
            {canBan && <option value="PERMANENT_BAN">Permanent ban</option>}
          </select>
          {sanctionType === "SUSPENSION" && (
            <label className="block">
              <span className="label">Days</span>
              <input
                type="number"
                min={1}
                max={365}
                className="input"
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
              />
            </label>
          )}
          <button
            className="btn btn-danger w-full justify-center"
            disabled={pending || reason.length < 10}
            onClick={() =>
              confirm(`Issue a ${sanctionType.toLowerCase().replace("_", " ")}?`) &&
              run(() =>
                issueSanctionAction({
                  userId: p.accusedId,
                  type: sanctionType,
                  reason,
                  days: sanctionType === "SUSPENSION" ? days : undefined,
                  reportId: p.reportId,
                }),
              )
            }
          >
            Issue {sanctionType.toLowerCase().replace("_", " ")}
          </button>
        </section>
      )}

      {!closed && (
        <section className="card space-y-2 text-sm">
          <h2 className="font-semibold">Add evidence</h2>
          <EvidenceEditor value={evidence} onChange={setEvidence} uploads={p.uploads} />
          <button
            className="btn w-full justify-center"
            disabled={pending || evidence.length === 0 || reason.length < 10}
            onClick={() =>
              run(async () => {
                for (const item of evidence) {
                  const r = await addEvidenceAction(p.reportId, item, reason);
                  if (!r.ok) return r;
                }
                setEvidence([]);
                return { ok: true, message: "Evidence added" };
              })
            }
          >
            Attach to report
          </button>
        </section>
      )}

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Internal notes</h2>
        <ul className="space-y-1 text-xs">
          {p.notes.length === 0 && <li className="text-muted">No notes on this user.</li>}
          {p.notes.map((n) => (
            <li key={n.id} className="rounded bg-bg p-2">
              <span className="text-muted">
                {n.author} · {n.at.slice(0, 10)}
              </span>
              <br />
              {n.body}
            </li>
          ))}
        </ul>
        <textarea
          className="input"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Visible to staff only"
        />
        <button
          className="btn w-full justify-center"
          disabled={pending || note.trim().length < 3}
          onClick={() =>
            run(async () => {
              const r = await addStaffNoteAction(p.accusedId, note, `/staff/reports/${p.reportId}`);
              if (r.ok) setNote("");
              return r;
            })
          }
        >
          Add note
        </button>
      </section>
    </>
  );
}

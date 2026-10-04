"use client";
import { useState, useTransition } from "react";
import type { StaffRole } from "@cod/shared";
import { addStaffNoteAction, issueSanctionAction } from "@/app/(site)/staff/actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";

export function UserStaffActions({
  userId,
  staffRole,
  notes,
}: {
  userId: string;
  staffRole: StaffRole;
  notes: { id: string; body: string; author: string; at: string }[];
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  const [reason, setReason] = useState("");
  const [type, setType] = useState<"WARNING" | "SUSPENSION" | "PERMANENT_BAN">("WARNING");
  const [days, setDays] = useState(7);
  const [note, setNote] = useState("");
  const canSuspend = staffRole !== "TRIAL_MODERATOR";
  const canBan = staffRole === "ADMIN" || staffRole === "FOUNDER";

  return (
    <div className="space-y-6">
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Internal notes</h2>
        <ul className="space-y-1 text-xs">
          {notes.length === 0 && <li className="text-muted">No notes.</li>}
          {notes.map((n) => (
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
          placeholder="e.g. warned about no-shows in March"
        />
        <button
          className="btn w-full justify-center"
          disabled={pending || note.trim().length < 3}
          onClick={() =>
            run(async () => {
              const r = await addStaffNoteAction(userId, note, `/staff/users/${userId}`);
              if (r.ok) setNote("");
              return r;
            })
          }
        >
          Add note
        </button>
      </section>
      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">Sanction</h2>
        <textarea
          className="input"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required, at least 10 characters)"
        />
        <select
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value as typeof type)}
        >
          <option value="WARNING">Warning</option>
          {canSuspend && <option value="SUSPENSION">Temporary suspension</option>}
          {canBan && <option value="PERMANENT_BAN">Permanent ban</option>}
        </select>
        {type === "SUSPENSION" && (
          <input
            type="number"
            min={1}
            max={365}
            className="input"
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          />
        )}
        <button
          className="btn btn-danger w-full justify-center"
          disabled={pending || reason.length < 10}
          onClick={() =>
            confirm(`Issue a ${type.toLowerCase().replace("_", " ")}?`) &&
            run(() =>
              issueSanctionAction({
                userId,
                type,
                reason,
                days: type === "SUSPENSION" ? days : undefined,
              }),
            )
          }
        >
          Issue {type.toLowerCase().replace("_", " ")}
        </button>
        <FormMessage
          error={result && !result.ok ? result.error : null}
          ok={result?.ok ? result.message : null}
        />
      </section>
    </div>
  );
}

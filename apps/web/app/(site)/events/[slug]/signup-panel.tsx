"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { checkInAction, signUpAction, withdrawAction } from "./actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";
import { label } from "@/lib/format";

interface Props {
  eventId: string;
  status: string;
  signedIn: boolean;
  isHoster: boolean;
  mine: { id: string; status: string; waitlistPosition: number | null } | null;
  confirmed: number;
  cap: number;
  waitlisted: number;
}

export function SignupPanel(p: Props) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setResult(await fn()));
  const open = p.status === "OPEN" || p.status === "CHECK_IN";

  return (
    <section className="card">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Sign-up</h2>
        <span className="text-sm text-muted">
          {p.confirmed}/{p.cap} paid · {p.waitlisted} waiting
        </span>
      </div>

      {p.isHoster ? (
        <Link
          href={`/dashboard/events/${p.eventId}`}
          className="btn btn-primary w-full justify-center"
        >
          Manage this event
        </Link>
      ) : !p.signedIn ? (
        <Link href="/sign-in" className="btn btn-primary w-full justify-center">
          Sign in to enter
        </Link>
      ) : p.mine && !["WITHDRAWN", "REMOVED"].includes(p.mine.status) ? (
        <div className="space-y-2 text-sm">
          <p>
            Your status: <span className="font-medium">{label(p.mine.status)}</span>
            {p.mine.status === "WAITLISTED" && p.mine.waitlistPosition && (
              <span className="text-muted"> (#{p.mine.waitlistPosition})</span>
            )}
          </p>
          {p.mine.status === "WAITLISTED" && (
            <p className="text-muted">
              Pay the hoster to confirm your spot. They will mark you as paid.
            </p>
          )}
          {p.mine.status === "CONFIRMED" && p.status === "CHECK_IN" && (
            <button
              className="btn btn-primary w-full justify-center"
              disabled={pending}
              onClick={() => run(() => checkInAction(p.mine!.id, p.eventId))}
            >
              Check in now
            </button>
          )}
          {p.mine.status === "CONFIRMED" && p.status === "OPEN" && (
            <p className="text-muted">
              You&apos;re confirmed. Check-in opens before the event starts.
            </p>
          )}
          {["WAITLISTED", "CONFIRMED", "CHECKED_IN"].includes(p.mine.status) &&
            p.status !== "LIVE" && (
              <button
                className="btn btn-danger w-full justify-center"
                disabled={pending}
                onClick={() => run(() => withdrawAction(p.mine!.id, p.eventId))}
              >
                Withdraw
              </button>
            )}
        </div>
      ) : open ? (
        <button
          className="btn btn-primary w-full justify-center"
          disabled={pending}
          onClick={() => run(() => signUpAction(p.eventId))}
        >
          {p.confirmed >= p.cap ? "Join the waitlist" : "Sign up"}
        </button>
      ) : (
        <p className="text-sm text-muted">Sign-ups are closed.</p>
      )}
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? result.message : null}
      />
    </section>
  );
}

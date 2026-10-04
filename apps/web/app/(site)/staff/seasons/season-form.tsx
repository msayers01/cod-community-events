"use client";
import { useActionState } from "react";
import { createSeasonAction } from "./actions";
import { FormMessage } from "@/components/form-message";
import { useClientValue } from "@/lib/use-client-value";

export function SeasonForm() {
  const [result, action, pending] = useActionState(createSeasonAction, null);
  const tz = useClientValue(() => String(new Date().getTimezoneOffset()), "0");
  return (
    <form action={action} className="card space-y-3 text-sm">
      <input type="hidden" name="tzOffsetMinutes" value={tz} />
      <div>
        <label className="label" htmlFor="name">
          Name
        </label>
        <input id="name" name="name" className="input" placeholder="Season 1" required />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="startsAt">
            Starts
          </label>
          <input id="startsAt" name="startsAt" type="datetime-local" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="endsAt">
            Ends
          </label>
          <input id="endsAt" name="endsAt" type="datetime-local" className="input" required />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="reason">
          Reason (logged)
        </label>
        <input id="reason" name="reason" className="input" minLength={10} required />
      </div>
      <FormMessage
        error={result && !result.ok ? result.error : null}
        ok={result?.ok ? result.message : null}
      />
      <button className="btn btn-primary" disabled={pending}>
        Create season
      </button>
    </form>
  );
}

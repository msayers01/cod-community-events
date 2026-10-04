"use client";
import { useActionState, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";
import { EntryType, GameMode, Platform, Region } from "@cod/shared";
import { createEventAction } from "@/app/(site)/dashboard/actions";
import { FormMessage } from "@/components/form-message";
import { label } from "@/lib/format";

export function NewEventForm() {
  const [result, action, pending] = useActionState(createEventAction, null);
  const [format, setFormat] = useState("SWITCHEROO");
  const [entryType, setEntryType] = useState("OPEN");
  const tz = useClientValue(() => String(new Date().getTimezoneOffset()), "0");

  return (
    <form action={action} className="card mt-6 space-y-4">
      <input type="hidden" name="tzOffsetMinutes" value={tz} />
      <Field label="Title" name="title" required placeholder="Friday Night SnD Switcheroo" />
      <div>
        <label className="label" htmlFor="description">
          Description
        </label>
        <textarea id="description" name="description" className="input" rows={4} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Mode" name="mode" options={Object.values(GameMode)} />
        <SelectField
          label="Format"
          name="format"
          options={["SWITCHEROO", "STANDARD"]}
          onChange={setFormat}
        />
        <Field
          label="Team size"
          name="teamSize"
          type="number"
          defaultValue="4"
          min={1}
          max={6}
          required
        />
        {format === "SWITCHEROO" && (
          <Field
            label="Rounds"
            name="roundCount"
            type="number"
            defaultValue="3"
            min={1}
            max={20}
            required
          />
        )}
        <Field
          label="Player cap"
          name="playerCap"
          type="number"
          defaultValue="16"
          min={2}
          max={256}
          required
        />
        <Field
          label="Entry fee (USD, 0 = free)"
          name="entryFee"
          type="number"
          step="0.01"
          defaultValue="10"
          min={0}
        />
        <Field label="Payout split (%, 1st/2nd/...)" name="payoutSplit" defaultValue="70/30" />
        <SelectField label="Region" name="region" options={Object.values(Region)} />
        <SelectField
          label="Platform"
          name="platform"
          options={Object.values(Platform)}
          defaultValue="CROSSPLAY"
        />
        <SelectField
          label="Entry"
          name="entryType"
          options={Object.values(EntryType)}
          onChange={setEntryType}
        />
        {entryType === "REQUIREMENT_BASED" && (
          <Field
            label="Min completed events"
            name="minCompletedEvents"
            type="number"
            defaultValue="3"
            min={0}
          />
        )}
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Check-in opens" name="checkInOpensAt" type="datetime-local" required />
        <Field label="Check-in closes" name="checkInClosesAt" type="datetime-local" required />
        <Field label="Starts" name="startsAt" type="datetime-local" required />
      </div>
      <Field
        label="Map pool (comma separated)"
        name="mapPool"
        placeholder="Hacienda, Red Card, Vault"
      />
      <Field label="Banned items (comma separated)" name="bannedItems" />
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="streamingRequired" /> Streaming required
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="monicamOnRequest" defaultChecked /> Monicam on request
        </label>
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Extra rules
        </label>
        <textarea id="notes" name="notes" className="input" rows={3} />
      </div>
      <FormMessage error={result && !result.ok ? result.error : null} />
      <button className="btn btn-primary" disabled={pending}>
        Save as draft
      </button>
    </form>
  );
}

function Field({
  label: l,
  name,
  ...rest
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; name: string }) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {l}
      </label>
      <input id={name} name={name} className="input" {...rest} />
    </div>
  );
}

function SelectField({
  label: l,
  name,
  options,
  defaultValue,
  onChange,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {l}
      </label>
      <select
        id={name}
        name={name}
        className="input"
        defaultValue={defaultValue ?? options[0]}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

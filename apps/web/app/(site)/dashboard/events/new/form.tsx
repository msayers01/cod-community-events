"use client";
import { useActionState, useState } from "react";
import { useClientValue } from "@/lib/use-client-value";
import {
  EntryType,
  Game,
  GameMode,
  Platform,
  RandomizationMode,
  Region,
  type EventTemplateSettings,
} from "@cod/shared";
import { createEventAction } from "@/app/(site)/dashboard/actions";
import { FormMessage } from "@/components/form-message";
import { label } from "@/lib/format";

export function NewEventForm({ template }: { template: EventTemplateSettings | null }) {
  const [result, action, pending] = useActionState(createEventAction, null);
  const t = template;
  const [format, setFormat] = useState<string>(t?.format ?? "SWITCHEROO");
  const [entryType, setEntryType] = useState<string>(t?.entryType ?? "OPEN");
  const [randomization, setRandomization] = useState<string>(t?.randomization ?? "RANDOM");
  const tz = useClientValue(() => String(new Date().getTimezoneOffset()), "0");

  return (
    <form action={action} className="card mt-6 space-y-4">
      <input type="hidden" name="tzOffsetMinutes" value={tz} />
      <Field label="Title" name="title" required placeholder="Friday Night SnD Switcheroo" />
      <div>
        <label className="label" htmlFor="description">
          Description
        </label>
        <textarea
          id="description"
          name="description"
          className="input"
          rows={4}
          defaultValue={t?.description ?? ""}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label="Mode"
          name="mode"
          options={Object.values(GameMode)}
          defaultValue={t?.mode}
        />
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
        <Field
          label="Payout split (%, 1st/2nd/...)"
          name="payoutSplit"
          defaultValue={t ? t.payoutSplit.map((p) => p.percent).join("/") : "70/30"}
        />
        <SelectField
          label="Game"
          name="game"
          options={Object.values(Game)}
          defaultValue={t?.game ?? undefined}
          optional
        />
        <SelectField
          label="Region"
          name="region"
          options={Object.values(Region)}
          defaultValue={t?.region}
        />
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
        <div>
          <SelectField
            label="Team formation"
            name="randomization"
            options={Object.values(RandomizationMode)}
            defaultValue={t?.randomization}
            onChange={setRandomization}
          />
          <p className="mt-1 text-xs text-muted">{RANDOMIZATION_HELP[randomization]}</p>
        </div>
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
      <Field
        label="Banned items (comma separated)"
        name="bannedItems"
        defaultValue={t?.rules.bannedItems.join(", ")}
      />
      <div className="flex gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="streamingRequired"
            defaultChecked={t?.rules.streamingRequired ?? false}
          />{" "}
          Streaming required
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="monicamOnRequest"
            defaultChecked={t?.rules.monicamOnRequest ?? true}
          />{" "}
          Monicam on request
        </label>
      </div>
      <div>
        <label className="label" htmlFor="notes">
          Extra rules
        </label>
        <textarea
          id="notes"
          name="notes"
          className="input"
          rows={3}
          defaultValue={t?.rules.notes ?? ""}
        />
      </div>
      <FormMessage error={result && !result.ok ? result.error : null} />
      <button className="btn btn-primary" disabled={pending}>
        Save as draft
      </button>
    </form>
  );
}

const RANDOMIZATION_HELP: Record<string, string> = {
  RANDOM: "Fully random spin. The default, and what most players expect.",
  SKILL_BALANCED:
    "Still a provably fair spin, but players are spread across teams by verified rating so no team stacks the strongest players. Ratings are published with each spin.",
  NO_REPEAT_TEAMMATES:
    "Still a provably fair spin, but swaps are made so players are not paired with the same teammates from earlier rounds when avoidable.",
};

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
  optional,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  onChange?: (v: string) => void;
  /** Adds a leading "Not specified" choice that submits an empty value. */
  optional?: boolean;
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
        defaultValue={defaultValue ?? (optional ? "" : options[0])}
        onChange={(e) => onChange?.(e.target.value)}
      >
        {optional && <option value="">Not specified</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </div>
  );
}

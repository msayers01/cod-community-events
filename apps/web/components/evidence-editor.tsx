"use client";
import { useState } from "react";
import type { EvidenceInput } from "@/app/(site)/report/actions";
import { uploadFile } from "@/lib/upload-client";

const TYPES: EvidenceInput["type"][] = ["SCREENSHOT", "VOD", "PAYMENT_RECORD", "OTHER"];
const TYPE_LABEL: Record<EvidenceInput["type"], string> = {
  SCREENSHOT: "Screenshot",
  VOD: "VOD / clip",
  PAYMENT_RECORD: "Payment record",
  OTHER: "Other",
};

/** Collects evidence items as links, or as private uploads when storage is configured. */
export function EvidenceEditor({
  value,
  onChange,
  uploads,
}: {
  value: EvidenceInput[];
  onChange: (v: EvidenceInput[]) => void;
  uploads: boolean;
}) {
  const [type, setType] = useState<EvidenceInput["type"]>("SCREENSHOT");
  const [url, setUrl] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = (item: EvidenceInput) => {
    onChange([...value, item]);
    setUrl("");
    setNote("");
    setError(null);
  };

  return (
    <div className="space-y-2">
      <ul className="space-y-1">
        {value.map((e, i) => (
          <li key={i} className="flex items-center justify-between rounded bg-bg px-2 py-1 text-xs">
            <span>
              <span className="text-accent">{TYPE_LABEL[e.type]}</span> · {e.url ?? `uploaded file`}
              {e.note && ` · ${e.note}`}
            </span>
            <button
              type="button"
              className="text-muted hover:text-warn"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              remove
            </button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 sm:grid-cols-[140px_1fr]">
        <select
          className="input"
          value={type}
          onChange={(e) => setType(e.target.value as EvidenceInput["type"])}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </select>
        <input
          className="input"
          placeholder="https://… (Twitch clip, VOD with timestamp, image host)"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </div>
      <input
        className="input"
        placeholder="Note (optional, e.g. timestamp 1:23:45)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn"
          disabled={!/^https?:\/\//.test(url)}
          onClick={() => add({ type, url, note })}
        >
          Add link
        </button>
        {uploads && (
          <label className="btn cursor-pointer">
            {busy ? "Uploading…" : "Upload file"}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,video/mp4"
              className="hidden"
              disabled={busy}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                setBusy(true);
                try {
                  const key = await uploadFile(file);
                  add({ type, storageKey: key, note });
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                } finally {
                  setBusy(false);
                  e.target.value = "";
                }
              }}
            />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-warn">{error}</p>}
    </div>
  );
}

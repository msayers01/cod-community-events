"use client";
import { useState, useTransition } from "react";
import { submitResultAction } from "@/app/(site)/confirmations/actions";
import type { ActionResult } from "@/lib/actions";
import { FormMessage } from "@/components/form-message";
import { uploadFile } from "@/lib/upload-client";

type U = { id: string; displayName: string };
type Row = { kills: string; deaths: string; plants: string; defuses: string; hill: string };

export function SubmitResultForm({
  matchId,
  eventSlug,
  mode,
  teamA,
  teamB,
  uploads,
}: {
  matchId: string;
  eventSlug: string;
  mode: string;
  teamA: U[];
  teamB: U[];
  uploads: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [scoreA, setScoreA] = useState("");
  const [scoreB, setScoreB] = useState("");
  const [url, setUrl] = useState("");
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const players = [...teamA, ...teamB];
  const row = (id: string): Row =>
    rows[id] ?? { kills: "", deaths: "", plants: "", defuses: "", hill: "" };
  const set = (id: string, k: keyof Row, v: string) =>
    setRows({ ...rows, [id]: { ...row(id), [k]: v } });

  if (result?.ok) return <FormMessage ok={result.message} />;
  if (!open)
    return (
      <button className="btn mt-2" onClick={() => setOpen(true)}>
        Submit result
      </button>
    );

  const submit = () =>
    start(async () => {
      const num = (v: string) => (v === "" ? undefined : Number(v));
      const stats = players
        .filter((p) => row(p.id).kills !== "" || row(p.id).deaths !== "")
        .map((p) => ({
          playerId: p.id,
          kills: Number(row(p.id).kills || 0),
          deaths: Number(row(p.id).deaths || 0),
          ...(mode === "SND"
            ? { plants: num(row(p.id).plants), defuses: num(row(p.id).defuses) }
            : { hillTimeSeconds: num(row(p.id).hill) }),
        }));
      setResult(
        await submitResultAction({
          matchId,
          eventSlug,
          screenshotUrl: url || undefined,
          screenshotKey: key ?? undefined,
          scoreA: Number(scoreA),
          scoreB: Number(scoreB),
          stats,
        }),
      );
    });

  return (
    <div className="mt-3 space-y-3 rounded bg-bg p-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs">
          <span className="label">Team A rounds</span>
          <input
            className="input"
            type="number"
            min={0}
            value={scoreA}
            onChange={(e) => setScoreA(e.target.value)}
          />
        </label>
        <label className="text-xs">
          <span className="label">Team B rounds</span>
          <input
            className="input"
            type="number"
            min={0}
            value={scoreB}
            onChange={(e) => setScoreB(e.target.value)}
          />
        </label>
      </div>
      <div>
        <span className="label">Scoreboard screenshot (required)</span>
        <div className="flex flex-wrap gap-2">
          <input
            className="input flex-1"
            placeholder="https://… image link"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!!key}
          />
          {uploads && (
            <label className="btn cursor-pointer">
              {busy ? "Uploading…" : key ? "Uploaded ✓" : "Upload"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setBusy(true);
                  try {
                    setKey(await uploadFile(f));
                  } catch (err) {
                    setResult({
                      ok: false,
                      error: err instanceof Error ? err.message : "Upload failed",
                    });
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </label>
          )}
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-muted">
          Per-player stats (optional, from the screenshot)
        </summary>
        <table className="mt-2 w-full text-xs">
          <thead className="text-left text-muted">
            <tr>
              <th>Player</th>
              <th>K</th>
              <th>D</th>
              {mode === "SND" ? (
                <>
                  <th>Plants</th>
                  <th>Defuses</th>
                </>
              ) : (
                <th>Hill (s)</th>
              )}
            </tr>
          </thead>
          <tbody>
            {players.map((p) => (
              <tr key={p.id}>
                <td className="py-1 pr-2">{p.displayName}</td>
                <td>
                  <input
                    className="input w-16"
                    type="number"
                    min={0}
                    value={row(p.id).kills}
                    onChange={(e) => set(p.id, "kills", e.target.value)}
                  />
                </td>
                <td>
                  <input
                    className="input w-16"
                    type="number"
                    min={0}
                    value={row(p.id).deaths}
                    onChange={(e) => set(p.id, "deaths", e.target.value)}
                  />
                </td>
                {mode === "SND" ? (
                  <>
                    <td>
                      <input
                        className="input w-16"
                        type="number"
                        min={0}
                        value={row(p.id).plants}
                        onChange={(e) => set(p.id, "plants", e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        className="input w-16"
                        type="number"
                        min={0}
                        value={row(p.id).defuses}
                        onChange={(e) => set(p.id, "defuses", e.target.value)}
                      />
                    </td>
                  </>
                ) : (
                  <td>
                    <input
                      className="input w-20"
                      type="number"
                      min={0}
                      value={row(p.id).hill}
                      onChange={(e) => set(p.id, "hill", e.target.value)}
                    />
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <div className="flex gap-2">
        <button
          className="btn btn-primary"
          disabled={pending || scoreA === "" || scoreB === "" || (!url && !key)}
          onClick={submit}
        >
          Submit
        </button>
        <button className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <FormMessage error={result && !result.ok ? result.error : null} />
    </div>
  );
}

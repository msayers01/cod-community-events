"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { FormMessage } from "@/components/form-message";

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];
const PREVIEW_PX = 160;

export function AvatarUploader({
  user,
}: {
  user: { id: string; displayName: string; avatarUpdatedAt: Date | string | null };
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const latest = useRef(0);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const choose = async (file: File | undefined) => {
    const mine = ++latest.current;
    setError(null);
    setOk(null);
    setPreview(false);
    if (!file) return;
    if (!TYPES.includes(file.type)) return setError("Use a PNG, JPEG or WebP image");
    if (file.size > MAX_BYTES) return setError("That image is over 5 MB");
    try {
      // Decode in the browser and draw the same centered square crop the server will make.
      // Drawing to a canvas (instead of pointing an <img> at a blob URL) also proves the file is
      // a real image before anything is uploaded.
      const bitmap = await createImageBitmap(file);
      if (mine !== latest.current) return bitmap.close();
      const side = Math.min(bitmap.width, bitmap.height);
      const ctx = canvas.current?.getContext("2d");
      if (!ctx) return bitmap.close();
      ctx.clearRect(0, 0, PREVIEW_PX, PREVIEW_PX);
      ctx.drawImage(
        bitmap,
        (bitmap.width - side) / 2,
        (bitmap.height - side) / 2,
        side,
        side,
        0,
        0,
        PREVIEW_PX,
        PREVIEW_PX,
      );
      bitmap.close();
      setPreview(true);
    } catch {
      if (mine === latest.current) setError("That file isn't a readable PNG, JPEG or WebP image");
    }
  };

  const call = async (method: "POST" | "DELETE", body?: FormData) => {
    setBusy(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch("/api/avatars", { method, body });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(json.error ?? "Something went wrong");
      setOk(method === "POST" ? "Profile picture updated" : "Profile picture removed");
      setPreview(false);
      if (input.current) input.current.value = "";
      router.refresh();
    } catch {
      setError("Couldn't reach the server");
    } finally {
      setBusy(false);
    }
  };

  const upload = () => {
    const file = input.current?.files?.[0];
    if (!file) return;
    const form = new FormData();
    form.set("file", file);
    void call("POST", form);
  };

  return (
    <section className="card mt-6 flex flex-wrap items-center gap-4 text-sm">
      <canvas
        ref={canvas}
        width={PREVIEW_PX}
        height={PREVIEW_PX}
        role="img"
        aria-label="Preview of your new picture"
        hidden={!preview}
        className="h-20 w-20 rounded-full border border-line"
      />
      {!preview && <Avatar user={user} size={80} />}
      <div className="min-w-0 flex-1 space-y-2">
        <h2 className="font-semibold">Profile picture</h2>
        <p className="text-xs text-muted">
          PNG, JPEG or WebP up to 5 MB. It&apos;s cropped to a square, shrunk to 256 px and
          re-saved, which also strips any hidden data such as location. Your picture is public.
        </p>
        <input
          ref={input}
          type="file"
          accept={TYPES.join(",")}
          aria-label="Choose a profile picture"
          className="block w-full text-xs file:mr-3 file:rounded file:border file:border-line file:bg-panel file:px-3 file:py-1.5 file:text-ink"
          onChange={(e) => void choose(e.target.files?.[0])}
        />
        <div className="flex gap-2">
          <button className="btn btn-primary" disabled={busy || !preview} onClick={upload}>
            {busy ? "Saving…" : "Save picture"}
          </button>
          {user.avatarUpdatedAt && (
            <button className="btn" disabled={busy} onClick={() => void call("DELETE")}>
              Remove
            </button>
          )}
        </div>
        <FormMessage error={error} ok={ok} />
      </div>
    </section>
  );
}

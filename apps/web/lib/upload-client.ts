"use client";

/** Uploads a file straight to private storage via a pre-signed URL. Returns the object key. */
export async function uploadFile(file: File): Promise<string> {
  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ contentType: file.type, size: file.size }),
  });
  if (!res.ok)
    throw new Error((await res.json().catch(() => ({}))).error ?? "Could not start upload");
  const { url, key } = (await res.json()) as { url: string; key: string };
  const put = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "content-type": file.type },
  });
  if (!put.ok) throw new Error("Upload failed");
  return key;
}

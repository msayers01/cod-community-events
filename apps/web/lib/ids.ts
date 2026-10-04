import { randomBytes, randomInt } from "node:crypto";

const JOIN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I

export function newJoinCode(length = 7): string {
  let s = "";
  for (let i = 0; i < length; i++) s += JOIN_ALPHABET[randomInt(JOIN_ALPHABET.length)];
  return s;
}

export function newOverlayKey(): string {
  return randomBytes(24).toString("base64url");
}

export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "event"}-${randomBytes(3).toString("hex")}`;
}

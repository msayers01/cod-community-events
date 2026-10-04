import sharp from "sharp";
import { prisma } from "@cod/db";
import { hasPermission, type Actor } from "@cod/shared";
import { DomainError, ForbiddenError, NotFoundError } from "@/lib/errors";
import { logStaffAction } from "@/modules/moderation/audit";

/**
 * Profile pictures. Every upload is decoded and re-encoded to a 256x256 WebP, which
 * strips metadata (location EXIF etc.), neutralises polyglot files and keeps rows tiny.
 * Only this module writes the avatar table and `User.avatarUpdatedAt`.
 */

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
export const AVATAR_SIZE = 256;
const ACCEPTED = new Set(["jpeg", "png", "webp"]);
/** Refuses decompression bombs: a small file that expands to a huge bitmap. */
const MAX_INPUT_PIXELS = 40_000_000;

/** Turn an uploaded image into the stored avatar, or explain why it can't be used. */
export async function normalizeAvatar(input: Buffer): Promise<Buffer> {
  if (input.length === 0) throw new DomainError("AVATAR_EMPTY", "Choose an image first");
  if (input.length > MAX_AVATAR_BYTES)
    throw new DomainError("AVATAR_TOO_LARGE", "That image is over 5 MB");
  try {
    const img = sharp(input, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" });
    const meta = await img.metadata();
    if (!meta.format || !ACCEPTED.has(meta.format))
      throw new DomainError("AVATAR_TYPE", "Use a PNG, JPEG or WebP image");
    return await img
      .rotate() // honour the camera's orientation, then drop the tag
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "attention" })
      .webp({ quality: 82 })
      .toBuffer();
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(
      "AVATAR_UNREADABLE",
      "That file isn't a readable PNG, JPEG or WebP image",
    );
  }
}

export async function setAvatar(actor: Actor, upload: Buffer) {
  const data = await normalizeAvatar(upload);
  const now = new Date();
  await prisma.$transaction([
    prisma.userAvatar.upsert({
      where: { userId: actor.userId },
      update: { data: new Uint8Array(data), contentType: "image/webp" },
      create: { userId: actor.userId, data: new Uint8Array(data) },
    }),
    prisma.user.update({ where: { id: actor.userId }, data: { avatarUpdatedAt: now } }),
  ]);
  return { avatarUpdatedAt: now, bytes: data.length };
}

/** Remove your own picture. */
export async function removeOwnAvatar(actor: Actor) {
  await prisma.$transaction([
    prisma.userAvatar.deleteMany({ where: { userId: actor.userId } }),
    prisma.user.update({ where: { id: actor.userId }, data: { avatarUpdatedAt: null } }),
  ]);
}

/** Staff take down a picture that breaks the rules. Logged with a reason in the append-only log. */
export async function removeAvatarAsStaff(actor: Actor, userId: string, reason: string) {
  if (!hasPermission(actor, "content.remove")) throw new ForbiddenError();
  if (reason.trim().length < 10)
    throw new DomainError("REASON_REQUIRED", "Give a reason of at least 10 characters");
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundError("User");
    const { count } = await tx.userAvatar.deleteMany({ where: { userId } });
    if (count === 0) throw new DomainError("NO_AVATAR", "This user has no profile picture");
    await tx.user.update({ where: { id: userId }, data: { avatarUpdatedAt: null } });
    await logStaffAction(tx, {
      staffUserId: actor.userId,
      action: "avatar.removed",
      targetType: "user",
      targetId: userId,
      reason,
    });
  });
}

export async function getAvatar(userId: string) {
  const row = await prisma.userAvatar.findUnique({ where: { userId } });
  return row
    ? { data: Buffer.from(row.data), contentType: row.contentType, updatedAt: row.updatedAt }
    : null;
}

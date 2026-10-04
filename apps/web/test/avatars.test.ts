import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@cod/db";
import {
  AVATAR_SIZE,
  getAvatar,
  normalizeAvatar,
  removeAvatarAsStaff,
  removeOwnAvatar,
  setAvatar,
} from "@/modules/identity/avatars";
import { GET } from "@/app/api/avatars/[id]/route";
import { initialsOf } from "@/components/avatar";
import { cleanup, makeStaff, makeUser } from "./setup";

afterAll(cleanup);

const actorOf = (id: string) => ({ userId: id, staffRole: null, isHoster: false });
const solid = (w: number, h: number, format: "png" | "jpeg" | "webp" | "gif" = "png") =>
  sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } })
    [format]()
    .toBuffer();

describe("normalising uploads", () => {
  it("crops to a 256px square WebP, whatever the input shape or format", async () => {
    for (const [w, h, f] of [
      [1200, 400, "png"],
      [300, 900, "jpeg"],
      [64, 64, "webp"],
    ] as const) {
      const out = await normalizeAvatar(await solid(w, h, f));
      const meta = await sharp(out).metadata();
      expect([meta.format, meta.width, meta.height]).toEqual(["webp", AVATAR_SIZE, AVATAR_SIZE]);
      expect(out.length).toBeLessThan(40_000);
    }
  });

  it("strips hidden metadata such as EXIF location and copyright", async () => {
    const withExif = await sharp(await solid(400, 400, "jpeg"))
      .withExif({ IFD0: { Copyright: "secret-owner", Artist: "someone@example.com" } })
      .jpeg()
      .toBuffer();
    expect((await sharp(withExif).metadata()).exif).toBeDefined();
    const out = await normalizeAvatar(withExif);
    expect((await sharp(out).metadata()).exif).toBeUndefined();
    expect(out.toString("latin1")).not.toContain("secret-owner");
  });

  it("applies camera orientation before dropping it", async () => {
    // 400x200 stored sideways with orientation 6 displays as 200x400; either way we end square.
    const rotated = await sharp(await solid(400, 200, "jpeg"))
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer();
    const meta = await sharp(await normalizeAvatar(rotated)).metadata();
    expect([meta.width, meta.height, meta.orientation]).toEqual([
      AVATAR_SIZE,
      AVATAR_SIZE,
      undefined,
    ]);
  });

  it("rejects things that are not a PNG, JPEG or WebP image", async () => {
    await expect(normalizeAvatar(await solid(50, 50, "gif"))).rejects.toThrow(/PNG, JPEG or WebP/);
    await expect(
      normalizeAvatar(
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'),
      ),
    ).rejects.toThrow(/readable|PNG/);
    await expect(normalizeAvatar(Buffer.from("MZ not an image at all"))).rejects.toThrow(
      /readable/,
    );
    await expect(normalizeAvatar(Buffer.alloc(0))).rejects.toThrow(/Choose an image/);
  });

  it("rejects oversized files and decompression bombs", async () => {
    await expect(normalizeAvatar(Buffer.alloc(5 * 1024 * 1024 + 1))).rejects.toThrow(/5 MB/);
    // Tiny on disk, ~49 megapixels once decoded.
    const bomb = await solid(7000, 7000, "png");
    expect(bomb.length).toBeLessThan(5 * 1024 * 1024);
    await expect(normalizeAvatar(bomb)).rejects.toThrow(/readable/);
  });
});

describe("saving, replacing and removing", () => {
  it("stores one picture per user and versions it", async () => {
    const u = await makeUser("av");
    expect(await getAvatar(u.id)).toBeNull();
    const first = await setAvatar(actorOf(u.id), await solid(500, 500));
    const stored = await getAvatar(u.id);
    expect(stored?.contentType).toBe("image/webp");
    expect((await sharp(stored!.data).metadata()).width).toBe(AVATAR_SIZE);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).avatarUpdatedAt).toEqual(
      first.avatarUpdatedAt,
    );

    await new Promise((r) => setTimeout(r, 5));
    const second = await setAvatar(actorOf(u.id), await solid(300, 300, "jpeg"));
    expect(second.avatarUpdatedAt.getTime()).toBeGreaterThan(first.avatarUpdatedAt.getTime());
    expect(await prisma.userAvatar.count({ where: { userId: u.id } })).toBe(1);

    await removeOwnAvatar(actorOf(u.id));
    expect(await getAvatar(u.id)).toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).avatarUpdatedAt,
    ).toBeNull();
  });

  it("a rejected upload leaves the existing picture untouched", async () => {
    const u = await makeUser("av");
    await setAvatar(actorOf(u.id), await solid(300, 300));
    const before = await getAvatar(u.id);
    await expect(setAvatar(actorOf(u.id), Buffer.from("junk"))).rejects.toThrow();
    expect((await getAvatar(u.id))!.data.equals(before!.data)).toBe(true);
  });

  it("staff can take a picture down with a logged reason; players and trial-less roles cannot", async () => {
    const u = await makeUser("av");
    await setAvatar(actorOf(u.id), await solid(300, 300));
    const mod = await makeStaff("TRIAL_MODERATOR");
    await expect(
      removeAvatarAsStaff(actorOf(u.id), u.id, "removing my own the hard way"),
    ).rejects.toThrow(/not allowed/);
    await expect(removeAvatarAsStaff(mod.actor, u.id, "short")).rejects.toThrow(/reason/i);
    await removeAvatarAsStaff(mod.actor, u.id, "Picture breaks the content rules");
    expect(await getAvatar(u.id)).toBeNull();
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).avatarUpdatedAt,
    ).toBeNull();
    const log = await prisma.staffActionLog.findFirst({
      where: { targetType: "user", targetId: u.id, action: "avatar.removed" },
    });
    expect(log?.reason).toBe("Picture breaks the content rules");
    await expect(
      removeAvatarAsStaff(mod.actor, u.id, "Nothing left to remove here"),
    ).rejects.toThrow(/no profile picture/);
  });
});

describe("serving", () => {
  const call = (id: string, qs = "", headers: Record<string, string> = {}) =>
    GET(new Request(`http://localhost/api/avatars/${id}${qs}`, { headers }), {
      params: Promise.resolve({ id }),
    });

  it("serves the picture with safe, cacheable headers and honours ETags", async () => {
    const u = await makeUser("av");
    await setAvatar(actorOf(u.id), await solid(300, 300));

    const res = await call(u.id);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect((await sharp(Buffer.from(await res.arrayBuffer())).metadata()).width).toBe(AVATAR_SIZE);

    const versioned = await call(u.id, "?v=123");
    expect(versioned.headers.get("cache-control")).toContain("immutable");

    const etag = res.headers.get("etag")!;
    expect((await call(u.id, "", { "if-none-match": etag })).status).toBe(304);
  });

  it("404s for users without a picture and for malformed ids", async () => {
    const u = await makeUser("av");
    expect((await call(u.id)).status).toBe(404);
    expect((await call("../../etc/passwd")).status).toBe(404);
  });
});

describe("fallback badge", () => {
  it("makes sensible initials, skipping clan tags", () => {
    expect(initialsOf("Mr Waternoos")).toBe("MW");
    expect(initialsOf("[avg]Kolton")).toBe("KO");
    expect(initialsOf("[+ZTC+]Mc-Puffa")).toBe("MP");
    expect(initialsOf("Snaz")).toBe("SN");
    expect(initialsOf("[]")).toBe("?");
    // Unbalanced brackets are kept, and hostile input can't make it slow.
    expect(initialsOf("[oops Snaz")).toBe("OS");
    const t = performance.now();
    initialsOf("[".repeat(200_000));
    expect(performance.now() - t).toBeLessThan(500);
  });
});

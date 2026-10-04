import sharp from "sharp";
import { expect, test } from "@playwright/test";
import { cleanup, makeHosterUser, makeUser, newTag, prisma, sessionFor } from "./helpers";

const tag = newTag();
const HOUR = 3_600_000;

async function makeEvent(hosterId: string, slugSuffix: string, extra: object = {}) {
  const now = Date.now();
  return prisma.event.create({
    data: {
      hosterId,
      title: `E2E ${slugSuffix} ${tag}`,
      slug: `e2e-${slugSuffix}-${tag}`,
      mode: "SND",
      format: "SWITCHEROO",
      teamSize: 2,
      roundCount: 1,
      playerCap: 4,
      payoutSplit: [{ place: 1, percent: 100 }],
      region: "EU",
      platform: "CROSSPLAY",
      rules: {},
      startsAt: new Date(now + 3 * HOUR),
      checkInOpensAt: new Date(now + HOUR),
      checkInClosesAt: new Date(now + 2 * HOUR),
      joinCode: `E${tag}${slugSuffix}`.toUpperCase().slice(0, 9),
      overlayKey: `e2e${tag}${slugSuffix}`,
      status: "OPEN",
      ...extra,
    },
  });
}

test.afterAll(async () => {
  await cleanup(tag);
});

test("the start time counts down live", async ({ browser }) => {
  const host = await makeHosterUser(`e2e-cd-host-${tag}`);
  const ev = await makeEvent(host.id, "countdown");
  const { context, page } = await sessionFor(browser, host.id);
  await page.goto(`/events/${ev.slug}`);
  const timer = page.getByRole("timer");
  await expect(timer).toContainText(/Starts in\s*0[23]:\d\d:\d\d/);
  const first = await timer.innerText();
  await expect.poll(async () => timer.innerText(), { timeout: 8000 }).not.toBe(first);
  await context.close();
});

test("started, cancelled and finished events say so", async ({ browser }) => {
  const host = await makeHosterUser(`e2e-st-host-${tag}`);
  const live = await makeEvent(host.id, "live", { status: "LIVE" });
  const done = await makeEvent(host.id, "done", { status: "COMPLETED" });
  const { context, page } = await sessionFor(browser, host.id);

  await page.goto(`/events/${live.slug}`);
  await expect(page.getByText("This event has started")).toBeVisible();
  await expect(page.getByRole("timer")).toHaveCount(0);

  await page.goto(`/events/${done.slug}`);
  await expect(page.getByText("This event has finished")).toBeVisible();
  await context.close();
});

test("a hoster can cancel an event and everyone sees the reason", async ({ browser }) => {
  const host = await makeHosterUser(`e2e-cx-host-${tag}`);
  const ev = await makeEvent(host.id, "cancel");
  const { context, page } = await sessionFor(browser, host.id);

  await page.goto(`/dashboard/events/${ev.id}`);
  await page.getByRole("button", { name: "Cancel event" }).click(); // answers the prompt with "E2E reason"
  await expect(page.getByText("This event was cancelled")).toBeVisible();

  const visitor = await browser.newContext({ baseURL: "http://localhost:3200" });
  const v = await visitor.newPage();
  await v.goto(`/events/${ev.slug}`);
  await expect(v.getByText("This event was cancelled")).toBeVisible();
  await expect(v.getByText("Reason: E2E reason")).toBeVisible();
  await expect(v.getByRole("timer")).toHaveCount(0);
  await expect(v.getByRole("button", { name: "Sign up" })).toHaveCount(0);
  // A cancelled event does not appear among upcoming events.
  await v.goto("/");
  await expect(v.getByRole("link", { name: new RegExp(`E2E cancel ${tag}`) })).toHaveCount(0);

  expect(await prisma.event.findUniqueOrThrow({ where: { id: ev.id } })).toMatchObject({
    status: "CANCELLED",
    cancelReason: "E2E reason",
  });
  await visitor.close();
  await context.close();
});

test("a player uploads, replaces and removes a profile picture", async ({ browser }) => {
  const user = await makeUser(`E2E Avatar ${tag}`);
  const { context, page } = await sessionFor(browser, user.id);
  await page.goto("/account");

  // A file that isn't an image is turned away in the browser, before any upload.
  await page.locator("input[type=file]").setInputFiles({
    name: "notes.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello"),
  });
  await expect(page.getByText("Use a PNG, JPEG or WebP image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save picture" })).toBeDisabled();

  // A real (non-square) photo is accepted, previewed, saved, cropped and shown in the nav.
  const photo = await sharp({
    create: { width: 900, height: 400, channels: 3, background: "#3a7" },
  })
    .png()
    .toBuffer();
  await page.locator("input[type=file]").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: photo,
  });
  await expect(page.getByRole("img", { name: "Preview of your new picture" })).toBeVisible();
  // The preview really drew the chosen image (the test photo is green), not a blank canvas.
  const [r, g, b] = await page
    .getByRole("img", { name: "Preview of your new picture" })
    .evaluate((c) =>
      Array.from((c as HTMLCanvasElement).getContext("2d")!.getImageData(80, 80, 1, 1).data),
    );
  expect(g).toBeGreaterThan(r! + 50);
  expect(g).toBeGreaterThan(b! + 30);
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByText("Profile picture updated")).toBeVisible();

  const nav = page.locator("header img[src^='/api/avatars/']");
  await expect(nav).toBeVisible();
  const src = await nav.getAttribute("src");
  const served = await page.request.get(src!);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/webp");
  const meta = await sharp(await served.body()).metadata();
  expect([meta.width, meta.height]).toEqual([256, 256]);

  // The public profile shows it too.
  await page.goto(`/u/${encodeURIComponent(user.displayName)}`);
  await expect(page.locator("main img[src^='/api/avatars/']")).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Profile picture removed")).toBeVisible();
  await expect(page.locator("header img[src^='/api/avatars/']")).toHaveCount(0);
  expect((await page.request.get(src!)).status()).toBe(404);
  await context.close();
});

test("pages are closed to people who shouldn't see them", async ({ browser }) => {
  const player = await makeUser(`E2E Plain ${tag}`);
  const anon = await browser.newContext({ baseURL: "http://localhost:3200" });
  const a = await anon.newPage();
  for (const path of ["/dashboard", "/account", "/confirmations", "/payouts"]) {
    await a.goto(path);
    await expect(a, path).toHaveURL(/\/sign-in/);
  }
  await a.goto("/staff");
  await expect(a).toHaveURL(/\/sign-in/);
  // Uploads need a session too.
  const res = await a.request.post("/api/avatars", {
    multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("x") } },
  });
  expect(res.status()).toBe(401);
  await anon.close();

  const { context, page } = await sessionFor(browser, player.id);
  await page.goto("/staff");
  await expect(page).not.toHaveURL(/\/staff/);
  await page.goto("/staff/flags");
  await expect(page).not.toHaveURL(/\/staff/);
  await page.goto("/dashboard/events/new");
  await expect(page.getByRole("heading", { name: /hoster|become|register/i })).toBeVisible();
  await context.close();
});

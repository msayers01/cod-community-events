import { randomBytes } from "node:crypto";
import type { Browser, BrowserContext, Page } from "@playwright/test";
import { loadRootEnv, prisma } from "@cod/db";

loadRootEnv();

export { prisma };
export const BASE = "http://localhost:3200";
export const DEV_COOKIE = "cod_dev_user";

/** Unique per run, so test data never collides with other runs or with seeded data. */
export const newTag = () => randomBytes(3).toString("hex");

export async function makeUser(displayName: string) {
  return prisma.user.create({
    data: {
      name: displayName,
      email: `${displayName.toLowerCase().replace(/\W+/g, "-")}@e2e.test.local`,
      displayName,
      activisionId: `${displayName.replace(/\W+/g, "")}#7654321`,
    },
  });
}

export async function makeHosterUser(displayName: string) {
  const user = await makeUser(displayName);
  await prisma.hosterProfile.create({ data: { userId: user.id } });
  return user;
}

/** A browser session signed in as this user (the dev login sets exactly this cookie). */
export async function sessionFor(
  browser: Browser,
  userId: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: BASE, timezoneId: "UTC" });
  await context.addCookies([{ name: DEV_COOKIE, value: userId, url: BASE }]);
  const page = await context.newPage();
  page.on("dialog", (d) => void d.accept(d.type() === "prompt" ? "E2E reason" : undefined));
  return { context, page };
}

/** "YYYY-MM-DDTHH:mm" in UTC, the format a datetime-local input takes (the browser runs in UTC). */
export const localInput = (offsetMs: number) =>
  new Date(Date.now() + offsetMs).toISOString().slice(0, 16);

/** Remove everything a run created. Events cascade to registrations, rounds, matches and payouts. */
export async function cleanup(tag: string) {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: "@e2e.test.local" }, displayName: { contains: tag } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.event.deleteMany({ where: { hosterId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

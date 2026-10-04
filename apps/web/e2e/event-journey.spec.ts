import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { verifySpin, type SpinPool, type SpinResult } from "@cod/shared";
import {
  cleanup,
  localInput,
  makeHosterUser,
  makeUser,
  newTag,
  prisma,
  sessionFor,
} from "./helpers";

/**
 * The whole product loop, through the UI, as the people who use it:
 * hoster creates and publishes -> players sign up -> hoster marks paid and opens check-in ->
 * players check in -> hoster starts, prepares and spins the wheel -> a player submits the
 * result -> an opponent confirms it (verified) -> hoster completes the event and records the
 * winner -> the winner confirms the payout.
 */
const tag = newTag();
const HOUR = 3_600_000;

type Actor = { id: string; name: string; page: Page; context: BrowserContext };

test.describe.serial("event journey: create → spin → result → payout", () => {
  let host: Actor;
  const players: Actor[] = [];
  let eventId = "";
  let slug = "";
  const title = `E2E Switcheroo ${tag}`;

  test.beforeAll(async ({ browser }) => {
    const hostUser = await makeHosterUser(`e2e-host-${tag}`);
    const hostSession = await sessionFor(browser, hostUser.id);
    host = { id: hostUser.id, name: hostUser.displayName, ...hostSession };
    for (const n of ["Alpha", "Bravo", "Charlie", "Delta"]) {
      const u = await makeUser(`E2E ${n} ${tag}`);
      players.push({ id: u.id, name: u.displayName, ...(await sessionFor(browser, u.id)) });
    }
  });

  test.afterAll(async () => {
    await Promise.all([host, ...players].map((a) => a?.context.close()));
    await cleanup(tag);
  });

  test("the hoster signs in with the dev login and creates a draft event", async ({ browser }) => {
    // Use the real sign-in form for the hoster instead of the shortcut cookie.
    const context = await browser.newContext({
      baseURL: "http://localhost:3200",
      timezoneId: "UTC",
    });
    const page = await context.newPage();
    page.on("dialog", (d) => void d.accept(d.type() === "prompt" ? "E2E reason" : undefined));
    await page.goto("/sign-in");
    await page.locator("#displayName").selectOption(host.name);
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("link", { name: host.name })).toBeVisible();

    await page.goto("/dashboard/events/new");
    await page.getByLabel("Title").fill(title);
    await page.locator("input[name=teamSize]").fill("2");
    await page.locator("input[name=roundCount]").fill("1");
    await page.locator("input[name=playerCap]").fill("4");
    await page.locator("input[name=entryFee]").fill("0");
    await page.locator("input[name=payoutSplit]").fill("100");
    await page.locator("select[name=game]").selectOption("BO6");
    await page.locator("input[name=checkInOpensAt]").fill(localInput(1 * HOUR));
    await page.locator("input[name=checkInClosesAt]").fill(localInput(2 * HOUR));
    await page.locator("input[name=startsAt]").fill(localInput(3 * HOUR));
    await page.getByRole("button", { name: "Save as draft" }).click();
    await page.waitForURL(/\/dashboard\/events\/(?!new)[a-z0-9]+$/);
    eventId = page.url().split("/").pop()!;
    await context.close();

    const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
    slug = event.slug;
    expect(event).toMatchObject({ status: "DRAFT", game: "BO6", teamSize: 2, playerCap: 4 });
  });

  test("publishing makes it public, with game art and a live countdown", async ({ browser }) => {
    await host.page.goto(`/dashboard/events/${eventId}`);
    await host.page.getByRole("button", { name: "Publish" }).click();
    await expect(host.page.getByRole("button", { name: "Open check-in" })).toBeVisible();

    // A visitor who isn't signed in sees it on the home page and its own page.
    const visitor = await browser.newContext({
      baseURL: "http://localhost:3200",
      timezoneId: "UTC",
    });
    const page = await visitor.newPage();
    await page.goto("/");
    await expect(page.getByRole("link", { name: new RegExp(title) })).toBeVisible();
    await page.goto(`/events/${slug}`);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByAltText("Black Ops 6 cover art")).toBeVisible();
    await expect(page.getByRole("timer")).toContainText(/Starts in/);
    await expect(page.getByRole("button", { name: "Sign up" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Sign in to enter" })).toBeVisible();
    await visitor.close();
  });

  test("four players sign up and land on the waitlist", async () => {
    for (const p of players) {
      await p.page.goto(`/events/${slug}`);
      await p.page.getByRole("button", { name: "Sign up" }).click();
      await expect(p.page.getByText(/Your status:/)).toContainText(/waitlisted/i);
    }
    expect(await prisma.registration.count({ where: { eventId, status: "WAITLISTED" } })).toBe(4);
  });

  test("the hoster marks everyone paid and opens check-in; players check in", async () => {
    await host.page.goto(`/dashboard/events/${eventId}`);
    for (const p of players) {
      const row = host.page.locator("tr", { hasText: p.name });
      await row.getByRole("button", { name: "Mark paid" }).click();
      await expect(row.getByRole("button", { name: "Mark paid" })).toHaveCount(0);
    }
    await host.page.getByRole("button", { name: "Open check-in" }).click();
    await expect(host.page.getByRole("button", { name: /Start event/ })).toBeVisible();

    for (const p of players) {
      await p.page.goto(`/events/${slug}`);
      await p.page.getByRole("button", { name: "Check in now" }).click();
      await expect(p.page.getByText(/Your status:/)).toContainText(/checked in/i);
    }
    expect(await prisma.registration.count({ where: { eventId, status: "CHECKED_IN" } })).toBe(4);
  });

  test("the hoster starts the event, publishes a commitment and spins; the spin verifies", async () => {
    await host.page.goto(`/dashboard/events/${eventId}`);
    await host.page.getByRole("button", { name: /Start event/ }).click();
    await host.page.getByRole("button", { name: /Prepare round 1/ }).click();
    // The commitment is public before the spin, and the secret is not.
    await expect(host.page.getByText(/commitment [0-9a-f]{64}/)).toBeVisible();
    const committed = await prisma.spin.findFirstOrThrow({ where: { eventId } });
    expect(committed.status).toBe("COMMITTED");
    expect(committed.revealedSecret).toBeNull();
    // Anyone can see the commitment before the spin, but the secret behind it never leaks.
    const publicHtml = await (await host.page.request.get(`/events/${slug}`)).text();
    expect(publicHtml).toContain(committed.commitment);
    expect(publicHtml).not.toContain(committed.secret);

    await host.page.getByRole("button", { name: "Spin!" }).click();
    await expect(host.page.getByText("Team A", { exact: true }).first()).toBeVisible();
    await host.page.getByRole("button", { name: "Create matches" }).click();
    await expect(host.page.getByRole("button", { name: "Create matches" })).toHaveCount(0);

    const spin = await prisma.spin.findFirstOrThrow({ where: { eventId } });
    expect(spin.status).toBe("REVEALED");
    expect(
      verifySpin({
        pool: spin.pool as unknown as SpinPool,
        commitment: spin.commitment,
        revealedSecret: spin.revealedSecret!,
        result: spin.result as unknown as SpinResult,
      }),
    ).toEqual({ ok: true });
    expect(await prisma.match.count({ where: { round: { eventId } } })).toBe(1);
  });

  test("a player submits the result and an opponent confirms it", async () => {
    const match = await prisma.match.findFirstOrThrow({
      where: { round: { eventId } },
      include: {
        teamA: { include: { members: true } },
        teamB: { include: { members: true } },
      },
    });
    const byId = (id: string) => players.find((p) => p.id === id)!;
    const submitter = byId(match.teamA.members[0]!.userId);
    const opponent = byId(match.teamB.members[0]!.userId);

    await submitter.page.goto(`/events/${slug}/matches`);
    await submitter.page.getByRole("button", { name: "Submit result" }).click();
    await submitter.page.getByLabel("Team A rounds").fill("6");
    await submitter.page.getByLabel("Team B rounds").fill("3");
    await submitter.page.getByPlaceholder(/image link/).fill("https://i.imgur.com/e2e-board.png");
    await submitter.page.getByRole("button", { name: "Submit", exact: true }).click();
    await expect
      .poll(async () => (await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status)
      .toBe("RESULT_PENDING");

    // Nothing counts until an opponent confirms.
    expect(
      await prisma.playerMatchStat.count({ where: { matchId: match.id, verified: true } }),
    ).toBe(0);
    await opponent.page.goto("/confirmations");
    await expect(opponent.page.getByText(/submitted by/)).toBeVisible();
    await opponent.page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect
      .poll(async () => (await prisma.match.findUniqueOrThrow({ where: { id: match.id } })).status)
      .toBe("VERIFIED");

    const verified = await prisma.match.findUniqueOrThrow({ where: { id: match.id } });
    expect(verified.winningTeamId).toBe(match.teamAId);
    // The verification is announced for the worker (reputation, leaderboards, throw detection).
    const events = await prisma.outboxEvent.findMany({ where: { type: "MatchVerified" } });
    expect(events.some((e) => (e.payload as { matchId: string }).matchId === match.id)).toBe(true);
  });

  test("the hoster completes the event and records the winner; the winner confirms the payout", async () => {
    const match = await prisma.match.findFirstOrThrow({
      where: { round: { eventId } },
      include: { teamA: { include: { members: true } } },
    });
    const winner = players.find((p) => p.id === match.teamA.members[0]!.userId)!;

    await host.page.goto(`/dashboard/events/${eventId}`);
    await host.page.getByRole("button", { name: "Round finished" }).click();
    await expect(host.page.getByText("Complete")).toBeVisible();
    await host.page.getByRole("button", { name: "Complete event" }).click();
    await expect(host.page.getByText(/This event is completed/i)).toBeVisible();

    await host.page.getByLabel("Place 1").selectOption({ label: winner.name });
    await host.page.getByRole("button", { name: "Record winners" }).click();
    await expect(host.page.getByText("Awaiting confirmation")).toBeVisible();

    await winner.page.goto("/payouts");
    await expect(winner.page.getByText(/You placed/)).toContainText("#1");
    await winner.page.getByRole("button", { name: "I was paid" }).click();

    await host.page.reload();
    await expect(host.page.getByText("Payout confirmed")).toBeVisible();
    const pc = await prisma.payoutConfirmation.findFirstOrThrow({ where: { eventId } });
    expect(pc).toMatchObject({ winnerId: winner.id, response: "PAID" });
  });

  test("the public page shows a finished event with a verifiable spin log", async ({ browser }) => {
    const visitor = await browser.newContext({
      baseURL: "http://localhost:3200",
      timezoneId: "UTC",
    });
    const page = await visitor.newPage();
    await page.goto(`/events/${slug}`);
    await expect(page.getByText("This event has finished")).toBeVisible();
    await expect(page.getByText("Ended", { exact: true })).toBeVisible();
    await expect(page.getByText("Spin log")).toBeVisible();
    // After the reveal the secret is public so anyone can re-derive the teams.
    const spin = await prisma.spin.findFirstOrThrow({ where: { eventId } });
    await expect(page.getByText(spin.revealedSecret!)).toBeVisible();
    await visitor.close();
  });
});

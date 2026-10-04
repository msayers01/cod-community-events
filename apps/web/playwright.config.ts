import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";

const PORT = 3200;

/**
 * End-to-end tests drive the real app in a real browser against the real database.
 * They need a migrated Postgres at DATABASE_URL (root .env) and run against `next dev`,
 * because the development-only login that lets tests sign in as seeded users is
 * (deliberately) disabled in production builds.
 *
 * Browser: set PLAYWRIGHT_CHROMIUM_PATH to use an existing Chromium; otherwise Playwright's
 * own (`pnpm exec playwright install chromium`) is used.
 */
const preinstalled = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
].find((p) => p && existsSync(p));

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: "UTC",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    navigationTimeout: 60_000,
    actionTimeout: 20_000,
    launchOptions: {
      ...(preinstalled && { executablePath: preinstalled }),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: `next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    stdout: "ignore",
  },
});

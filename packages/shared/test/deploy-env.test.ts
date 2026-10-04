import { describe, expect, it } from "vitest";
import { checkEnv, formatReport } from "../src/index.js";

const good = {
  NODE_ENV: "production",
  DATABASE_URL: "postgresql://u:p@db:5432/cod",
  REDIS_URL: "redis://redis:6379",
  BETTER_AUTH_SECRET: "x".repeat(40),
  NEXT_PUBLIC_APP_URL: "https://events.example.com",
  NEXT_PUBLIC_REALTIME_URL: "https://rt.example.com",
  DISCORD_CLIENT_ID: "id",
  DISCORD_CLIENT_SECRET: "secret",
  R2_ENDPOINT: "https://acct.r2.cloudflarestorage.com",
  R2_BUCKET: "b",
  R2_ACCESS_KEY_ID: "k",
  R2_SECRET_ACCESS_KEY: "s",
  SENTRY_DSN: "https://k@o.ingest.sentry.io/1",
  DISCORD_BOT_TOKEN: "t",
};

describe("production environment checks", () => {
  it("accepts a fully configured deployment for every service", () => {
    for (const s of ["web", "worker", "realtime", "bot", "migrate"] as const) {
      const r = checkEnv(s, good);
      expect(r, s).toEqual({ errors: [], warnings: [] });
    }
  });

  it("refuses to run the web app on a missing, placeholder or short auth secret", () => {
    const secret = (v: string | undefined) =>
      checkEnv("web", { ...good, BETTER_AUTH_SECRET: v }).errors.join(" ");
    expect(secret(undefined)).toMatch(/BETTER_AUTH_SECRET is not set/);
    expect(secret("dev-only-insecure-secret-change-me")).toMatch(/placeholder/);
    expect(secret("change-me-to-a-long-random-string")).toMatch(/placeholder/);
    expect(secret("short")).toMatch(/too short/);
  });

  it("requires a public https app URL and a way to sign in", () => {
    expect(
      checkEnv("web", { ...good, NEXT_PUBLIC_APP_URL: "http://events.example.com" }).errors[0],
    ).toMatch(/https/);
    expect(checkEnv("web", { ...good, NEXT_PUBLIC_APP_URL: undefined }).errors[0]).toMatch(
      /NEXT_PUBLIC_APP_URL/,
    );
    expect(
      checkEnv("web", { ...good, NEXT_PUBLIC_APP_URL: "http://localhost:3000" }).errors[0],
    ).toMatch(/localhost/);
    const noAuth = checkEnv("web", {
      ...good,
      DISCORD_CLIENT_ID: undefined,
      DISCORD_CLIENT_SECRET: undefined,
    });
    expect(noAuth.errors.join(" ")).toMatch(/No sign-in provider/);
    const half = checkEnv("web", { ...good, DISCORD_CLIENT_SECRET: undefined });
    expect(half.errors.join(" ")).toMatch(/set together/);
  });

  it("rejects a malformed or missing database / redis URL", () => {
    expect(checkEnv("migrate", { ...good, DATABASE_URL: undefined }).errors).toHaveLength(1);
    expect(checkEnv("worker", { ...good, DATABASE_URL: "mysql://x" }).errors[0]).toMatch(
      /postgres/,
    );
    expect(checkEnv("worker", { ...good, REDIS_URL: undefined }).errors[0]).toMatch(/REDIS_URL/);
    expect(checkEnv("realtime", { ...good, REDIS_URL: "http://x" }).errors[0]).toMatch(/redis/);
    // The web app can run without redis (best-effort real-time), but says so.
    const web = checkEnv("web", { ...good, REDIS_URL: undefined });
    expect(web.errors).toEqual([]);
    expect(web.warnings.join(" ")).toMatch(/REDIS_URL/);
  });

  it("treats storage as all-or-nothing", () => {
    const half = checkEnv("worker", { ...good, R2_BUCKET: undefined });
    expect(half.errors[0]).toMatch(/half configured.*R2_BUCKET/);
    const none = checkEnv("web", {
      ...good,
      R2_ENDPOINT: undefined,
      R2_BUCKET: undefined,
      R2_ACCESS_KEY_ID: undefined,
      R2_SECRET_ACCESS_KEY: undefined,
    });
    expect(none.errors).toEqual([]);
    expect(none.warnings.join(" ")).toMatch(/R2 storage is not configured/);
  });

  it("a bot service without a token is a mistake in production", () => {
    expect(checkEnv("bot", { ...good, DISCORD_BOT_TOKEN: undefined }).errors[0]).toMatch(/idle/);
    expect(
      checkEnv("bot", { ...good, NODE_ENV: "development", DISCORD_BOT_TOKEN: undefined }).errors,
    ).toEqual([]);
  });

  it("requires CORS origins for the realtime server", () => {
    const r = checkEnv("realtime", { ...good, NEXT_PUBLIC_APP_URL: undefined });
    expect(r.errors[0]).toMatch(/REALTIME_CORS_ORIGINS/);
    expect(
      checkEnv("realtime", {
        ...good,
        NEXT_PUBLIC_APP_URL: undefined,
        REALTIME_CORS_ORIGINS: "https://a.example",
      }).errors,
    ).toEqual([]);
  });

  it("only needs a database outside production, so local development stays easy", () => {
    expect(checkEnv("web", { DATABASE_URL: "postgresql://localhost/cod" }).errors).toEqual([]);
    expect(checkEnv("web", {}).errors).toEqual(["DATABASE_URL is not set."]);
  });

  it("formats a readable report", () => {
    const text = formatReport("web", checkEnv("web", { NODE_ENV: "production" }));
    expect(text).toMatch(/^\[env\] web: \d+ error/);
    expect(text).toMatch(/ERROR\s+DATABASE_URL/);
  });
});

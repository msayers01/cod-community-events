import { checkEnv, formatReport } from "@cod/shared";

/**
 * In production the web app refuses to run with an unsafe configuration (notably: no auth
 * secret, which would otherwise fall back to a publicly known default). The container entrypoint
 * runs the same check at start-up; this is the backstop for `next start` run directly.
 *
 * Skipped during `next build`, which has no runtime secrets.
 */
if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
  const report = checkEnv("web", process.env);
  if (report.errors.length > 0) {
    throw new Error(`Invalid production configuration\n${formatReport("web", report)}`);
  }
}

export const env = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  authSecret: process.env.BETTER_AUTH_SECRET ?? "dev-only-insecure-secret-change-me",
  discord: {
    id: process.env.DISCORD_CLIENT_ID ?? "",
    secret: process.env.DISCORD_CLIENT_SECRET ?? "",
  },
  twitch: {
    id: process.env.TWITCH_CLIENT_ID ?? "",
    secret: process.env.TWITCH_CLIENT_SECRET ?? "",
  },
  /** Dev-only: allows signing in as any seeded user from /sign-in. Never set in production. */
  devLogin: process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN !== "false",
};

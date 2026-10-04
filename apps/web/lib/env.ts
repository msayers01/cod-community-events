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

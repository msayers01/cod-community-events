import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { loadRootEnv } from "@cod/db";

loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  transpilePackages: ["@cod/shared", "@cod/db", "@cod/realtime", "@cod/core"],
};

// Sentry's build plugin (source maps) only activates when an auth token is present.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  : nextConfig;

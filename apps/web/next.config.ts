import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { loadRootEnv } from "@cod/db";

loadRootEnv();

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  transpilePackages: ["@cod/shared", "@cod/db", "@cod/realtime", "@cod/core"],
  poweredByHeader: false,
  async headers() {
    // Baseline hardening. A Content-Security-Policy is deliberately not set yet: Next's inline
    // scripts need a nonce-based policy, which should be added and tested separately.
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

// Sentry's build plugin (source maps) only activates when an auth token is present.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(nextConfig, {
      silent: true,
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
    })
  : nextConfig;

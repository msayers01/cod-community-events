import * as Sentry from "@sentry/node";

/** Error tracking, enabled only when SENTRY_DSN is set. */
export function initSentry(component: string) {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    serverName: component,
    tracesSampleRate: 0.1,
  });
  process.on("unhandledRejection", (e) => Sentry.captureException(e));
}

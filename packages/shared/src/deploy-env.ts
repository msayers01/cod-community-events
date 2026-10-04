/**
 * Deployment environment checks. One definition of "this service is configured well enough to
 * run in production", used by the container entrypoint (so a bad deploy fails at start, with a
 * readable message) and by the web app at runtime. Pure: pass the environment in.
 */

export const SERVICES = ["web", "worker", "realtime", "bot", "migrate"] as const;
export type Service = (typeof SERVICES)[number];

export interface EnvReport {
  /** Problems that make the service unsafe or unable to work. Production refuses to start. */
  errors: string[];
  /** Things that work but reduce what the service can do. */
  warnings: string[];
}

type Env = Record<string, string | undefined>;

/** Values that appear in the repo's examples or code and must never be used for real. */
const PLACEHOLDER_SECRETS = [
  "dev-only-insecure-secret-change-me",
  "change-me-to-a-long-random-string",
  "ci-secret-not-for-production",
];

const set = (env: Env, key: string) => (env[key] ?? "").trim() !== "";

function isUrl(value: string, protocols: string[]): boolean {
  try {
    return protocols.includes(new URL(value).protocol);
  } catch {
    return false;
  }
}

const isLocalhost = (value: string) => {
  try {
    const h = new URL(value).hostname;
    return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
  } catch {
    return false;
  }
};

function checkDatabase(env: Env, r: EnvReport) {
  const url = env.DATABASE_URL?.trim();
  if (!url) r.errors.push("DATABASE_URL is not set.");
  else if (!isUrl(url, ["postgres:", "postgresql:"]))
    r.errors.push("DATABASE_URL must be a postgres:// or postgresql:// URL.");
}

function checkRedis(env: Env, r: EnvReport, required: boolean) {
  const url = env.REDIS_URL?.trim();
  if (!url) {
    (required ? r.errors : r.warnings).push(
      required
        ? "REDIS_URL is not set."
        : "REDIS_URL is not set: real-time updates are disabled (pages fall back to polling).",
    );
  } else if (!isUrl(url, ["redis:", "rediss:"])) r.errors.push("REDIS_URL must be a redis:// URL.");
}

/** Storage is all-or-nothing: a half-configured bucket fails confusingly at upload time. */
function checkStorage(env: Env, r: EnvReport, consequence: string) {
  const keys = ["R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"];
  const present = keys.filter((k) => set(env, k));
  if (present.length === 0) r.warnings.push(`R2 storage is not configured: ${consequence}`);
  else if (present.length < keys.length)
    r.errors.push(
      `R2 storage is half configured; also set ${keys.filter((k) => !present.includes(k)).join(", ")}.`,
    );
}

/**
 * Check one service's environment. In production the checks are strict; outside it only the
 * basics (a database) are required, so local development keeps working with an empty .env.
 */
export function checkEnv(service: Service, env: Env): EnvReport {
  const r: EnvReport = { errors: [], warnings: [] };
  const production = env.NODE_ENV === "production";

  checkDatabase(env, r);
  if (service === "migrate") return r;

  if (service === "web") {
    if (production) {
      const secret = env.BETTER_AUTH_SECRET?.trim() ?? "";
      if (!secret)
        r.errors.push(
          "BETTER_AUTH_SECRET is not set. Without it sessions would be signed with a publicly known default. Generate one: openssl rand -base64 48",
        );
      else if (PLACEHOLDER_SECRETS.includes(secret))
        r.errors.push("BETTER_AUTH_SECRET is still a placeholder from the examples.");
      else if (secret.length < 32)
        r.errors.push("BETTER_AUTH_SECRET is too short (use at least 32 characters).");

      const app = env.NEXT_PUBLIC_APP_URL?.trim() ?? "";
      if (!app) r.errors.push("NEXT_PUBLIC_APP_URL is not set (the public https:// address).");
      else if (!isUrl(app, ["https:"]) && !isLocalhost(app))
        r.errors.push("NEXT_PUBLIC_APP_URL must be https:// in production.");
      else if (isLocalhost(app) && env.ALLOW_LOCAL_APP_URL !== "true")
        r.errors.push(
          "NEXT_PUBLIC_APP_URL points at localhost; sign-in and share links would break.",
        );

      if (!set(env, "DISCORD_CLIENT_ID") && !set(env, "TWITCH_CLIENT_ID"))
        r.errors.push(
          "No sign-in provider is configured (set DISCORD_CLIENT_ID/SECRET or TWITCH_CLIENT_ID/SECRET); nobody could log in.",
        );
      for (const p of ["DISCORD", "TWITCH"])
        if (set(env, `${p}_CLIENT_ID`) !== set(env, `${p}_CLIENT_SECRET`))
          r.errors.push(`${p}_CLIENT_ID and ${p}_CLIENT_SECRET must be set together.`);
      if (!set(env, "NEXT_PUBLIC_REALTIME_URL"))
        r.warnings.push(
          "NEXT_PUBLIC_REALTIME_URL is not set (it must be present at build time): live pages and the OBS overlay will only poll.",
        );
    }
    checkRedis(env, r, false);
    checkStorage(env, r, "screenshot and evidence uploads are disabled (links still work).");
  }

  if (service === "worker") {
    checkRedis(env, r, true);
    checkStorage(env, r, "uploaded screenshots cannot be read automatically.");
  }

  if (service === "realtime") {
    checkRedis(env, r, true);
    if (production && !set(env, "REALTIME_CORS_ORIGINS") && !set(env, "NEXT_PUBLIC_APP_URL"))
      r.errors.push("Set REALTIME_CORS_ORIGINS (or NEXT_PUBLIC_APP_URL) so browsers may connect.");
  }

  if (service === "bot" && !set(env, "DISCORD_BOT_TOKEN")) {
    // A bot service with no token is a deploy mistake, not a feature.
    (production ? r.errors : r.warnings).push(
      "DISCORD_BOT_TOKEN is not set: the bot would sit idle and post nothing.",
    );
  }

  if (production && !set(env, "SENTRY_DSN"))
    r.warnings.push("SENTRY_DSN is not set: errors will not be reported.");
  return r;
}

/** Human-readable report for logs. */
export function formatReport(service: Service, r: EnvReport): string {
  const lines = [`[env] ${service}: ${r.errors.length} error(s), ${r.warnings.length} warning(s)`];
  for (const e of r.errors) lines.push(`  ERROR   ${e}`);
  for (const w of r.warnings) lines.push(`  warning ${w}`);
  return lines.join("\n");
}

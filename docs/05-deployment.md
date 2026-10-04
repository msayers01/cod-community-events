# Deployment

How to run the platform in production. The tech-stack doc chose **Railway** (Render or Fly.io are
alternatives); everything here is plain Docker, so it ports to any of them.

> **Status of this guide.** The image, the start-up checks, the migrations and the full stack are
> built and tested from an empty database (`deploy/smoke.sh`, also run in CI). The Railway-specific
> steps below are written from its documented behaviour but have not been executed against a real
> Railway project. Treat the first deploy as a rehearsal on a staging project.

## 1. What runs

One Docker image, run several times with a different `SERVICE` value:

| Service     | `SERVICE`  | Port   | Needs                             | Notes                                                                     |
| ----------- | ---------- | ------ | --------------------------------- | ------------------------------------------------------------------------- |
| Web app     | `web`      | `PORT` | Postgres, Redis (recommended), R2 | Next.js. Health check: `GET /api/health`.                                 |
| Worker      | `worker`   | none   | Postgres, Redis, R2               | Outbox processor, timers, leaderboards, throw detection, screenshot OCR.  |
| Realtime    | `realtime` | `PORT` | Redis, Postgres                   | Socket.IO for live pages, the OBS overlay, live leaderboards. `/healthz`. |
| Discord bot | `bot`      | none   | Postgres, bot token               | Optional. Posts new events to subscribed channels.                        |
| Migrations  | `migrate`  | none   | Postgres                          | Applies pending migrations and exits. Run before each release.            |

Plus **PostgreSQL 16**, **Redis 7**, a **Cloudflare R2** bucket (screenshots, evidence) and
**Sentry** (optional but recommended).

Run **exactly one worker**. It is safe to run more (queues and the outbox use locking), but nothing
needs it yet and one is easier to reason about. The web app and realtime server can scale
horizontally (realtime instances share messages through Redis).

On start, every service validates its environment (`deploy/check-env.mjs`, backed by
`packages/shared/src/deploy-env.ts`) and exits with a readable reason if production is
misconfigured. For example, the web app will not start without a real `BETTER_AUTH_SECRET`, an
`https://` public URL, and at least one sign-in provider.

## 2. Build-time vs run-time variables

`NEXT_PUBLIC_*` values are compiled into the browser bundle. They must exist **when the image is
built**, and changing one means rebuilding:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_REALTIME_URL`
- `NEXT_PUBLIC_SENTRY_DSN`

Everything else is read at run time. `deploy/production.env.example` lists every variable.

## 3. Deploying on Railway

1. **Create a project** and add the **PostgreSQL** and **Redis** plugins. Note the connection URLs
   they expose.
2. **Create four services** from this GitHub repo (web, worker, realtime, and optionally bot). Each
   builds the root `Dockerfile`. On each, set the variable `SERVICE` to its value from the table
   above.
3. **Variables.** Set per service (use Railway reference variables such as `${{Postgres.DATABASE_URL}}`
   where you can):

   | Variable                           | web | worker | realtime | bot |
   | ---------------------------------- | :-: | :----: | :------: | :-: |
   | `SERVICE`                          |  x  |   x    |    x     |  x  |
   | `DATABASE_URL`                     |  x  |   x    |    x     |  x  |
   | `REDIS_URL`                        |  x  |   x    |    x     |     |
   | `BETTER_AUTH_SECRET`               |  x  |        |          |     |
   | `NEXT_PUBLIC_APP_URL` (build)      |  x  |        |    x     |  x  |
   | `BETTER_AUTH_URL`                  |  x  |        |          |     |
   | `NEXT_PUBLIC_REALTIME_URL` (build) |  x  |        |          |     |
   | `REALTIME_CORS_ORIGINS`            |     |        |    x     |     |
   | `DISCORD_CLIENT_ID` / `_SECRET`    |  x  |        |          |     |
   | `TWITCH_CLIENT_ID` / `_SECRET`     |  x  |        |          |     |
   | `R2_*` (all four)                  |  x  |   x    |          |     |
   | `DISCORD_BOT_TOKEN`                |     |        |          |  x  |
   | `SENTRY_DSN`                       |  x  |   x    |    x     |  x  |
   | `NEXT_PUBLIC_SENTRY_DSN` (build)   |  x  |        |          |     |

4. **Domains.** Give `web` your public domain and `realtime` its own (for example
   `realtime.example.com`; it must support WebSockets, which Railway does). Set
   `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_REALTIME_URL` to those `https://` addresses **before** the
   first build.
5. **Migrations.** On the `web` service set the _pre-deploy command_ to
   `env SERVICE=migrate /app/deploy/start.sh`. It runs `prisma migrate deploy` against
   `DATABASE_URL` before the new version takes traffic and blocks the release if it fails.
6. **Health checks and restarts.** `web`: path `/api/health`. `realtime`: path `/healthz`. `worker`
   and `bot` have no port; set their restart policy to _on failure_.
7. **Deploy order the first time:** Postgres + Redis → `web` (this runs the migrations) → `realtime`
   → `worker` → `bot`.

### Other hosts

`docker-compose.prod.yml` runs the whole stack on one machine (Postgres, Redis, a migration step,
then the services):

```bash
cp deploy/production.env.example .env.production   # fill it in
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
docker compose -f docker-compose.prod.yml --env-file .env.production --profile bot up -d bot
```

Put a TLS-terminating reverse proxy (Caddy, nginx, Cloudflare) in front of ports 3000 and 3001.

## 4. Third-party setup

**Discord sign-in.** Developer portal → New application → OAuth2. Redirect URI:
`https://<app-domain>/api/auth/callback/discord`. Put the client ID and secret in
`DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.

**Twitch sign-in.** dev.twitch.tv → Register application. Redirect URL:
`https://<app-domain>/api/auth/callback/twitch`.

**Discord bot.** Same Discord application → Bot → copy the token into `DISCORD_BOT_TOKEN`. Invite
with the `bot` and `applications.commands` scopes. Slash commands register themselves on start.

**Cloudflare R2.** Create a private bucket. Create an API token scoped to that bucket only
(object read and write). Browsers upload straight to R2 with pre-signed links, so the bucket needs
CORS allowing your app origin:

```json
[
  {
    "AllowedOrigins": ["https://events.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "MaxAgeSeconds": 3600
  }
]
```

Set `R2_ENDPOINT` (`https://<account>.r2.cloudflarestorage.com`), `R2_BUCKET`, `R2_ACCESS_KEY_ID`,
`R2_SECRET_ACCESS_KEY`. Keep the bucket private; the app serves files through short-lived links.

**Sentry.** One project per runtime is fine. `SENTRY_DSN` for the servers and workers,
`NEXT_PUBLIC_SENTRY_DSN` (build time) for the browser. For readable stack traces in the web app,
also set `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` at build time.

## 5. Database

- **Backups.** Turn on automated daily backups with point-in-time recovery on your Postgres host
  (the architecture requires it). The image deliberately does not ship `pg_dump`: a client older
  than the server fails, and the host's own backups are the more reliable tool.
- **Restore drill.** Before launch, restore a backup into a scratch database, point a staging copy
  of the app at it, and sign in. A backup you have never restored is a hope, not a backup.
- **Connections.** Each Node process keeps a small pool (default 10). With web, worker, realtime and
  bot that is around 40 connections at most; check your plan's limit.
- **The audit log.** `staff_action_log` rejects `UPDATE` and `DELETE` through a database trigger
  created by the first migration, so the guarantee holds even if application code is wrong. For
  defence in depth, run migrations with a privileged role and the services with a role that cannot
  alter or drop tables; use the privileged URL only for the `migrate` step.

## 6. Releasing and rolling back

- Migrations are written to be **additive** (new tables, new nullable columns, new enum values), so
  the previous version of the code keeps working against the new schema.
- To release: merge to `main` → the host builds the image → the pre-deploy step migrates → services
  swap over.
- To **roll back**, redeploy the previous image. Do **not** roll the database back; the old code
  tolerates the newer schema. If a migration must be undone, write a new forward migration.
- A destructive schema change (drop or rename a column) takes two releases: stop using it, then drop
  it.

## 7. Secrets

- Generate the auth secret with `openssl rand -base64 48`. Rotating it signs every user out, which
  is the recovery step if it ever leaks.
- Never reuse the values in `deploy/smoke.env` or the examples; the app rejects the known
  placeholders.
- Rotate R2 keys and the bot token by creating the new one, updating the variable, redeploying, then
  deleting the old one.

## 8. Operating it

- **Logs.** Each service logs to stdout. Search for `[env]` (start-up checks), `[outbox]`
  (failed events), `[timers]` (sweep failures), `[realtime]`.
- **Is the worker alive?** Newly verified results should appear on the leaderboards within seconds.
  A growing backlog shows up in the database:
  `select status, count(*) from outbox_event group by 1;` — `PENDING` should stay near zero and
  `FAILED` should be empty. `select status, count(*) from screenshot_reading group by 1;` shows
  screenshot reads.
- **Screenshot reading** runs inside the worker with no network access needed (the language data
  ships in the image). Reading one screenshot completed inside a 384 MB container limit in testing, so the
  worker needs headroom above that for the rest of its work: start it at 512 MB–1 GB and watch it.
- **Throw-detection flags** arrive in `/staff/flags` and as a notification to moderators.

## 9. Launch checklist

- [ ] Domains and TLS for the web app and realtime server.
- [ ] `NEXT_PUBLIC_*` set, image built after setting them.
- [ ] Discord and/or Twitch OAuth apps created with the exact redirect URIs above.
- [ ] R2 bucket private, CORS set, token scoped to the bucket.
- [ ] Sentry DSNs set; trigger a test error and confirm it arrives.
- [ ] Database backups on; restore drill done.
- [ ] First staff account created. There is deliberately no sign-up path to staff. Sign in once so
      your user exists, then in the database:
      `insert into staff_role ("userId", role) select id, 'FOUNDER' from "user" where "displayName" = 'YourName';`
      Further staff are added from the app by an admin.
- [ ] Legal review of the verified-reports (blacklist) wording and terms.
- [ ] Product decisions in `docs/01-planning.md` §12 settled (name, thresholds, tiers, expiry
      periods, staff display, data deletion).
- [ ] Rehearsal: create an event, run it end to end on staging with real accounts.

## 10. Known gaps

- **No Content-Security-Policy.** Baseline headers are set (nosniff, frame denial, referrer policy,
  HSTS); a nonce-based CSP for Next's inline scripts should be added and tested separately.
- **No rate limiting** on sign-up, uploads or report filing beyond the existing per-user limits. Put
  Cloudflare (or your host's edge) in front and add rules for `/api/*`.
- **The image is not slimmed**: it carries the whole build tree (about 640 MB) so the migration CLI and
  every service work from one image. Pruning to production dependencies is a later optimisation.
- **Real OAuth, R2 and Sentry** have not been exercised with live credentials.
- **Staff bootstrap is manual** (step above).

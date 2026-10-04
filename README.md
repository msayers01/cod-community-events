# CoD Community Events

A trust-first platform for community-hosted Call of Duty switcheroos and tournaments. Hosters post
events and run them with built-in tools (sign-ups, payment tracking, waitlist, check-in, a provably
fair OBS wheel overlay). The platform tracks reputation for hosters and players. **The site never
handles money.**

Planning documents live in [`docs/`](docs/): [planning](docs/01-planning.md), [architecture](docs/02-architecture.md),
[data model](docs/03-data-model.md), [tech stack](docs/04-tech-stack.md).

## Layout

```
apps/web        Next.js app: public pages, dashboards, API, OBS overlay
apps/realtime   Socket.IO server: relays Redis pub/sub to per-event and per-overlay rooms
apps/worker     Outbox processor + BullMQ timers (check-in windows, notifications)
apps/bot        discord.js bot: posts published events to configured channels
packages/shared Enums, state machines, Zod schemas, policy checks, commit-reveal wheel
packages/db     Prisma schema, migrations, client, outbox helper
packages/realtime Real-time protocol (rooms, payloads) and the Redis publisher
```

It is a modular monolith: one database, one codebase, several processes. Modules communicate
through services and domain events written to an outbox table (see `packages/db/src/outbox.ts`).

## Getting started

Requirements: Node 22+, pnpm 10, Docker (or a local PostgreSQL 16 and Redis 7).

```bash
pnpm install
cp .env.example .env            # edit if your DB/Redis differ
docker compose up -d            # postgres + redis
pnpm db:generate
pnpm db:migrate                 # applies migrations (prisma migrate dev)
pnpm db:seed                    # demo hoster, players, one open event
pnpm dev                        # web :3000, realtime :3001, worker, bot (bot idles without a token)
```

Open http://localhost:3000. In development, `/sign-in` offers a **Development login** that signs
you in as any seeded user without OAuth (disabled in production, or by `DEV_LOGIN=false`).
Sign in as `DemoHoster` to see the hoster dashboard; as `Player1` to sign up and check in.

### OAuth

Create Discord and Twitch applications and set `DISCORD_CLIENT_ID/SECRET` and
`TWITCH_CLIENT_ID/SECRET` in `.env`. Redirect URL: `${BETTER_AUTH_URL}/api/auth/callback/<provider>`.

### OBS overlay

Each event has a private overlay URL (`/overlay/<key>`) shown on the hoster dashboard. Add it as a
Browser Source. The overlay only displays what the server decided; it never picks teams. It receives
state over Socket.IO from the real-time server and falls back to polling if that is unreachable.

### Moderation

Any signed-in user can report another from their profile. Reports need evidence (links, or private uploads
when R2 is configured) and go to the staff queue at `/staff`. Staff assign, request a response from the
accused, add evidence, sanction (warning / suspension / permanent ban, escalating with rank), and close.
Recusal is enforced from declared conflicts and event involvement. Every staff action needs a reason and
lands in the append-only log at `/staff/log`. Public attribution is always "staff".

### Payout confirmation

After completing an event the hoster records the winners. Each winner gets a prompt (`/payouts`) to confirm
they were paid. "Not paid" automatically opens a non-payment report. Confirmed and denied payouts appear on
the hoster's profile.

### Real-time

Services publish an envelope to Redis after each committed change (`apps/web/modules/realtime/publish.ts`).
Every `apps/realtime` instance subscribes and relays to Socket.IO rooms: `event:<id>` (public) and
`overlay:<key>` (joinable only with the unguessable overlay key). Event pages and the hoster dashboard
re-render on push; the overlay animates on push. Updates are best-effort; the database is the source of truth.

## How a spin is provably fair

1. The hoster clicks **Prepare round**. The server snapshots the pool, generates a secret and
   publishes `commitment = sha256(secret + ":" + sha256(pool))`.
2. The hoster clicks **Spin**. The server derives the shuffle deterministically from the secret
   (`packages/shared/src/wheel/commit-reveal.ts`) and creates the teams.
3. The secret is revealed. Anyone can recompute the commitment and the teams from the public spin
   log on the event page. `verifySpin()` in `@cod/shared` does exactly this.

## Scripts

| Command                                      | What it does                            |
| -------------------------------------------- | --------------------------------------- |
| `pnpm dev` / `pnpm build`                    | Run or build every app via Turborepo    |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks across the workspace             |
| `pnpm db:migrate`                            | Create/apply a migration in development |
| `pnpm db:deploy`                             | Apply migrations (CI/production)        |
| `pnpm db:seed`                               | Seed demo data                          |
| `pnpm --filter @cod/db studio`               | Prisma Studio                           |

Web tests (`apps/web/test`) are integration tests and need `DATABASE_URL` to point at a migrated
database. Shared package tests are pure unit tests.

## Status

Phase 1 feature-complete pending real-world testing. Done: accounts and OAuth wiring, hoster registration, event creation and
lifecycle, listings with filters, sign-ups with hoster-marked payment and automatic waitlist,
Twitch join links and quick-add, check-in and no-show recording, commit-reveal wheel with public
spin log and OBS overlay, Socket.IO real-time push for event pages, dashboard and overlay,
append-only staff action log enforced in the database, outbox worker with notifications, Discord
bot posting published events, event templates, mod-reviewed report system with staff queue, sanctions,
internal notes and action log, payout confirmation prompts with automatic non-payment reports, in-site
notifications, Sentry (env-gated) and private R2 evidence uploads (env-gated).

Before launch: X account linking, OAuth apps and R2/Sentry credentials, legal review of blacklist wording
(Phase 2), Playwright end-to-end tests of the sign-up → spin → payout flow.

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
packages/core   Domain logic shared by web and worker (verification, reputation recalculation, expiry)
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

### Match results and verification

After a spin the hoster creates the round's matches. Any player in a match, or the hoster, submits the result
with a required scoreboard screenshot and optional per-player stats. Everyone else in the match gets a one-tap
confirm / dispute prompt (`/confirmations`). A result verifies when no one disputes and at least one player from
each side has confirmed (the submitter counts for their side). After 24 hours an unconfirmed result goes to
review. Disputes go to the hoster first (`/dashboard/events/<id>/disputes`), to staff for escalations and
anything involving the hoster (`/staff/disputes`). Only verified stats count toward profiles.

### Reputation

Teammates in a verified match can rate each other once (`/ratings`). Participants of a completed event can
review the hoster once (`/events/<slug>/review`). The worker recalculates each user's reputation summary,
hoster tier (New / Verified / Trusted, automatic unless staff override) and badges on every relevant event.

### Blacklist and appeals

Staff propose public entries from a report once the accused has had their response window. Two different,
non-recused moderators must approve before an entry appears at `/blacklist`. Lesser categories expire. The
subject can appeal from `/account/appeals`; appeals are handled by a moderator who was not involved, and
overturning lifts the entry or sanction.

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

## Phase 3 features

**Team formation modes.** Hosters choose per event: fully random (default), skill-balanced, or no repeat
teammates. Every mode is still a commit-reveal spin: the mode's inputs (player ratings from verified
stats, or how often each pair has already teamed up this event) are snapshotted into the pool that the
commitment covers, and the teams are derived from the secret by `deriveResult()`, so `verifySpin()`
checks all three modes the same way. The modes only rearrange a uniform random shuffle; they never let
anyone pick who plays with whom. Fully random pools hash exactly as before.

**Throw detection** (`packages/core/src/throw-detection`). After a match is verified the worker looks at
the losing side for three things: a player far below their own baseline, an unusually long losing run
in one event, and an unusually bad record with one specific teammate. Hits become `ThrowFlag` rows in a
moderator-only queue (`/staff/flags`, moderators and above). A flag is a lead, not a verdict: nothing in
the detection code can create a sanction, report or blacklist entry. Escalating a flag opens an ordinary
THROWING report (with the verified scoreboard attached) that goes through the normal report process and
the accused's right to respond. Flags are never shown to the player, never on a public page, and the
thresholds live only in `thresholds.ts`, which is not exported from the package. Recusal applies.

**Screenshot reading** (`packages/core/src/ocr`, `apps/worker`). Submitting a result queues a reading;
the worker runs Tesseract on the screenshot. It first tries the whole frame (header row plus
kills/deaths columns). Stylised in-game boards defeat that, so it then cuts out each team table and the
player's stats card, cleans them up (enlarge, invert, threshold; `apps/worker/src/preprocess.ts`) and reads
them by word position. The reading is advisory only: it flags fields that disagree with the typed stats,
and when the submitter left stats blank it pre-fills what it can as unverified rows marked "read from
screenshot" that confirmers can dispute. It never verifies a result. Uploaded screenshots are read from
R2; pasted links are fetched only from `SCREENSHOT_URL_HOSTS`.

What it reads today is measured on one real **Hardpoint** scoreboard (the two-table layout with
`RANK PLAYER SCORE OBJ. SCORE TIME`): player names matched to participants, each player's time on the
hill, and the submitter's own eliminations and deaths from the stats card, which is attributed to them by
the `#id` in their name and cross-checked against the Elim/D ratio (a digit OCR drops can be rebuilt from
it). That screenshot does not show kills or deaths for the other seven players, so those are never
filled. Search & Destroy and other layouts have not been tested with real screenshots; unrecognised
layouts simply get no reading. The engine sits behind the `OcrEngine` interface so Cloud Vision or
Textract can replace Tesseract.

**Leaderboards** (`/leaderboards`). Pre-calculated standings per game mode for each month, each admin-defined
season (`/staff/seasons`) and all time. Only verified results count; a win is 3 points and a loss 1, and
three verified matches are needed to be ranked. Suspended or banned players, and players on the verified
reports list for cheating, throwing or falsified results, are left off. Boards are rewritten by the worker
when a match is verified and on a 10-minute schedule.

**Profile pictures** (`apps/web/modules/identity/avatars.ts`). Players upload a PNG, JPEG or WebP (5 MB max)
from their account page. Every upload is decoded and re-encoded to a 256x256 WebP, which strips metadata
such as EXIF location, crops to a square, and refuses decompression bombs and non-images. The result is
stored in Postgres (no object storage needed) and served from `/api/avatars/<id>` with ETags and a
versioned, long-cached URL. Without a picture a colored initials badge is shown; OAuth avatar URLs are
deliberately not hotlinked. Staff with `content.remove` can take a picture down with a logged reason.

## Deploying

One Docker image runs every service (`SERVICE=web|worker|realtime|bot|migrate`). Services validate
their environment at start-up and refuse to run production with an unsafe configuration (for example a
missing auth secret). `deploy/smoke.sh` builds the image and brings the full stack up from an empty
database; CI runs it on every change. See [docs/05-deployment.md](docs/05-deployment.md) for the
Railway runbook, third-party setup, backups, releasing and the launch checklist.

## Scripts

| Command                                      | What it does                            |
| -------------------------------------------- | --------------------------------------- |
| `pnpm dev` / `pnpm build`                    | Run or build every app via Turborepo    |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | Checks across the workspace             |
| `pnpm db:migrate`                            | Create/apply a migration in development |
| `pnpm db:deploy`                             | Apply migrations (CI/production)        |
| `pnpm db:seed`                               | Seed demo data                          |
| `pnpm --filter @cod/db studio`               | Prisma Studio                           |

End-to-end tests (`apps/web/e2e`, Playwright) drive the real app in a browser through the whole loop: create → publish →
sign up → pay → check in → spin → result → confirm → complete → payout, plus cancellation, the live countdown, profile
pictures and access control. Run `pnpm test:e2e` (needs the same migrated Postgres; it starts `next dev` itself because
the test sign-in is disabled in production builds; first time: `pnpm --filter @cod/web exec playwright install chromium`).

Web tests (`apps/web/test`) are integration tests and need `DATABASE_URL` to point at a migrated
database. Shared package tests are pure unit tests.

## Status

Phase 3 implemented, pending real-world testing. Phase 1 done: accounts and OAuth wiring, hoster registration, event creation and
lifecycle, listings with filters, sign-ups with hoster-marked payment and automatic waitlist,
Twitch join links and quick-add, check-in and no-show recording, commit-reveal wheel with public
spin log and OBS overlay, Socket.IO real-time push for event pages, dashboard and overlay,
append-only staff action log enforced in the database, outbox worker with notifications, Discord
bot posting published events, event templates, mod-reviewed report system with staff queue, sanctions,
internal notes and action log, payout confirmation prompts with automatic non-payment reports, in-site
notifications, Sentry (env-gated) and private R2 evidence uploads (env-gated).

Phase 2 done: match creation per round, screenshot-based result submission with player confirmation and
dispute flow, 24-hour verification window, hoster/staff dispute review, verified stat tracking, teammate
ratings, participant-only hoster reviews, reputation summaries with automatic hoster tiers and badges, public
blacklist with right to respond, two-person approval, expiry and appeals, requirement-based and invite-only
entry, X share links, Discord slash commands for channel subscriptions.

Phase 3 done: throw detection (statistical flags for moderators, never automatic punishment), automatic
scoreboard reading with Tesseract, monthly / seasonal / all-time leaderboards, and the optional
skill-balanced and no-repeat-teammates team formation modes. See "Phase 3 features" below.

Before launch: X account linking, OAuth apps and R2/Sentry credentials, legal review of blacklist wording
(Phase 2), Playwright end-to-end tests of the sign-up → spin → payout flow.

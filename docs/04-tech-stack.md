# Tech Stack

_Companion to: Planning Document, Architecture and Design Patterns, Data Model_
_Status: Recommended stack, pending final decision_

---

## 1. Guiding Principles

- **One language across the project.** TypeScript for the web app, overlay, background worker, and Discord bot, so data types, validation rules, and business logic are shared rather than duplicated.
- **Boring, proven tools.** Widely used technologies with large communities, good documentation, and long track records.
- **Low operational overhead.** Managed hosting and services where they save meaningful time for a small team.
- **Familiarity can override.** If the team is already strong in another ecosystem (see Section 5), that ecosystem should win. Shipping matters more than the "ideal" stack.

---

## 2. Recommended Stack

| Layer                      | Choice                  | Alternatives           | Reason                                                                                                               |
| -------------------------- | ----------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Language**               | TypeScript              | —                      | Shared types and code across every component                                                                         |
| **Web framework**          | Next.js                 | Remix, SvelteKit       | Pages and API in one project; server rendering helps public listings appear in search engines                        |
| **Database**               | PostgreSQL              | —                      | Fits heavily connected data; supports permission controls needed for the append-only audit log                       |
| **Database toolkit (ORM)** | Prisma                  | Drizzle                | Type-safe database access and managed schema changes. Prisma is friendlier; Drizzle is lighter and closer to raw SQL |
| **Authentication**         | Better Auth             | Auth.js                | Built-in Discord, Twitch, and X sign-in; supports linking multiple accounts to one user                              |
| **Real-time**              | Socket.IO (self-hosted) | Ably, Pusher (managed) | Powers the overlay and live updates; managed options reduce work at a cost                                           |
| **Background jobs**        | BullMQ                  | —                      | Delayed jobs, retries, and scheduled tasks                                                                           |
| **Cache / queue store**    | Redis                   | —                      | Backs BullMQ, real-time scaling, and caching                                                                         |
| **File storage**           | Cloudflare R2           | AWS S3                 | Inexpensive storage for screenshots and evidence; R2 has no bandwidth fees                                           |
| **Discord bot**            | discord.js              | —                      | Standard TypeScript Discord library; shares the main codebase                                                        |
| **Validation**             | Zod                     | —                      | One set of validation rules shared by forms, API, and worker                                                         |
| **UI styling**             | Tailwind CSS            | —                      | Fast, consistent styling                                                                                             |
| **UI components**          | shadcn/ui               | Radix, Mantine         | Accessible base components that can be fully customized to the site's own look                                       |
| **Hosting**                | Railway                 | Render, Fly.io         | Runs the web app, worker, bot, database, and Redis together with simple setup                                        |
| **Error tracking**         | Sentry                  | —                      | Catches and reports errors from all components                                                                       |
| **Email (later)**          | Resend                  | Postmark               | Optional notifications and account messages                                                                          |

---

## 3. Component Breakdown

### 3.1 Web application (Next.js)

- Public pages: event listings, event detail pages, hoster and player profiles, public spin logs, blacklist (phase 2).
- Authenticated dashboards: hoster event management, player sign-ups, result submission and confirmation.
- Staff dashboard: report queue, dispute queue, blacklist approvals, appeals, action log, internal notes.
- API endpoints used by the dashboards and overlay.

### 3.2 Wheel overlay

- A minimal page within the web app, designed specifically for OBS browser sources (transparent background, no navigation).
- Connects to the real-time server for its event and only animates results decided by the server.

### 3.3 Real-time server

- Socket.IO server running alongside the web app, using Redis to share messages if multiple instances run.
- Viewers subscribe only to the channels for events they're viewing.
- **Managed alternative:** Ably or Pusher removes the need to run and scale this component, at a monthly cost that grows with usage. A reasonable choice if hosting the server becomes a burden.

### 3.4 Background worker

- A separate process using the same codebase, running BullMQ jobs: timers, deadline expiry, waitlist promotion, domain event processing, notifications, and Discord posts.

### 3.5 Discord bot

- Separate process using discord.js and the same codebase.
- Phase 1: posts new events to configured channels in community servers.
- Later: commands such as viewing upcoming events, checking a player's status, or receiving check-in reminders by DM.

### 3.6 Database

- Single PostgreSQL instance with all modules' tables, organized by module.
- The audit log table is protected so the application can only insert rows, never update or delete them.
- Automated daily backups with point-in-time recovery if the host supports it.

---

## 4. External Platforms

| Platform        | Usage                                                                  | Cost and notes                                                                                                                                                                                                                               |
| --------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Discord**     | Sign-in, account linking, bot                                          | Free                                                                                                                                                                                                                                         |
| **Twitch**      | Sign-in, account linking, stream links; chat bot later (e.g., `!join`) | Free                                                                                                                                                                                                                                         |
| **X (Twitter)** | Account linking; sharing via pre-filled post links                     | X's developer API is paid and has become more restrictive. **Start with free share links** (which open a pre-filled post for the user) instead of automatic posting. Verify current API access and pricing before relying on it for sign-in. |
| **Activision**  | Activision ID entered manually by players                              | **No Activision API integration.** IDs are self-entered and displayed only                                                                                                                                                                   |

---

## 5. Alternative Stacks

If the team is more experienced in another ecosystem, these would all work well for this project:

| Stack                  | Strengths                                                                              | Tradeoffs                                                                                                                                      |
| ---------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Supabase + Next.js** | Database, sign-in, file storage, and real-time bundled into one service; fastest start | Its permission system lives inside the database, which makes complex moderation rules (recusal, two-person approval) awkward to write and test |
| **Django (Python)**    | Mature, includes an admin panel useful for staff tools out of the box                  | Separate language from the frontend and Discord bot unless using discord.py                                                                    |
| **Laravel (PHP)**      | Strong built-in tools for queues, authentication, and real-time                        | Separate language from the frontend; fewer shared-code benefits                                                                                |
| **Ruby on Rails**      | Very fast for building data-heavy apps                                                 | Smaller hiring pool; separate language from the bot                                                                                            |

---

## 6. Later-Phase Tools

| Need                              | Starting option                                      | Upgrade option                                                  |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| **Screenshot text recognition**   | Tesseract (free, open-source)                        | Google Cloud Vision or AWS Textract if accuracy is insufficient |
| **Throw detection**               | Statistical comparisons run in the background worker | Dedicated analysis jobs as data grows                           |
| **Search and filtering at scale** | PostgreSQL built-in search                           | Meilisearch or Typesense if needed                              |

---

## 7. Development Tooling

| Tool                                       | Purpose                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| **pnpm with a monorepo setup (Turborepo)** | One repository containing the web app, worker, bot, and shared packages |
| **GitHub**                                 | Code hosting, pull requests, issue tracking                             |
| **GitHub Actions**                         | Automated tests and deployments                                         |
| **ESLint and Prettier**                    | Consistent code quality and formatting                                  |
| **Vitest**                                 | Unit and integration tests                                              |
| **Playwright**                             | End-to-end tests of key flows (sign-up, spin, result confirmation)      |
| **Docker Compose**                         | Running PostgreSQL and Redis locally during development                 |

---

## 8. Estimated Early Costs

Rough monthly costs at launch scale, to be verified against current pricing:

- **Hosting (app, worker, bot, database, Redis):** low tens of dollars on Railway or similar
- **File storage:** near zero at early volume
- **Sentry:** free tier likely sufficient early
- **Domain:** roughly the cost of a yearly registration
- **Managed real-time (if chosen):** free tiers may cover early usage; costs rise with concurrent viewers
- **X API (if ever used):** potentially significant; avoid initially

---

## 9. Open Decisions

- Final confirmation of TypeScript stack vs. an ecosystem the team already knows
- Prisma vs. Drizzle
- Self-hosted Socket.IO vs. managed real-time service
- Whether X sign-in is worth supporting given API restrictions, or X is linked only as a profile handle
- Hosting provider

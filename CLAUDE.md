# Working in this repo

pnpm + Turborepo monorepo. TypeScript everywhere. Read `docs/` for product and architecture intent.

## Rules that matter

- **Modules own their data.** Code in `apps/web/modules/<module>/service.ts` is the only place that
  writes that module's tables. Pages and server actions call services; they never call Prisma for
  writes directly. Logic the worker also needs (verification windows, reputation recalculation,
  expiry sweeps) lives in `packages/core` and is re-exported by the web module.
- **Every lifecycle change goes through a state machine** in `packages/shared/src/state/lifecycles.ts`
  via `assertTransition`. Add new states there first.
- **Permissions and policies live in `packages/shared/src/policy`.** Never inline a role check.
- **Side effects go through the outbox.** Inside the same `prisma.$transaction`, call
  `emit(tx, { type, ... })`; the worker reacts. Handlers must be idempotent.
- **Staff actions are logged** with `logStaffAction` and a required reason. The table is append-only
  at the database level.
- **Spins are decided on the server** with commit-reveal. The overlay only displays.
- **Never expose an unrevealed spin secret** in any public read.
- Shared enums (`packages/shared/src/enums.ts`) must match Prisma enums; `packages/db/src/enum-sync.ts`
  fails typecheck if they drift.

## Commands

```
pnpm db:generate && pnpm db:migrate     # after schema changes
pnpm typecheck && pnpm lint && pnpm test
pnpm build
```

Web integration tests need a migrated Postgres at `DATABASE_URL` (root `.env`).

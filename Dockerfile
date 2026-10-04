# syntax=docker/dockerfile:1
#
# One image runs every service; the SERVICE environment variable picks which one
# (web | worker | realtime | bot | migrate). See deploy/start.sh and docs/05-deployment.md.
#
#   docker build -t cod-events \
#     --build-arg NEXT_PUBLIC_APP_URL=https://events.example.com \
#     --build-arg NEXT_PUBLIC_REALTIME_URL=https://realtime.example.com .
#
# NEXT_PUBLIC_* values are compiled into the browser bundle, so they must be present at BUILD time.
ARG BASE_IMAGE=node:22-slim

FROM ${BASE_IMAGE} AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# No OS packages needed: Node bundles its root certificates, the Prisma client talks to Postgres
# through the pure-JS `pg` driver, and sharp ships its own libvips.
WORKDIR /app

# ── build ────────────────────────────────────────────────────────────────────
FROM base AS build
# Manifests first so dependency installs are cached until a manifest changes.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY apps/realtime/package.json apps/realtime/
COPY apps/bot/package.json apps/bot/
COPY packages/core/package.json packages/core/
COPY packages/db/package.json packages/db/
COPY packages/realtime/package.json packages/realtime/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

COPY . .

ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_REALTIME_URL=
ARG NEXT_PUBLIC_SENTRY_DSN=
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_REALTIME_URL=$NEXT_PUBLIC_REALTIME_URL \
    NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm db:generate && pnpm build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM base AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    SERVICE=web
# The whole built workspace: the Prisma CLI (migrations) and every service live in it.
# Trimming this to production dependencies only is a later size optimisation.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "deploy/healthcheck.mjs"]
ENTRYPOINT ["/app/deploy/start.sh"]

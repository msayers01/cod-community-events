#!/bin/sh
# Container entrypoint: validate the environment, then run the service named by $SERVICE.
# `exec` replaces the shell so the service receives SIGTERM directly and shuts down cleanly.
set -eu
SERVICE="${SERVICE:-web}"
cd /app

# Refuse to start a misconfigured production service, with a readable reason in the logs.
node deploy/check-env.mjs "$SERVICE"

case "$SERVICE" in
  web)
    cd apps/web
    exec node_modules/.bin/next start -H 0.0.0.0 -p "${PORT:-3000}"
    ;;
  worker)
    cd apps/worker
    exec node dist/index.js
    ;;
  realtime)
    cd apps/realtime
    # Hosts like Railway inject PORT; REALTIME_PORT wins when set explicitly.
    REALTIME_PORT="${REALTIME_PORT:-${PORT:-3001}}"
    export REALTIME_PORT
    exec node dist/index.js
    ;;
  bot)
    cd apps/bot
    exec node dist/index.js
    ;;
  migrate)
    # Applies pending migrations and exits. Run it before deploying new web/worker versions.
    cd packages/db
    exec node_modules/.bin/prisma migrate deploy
    ;;
  *)
    echo "Unknown SERVICE '$SERVICE' (expected web, worker, realtime, bot or migrate)" >&2
    exit 64
    ;;
esac

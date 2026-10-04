#!/usr/bin/env bash
# Builds the production image and brings the whole stack up from an empty database, then checks
# that it is actually serving. Run locally (needs Docker) or in CI:  deploy/smoke.sh
#
# Extra compose files can be layered with COMPOSE_EXTRA="-f other.yml" (used to adapt builds to
# restricted networks); BASE_IMAGE overrides the Node base image.
set -euo pipefail
cd "$(dirname "$0")/.."

COMPOSE="docker compose -f docker-compose.prod.yml ${COMPOSE_EXTRA:-} --env-file deploy/smoke.env -p cod-smoke"
cleanup() {
  rc=$?
  # Logs are only worth printing when something went wrong.
  [ "$rc" -eq 0 ] || $COMPOSE logs --no-color --tail 60 || true
  $COMPOSE down -v --remove-orphans >/dev/null 2>&1 || true
  exit "$rc"
}
trap cleanup EXIT

fail() { echo "SMOKE FAILED: $*" >&2; exit 1; }
# Run a one-liner inside a running service (no published ports needed).
probe() { $COMPOSE exec -T "$1" node -e "$2"; }

$COMPOSE up -d --build

echo "waiting for migrate to finish..."
for _ in $(seq 1 60); do
  state=$($COMPOSE ps -a --format '{{.Service}} {{.State}} {{.ExitCode}}' | awk '$1=="migrate"{print $2" "$3}')
  [ "$state" = "exited 0" ] && break
  case "$state" in exited\ [1-9]*) fail "migrate failed ($state)";; esac
  sleep 2
done
[ "$state" = "exited 0" ] || fail "migrate did not finish (state: ${state:-unknown})"

echo "waiting for web and realtime..."
for _ in $(seq 1 90); do
  ok=1
  for svc in web realtime; do
    s=$($COMPOSE ps --format '{{.Service}} {{.Health}}' | awk -v s=$svc '$1==s{print $2}')
    [ "$s" = "healthy" ] || ok=0
  done
  [ $ok = 1 ] && break
  sleep 2
done
[ $ok = 1 ] || fail "web/realtime never became healthy"

probe web "fetch('http://127.0.0.1:3000/api/health').then(r=>r.json()).then(j=>{if(!j.ok)process.exit(1)})" || fail "/api/health"
probe web "fetch('http://127.0.0.1:3000/').then(r=>{if(r.status!==200)process.exit(1);if(r.headers.get('x-frame-options')!=='DENY')process.exit(2)})" || fail "home page or security headers"
probe web "fetch('http://127.0.0.1:3000/sign-in').then(r=>r.text()).then(t=>{if(t.includes('Development login'))process.exit(1)})" || fail "dev login exposed in production"
$COMPOSE logs worker 2>&1 | grep -q "\[worker\] started" || fail "worker did not start"
$COMPOSE exec -T postgres psql -U cod -d cod -tAc "select count(*) from \"_prisma_migrations\"" | grep -qE '^[1-9]' || fail "no migrations recorded"

echo "SMOKE OK"

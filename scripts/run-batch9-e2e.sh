#!/bin/bash
# Batch 9 E2E runner (D1 campaigns / D2 labels / D4 shared server state / F-41 phone parity).
# Boots in ONE invocation (sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> next dev :3007 -> suite.
# All servers killed on exit. Env-tuned: login limiter raised (many logins),
# user-lookup lowered to 3 for the shared-store 429 test.
# Usage: bash scripts/run-batch9-e2e.sh
set -u
cd /home/z/my-project

cleanup() {
  pkill -f "next dev" 2>/dev/null
  pkill -f "embedded-pg-server" 2>/dev/null
  if [ -f /tmp/pg-embed/data/postmaster.pid ]; then
    kill "$(head -1 /tmp/pg-embed/data/postmaster.pid)" 2>/dev/null
  fi
  sleep 1
}
trap cleanup EXIT

if [ -f /tmp/pg-embed/data/postmaster.pid ]; then
  kill "$(head -1 /tmp/pg-embed/data/postmaster.pid)" 2>/dev/null
  sleep 2
fi
pkill -f "embedded-pg-server" 2>/dev/null
pkill -f "pg-embed" 2>/dev/null
sleep 1
rm -rf /tmp/pg-embed/data

node scripts/embedded-pg-server.mjs > /tmp/b9-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/b9-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/b9-pg.log || { echo "PG_FAILED"; tail -20 /tmp/b9-pg.log; exit 1; }
echo "== PG up =="

export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/b9-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/b9-dbpush.log; exit 1; }
echo "== schema ready =="

JWT_SECRET=b9-e2e-test-secret \
LOGIN_RATE_LIMIT_MAX=1000 \
REGISTER_RATE_LIMIT_MAX=1000 \
SEND_RATE_LIMIT_MAX=1000 \
UPLOAD_RATE_LIMIT_MAX=1000 \
USER_LOOKUP_RATE_LIMIT_MAX=3 \
RECOVERY_RATE_LIMIT_MAX=1000 \
npx next dev -p 3007 -H 127.0.0.1 > /tmp/b9-next.log 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3007/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3007/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/b9-next.log; exit 1; }
curl -s -o /dev/null --max-time 60 http://127.0.0.1:3007/api/auth/me
echo "== dev server up =="

JWT_SECRET=b9-e2e-test-secret node scripts/batch9-e2e.mjs
RC=$?
echo "== phase 1 suite exit: $RC =="
if [ "$RC" -ne 0 ]; then exit "$RC"; fi

# ── Phase 2: TOTP replay guard across RESTART and a SECOND instance ──────
# Phase 1 wrote /tmp/b9-totp-state.json (the exact consumed step + code).
# Restart instance A on :3007 (fresh process, same DB) and boot a second
# instance B on :3008 sharing the store, then prove the consumed step is
# refused on both and fresh steps still verify (batch9-e2e-phase2.mjs).
pkill -f "next dev" 2>/dev/null
sleep 2

start_dev() { # port logfile
  JWT_SECRET=b9-e2e-test-secret \
  LOGIN_RATE_LIMIT_MAX=1000 \
  REGISTER_RATE_LIMIT_MAX=1000 \
  SEND_RATE_LIMIT_MAX=1000 \
  UPLOAD_RATE_LIMIT_MAX=1000 \
  USER_LOOKUP_RATE_LIMIT_MAX=3 \
  RECOVERY_RATE_LIMIT_MAX=1000 \
  npx next dev -p "$1" -H 127.0.0.1 > "$2" 2>&1 &
}
# Instance A: the phase-1 instance RESTARTED (fresh process, same project).
start_dev 3007 /tmp/b9-next2.log
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3007/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3007/ || { echo "DEV_A_RESTART_FAILED"; tail -30 /tmp/b9-next2.log; exit 1; }

# Instance B: a TRUE second app instance — Next.js 16 allows one dev server
# per project directory, so B runs from a clone (own process + own build)
# against the SAME PostgreSQL server-state store. node_modules is hardlink-
# copied (cp -al, same filesystem) — a symlink would break Turbopack's
# filesystem-root rule; hardlinks resolve as real files.
rm -rf /tmp/b9-instance-b
mkdir -p /tmp/b9-instance-b
cp package.json package-lock.json next.config.ts tsconfig.json eslint.config.mjs postcss.config.mjs components.json /tmp/b9-instance-b/ 2>/dev/null || true
cp .env /tmp/b9-instance-b/.env 2>/dev/null || true
cp -r prisma public src /tmp/b9-instance-b/
cp -al /home/z/my-project/node_modules /tmp/b9-instance-b/node_modules
(
  cd /tmp/b9-instance-b && \
  JWT_SECRET=b9-e2e-test-secret \
  LOGIN_RATE_LIMIT_MAX=1000 \
  REGISTER_RATE_LIMIT_MAX=1000 \
  SEND_RATE_LIMIT_MAX=1000 \
  UPLOAD_RATE_LIMIT_MAX=1000 \
  USER_LOOKUP_RATE_LIMIT_MAX=3 \
  RECOVERY_RATE_LIMIT_MAX=1000 \
  DATABASE_URL="$DATABASE_URL" \
  npx next dev -p 3008 -H 127.0.0.1 > /tmp/b9-next3.log 2>&1 &
)
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3008/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3008/ || { echo "DEV_B_START_FAILED"; tail -30 /tmp/b9-next3.log; exit 1; }
echo "== two dev instances up (A=:3007 restarted, B=:3008 fresh clone) =="

B9_BASE_A=http://127.0.0.1:3007 B9_BASE_B=http://127.0.0.1:3008 \
JWT_SECRET=b9-e2e-test-secret node scripts/batch9-e2e-phase2.mjs
RC2=$?
echo "== phase 2 exit: $RC2 =="
exit "$RC2"

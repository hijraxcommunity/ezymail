#!/bin/bash
# Batch 1 security E2E runner (audit F-04/F-05/F-06/F-07/F-11/F-18/F-32).
# Boots in ONE invocation (sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> next dev :3005 -> suite.
# All servers killed on exit. Rate limits env-tuned for the harness:
# login (shared IP) raised, register/send/upload lowered for fast 429 tests.
# Usage: bash scripts/run-auth-e2e.sh
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

node scripts/embedded-pg-server.mjs > /tmp/auth-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/auth-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/auth-pg.log || { echo "PG_FAILED"; tail -20 /tmp/auth-pg.log; exit 1; }
echo "== PG up =="

export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/auth-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/auth-dbpush.log; exit 1; }
echo "== schema ready =="

JWT_SECRET=e2e-auth-test-secret \
LOGIN_RATE_LIMIT_MAX=1000 \
REGISTER_RATE_LIMIT_MAX=3 \
SEND_RATE_LIMIT_MAX=4 \
UPLOAD_RATE_LIMIT_MAX=3 \
npx next dev -p 3005 -H 127.0.0.1 > /tmp/auth-next.log 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/auth-next.log; exit 1; }
# pre-warm the routes the suite hits (NOT /api/auth/register — the register
# limiter test needs its full 3-attempt budget)
curl -s -o /dev/null --max-time 60 http://127.0.0.1:3005/api/auth/me
curl -s -o /dev/null --max-time 60 "http://127.0.0.1:3005/api/emails?folder=inbox&page=1&limit=20"
echo "== dev server up =="

node scripts/auth-security-e2e.mjs
RC=$?
echo "== suite exit: $RC =="
exit $RC

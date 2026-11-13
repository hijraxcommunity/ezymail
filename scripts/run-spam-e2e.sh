#!/bin/bash
# Scratch E2E runner for the spam->trash owner report (2026-11-13).
# Boots in ONE invocation (sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> next dev :3005 -> suite.
# All servers are killed on exit. NEVER committed intent: scratch runner.
# Usage: bash scripts/run-spam-e2e.sh scripts/spam-trash-e2e.mjs
set -u
cd /home/z/my-project

TEST_FILE="$1"

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

node scripts/embedded-pg-server.mjs > /tmp/spam-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/spam-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/spam-pg.log || { echo "PG_FAILED"; tail -20 /tmp/spam-pg.log; exit 1; }
echo "== PG up =="

export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/spam-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/spam-dbpush.log; exit 1; }
echo "== schema ready =="

JWT_SECRET=e2e-spam-test-secret-0192 \
npx next dev -p 3005 -H 127.0.0.1 > /tmp/spam-next.log 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/spam-next.log; exit 1; }
# pre-warm the routes the suite hits
curl -s -o /dev/null --max-time 60 -X POST http://127.0.0.1:3005/api/auth/register -H 'Content-Type: application/json' -d '{}'
curl -s -o /dev/null --max-time 60 "http://127.0.0.1:3005/api/emails?folder=spam&page=1&limit=20"
echo "== dev server up =="

node "$TEST_FILE"
RC=$?
echo "== suite exit: $RC =="
exit $RC

#!/bin/bash
# Trash-deletion E2E runner (owner spec: deleting from ANY mailbox page must
# move the mail to Trash; restore returns the PREVIOUS mailbox state; drafts
# restore as drafts; sent copies restore as sent; permanent delete explicit).
# Boots in ONE invocation (sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> next dev :3005 -> suite.
# All servers killed on exit. Rate limits env-raised for the harness.
# Usage: bash scripts/run-trash-deletion-e2e.sh
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

node scripts/embedded-pg-server.mjs > /tmp/trash-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/trash-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/trash-pg.log || { echo "PG_FAILED"; tail -20 /tmp/trash-pg.log; exit 1; }
echo "== PG up =="

export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/trash-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/trash-dbpush.log; exit 1; }
echo "== schema ready =="

JWT_SECRET=e2e-trash-test-secret \
CRON_SECRET=e2e-trash-cron-secret \
LOGIN_RATE_LIMIT_MAX=1000 \
REGISTER_RATE_LIMIT_MAX=200 \
SEND_RATE_LIMIT_MAX=100 \
UPLOAD_RATE_LIMIT_MAX=100 \
npx next dev -p 3005 -H 127.0.0.1 > /tmp/trash-next.log 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/trash-next.log; exit 1; }
# pre-warm the routes the suite hits (compiles them once, incl. the new
# empty-trash endpoint and the trash list view)
curl -s -o /dev/null --max-time 60 http://127.0.0.1:3005/api/auth/me
curl -s -o /dev/null --max-time 60 "http://127.0.0.1:3005/api/emails?folder=trash&page=1&limit=20"
curl -s -o /dev/null --max-time 60 -X POST "http://127.0.0.1:3005/api/emails/empty-trash"
echo "== dev server up =="

node scripts/trash-deletion-e2e.mjs
RC=$?
echo "== suite exit: $RC =="
exit $RC

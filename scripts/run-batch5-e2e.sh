#!/bin/bash
# Batch 5 E2E runner (audit F-20/F-21/F-33/F-34/F-35/F-36/F-37/F-61/F-62).
# Boots in ONE invocation (sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> next dev :3006 -> suite.
# All servers killed on exit. Rate limits env-raised for the harness (shared
# egress IP). Usage: bash scripts/run-batch5-e2e.sh
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

node scripts/embedded-pg-server.mjs > /tmp/b5-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/b5-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/b5-pg.log || { echo "PG_FAILED"; tail -20 /tmp/b5-pg.log; exit 1; }
echo "== PG up =="

export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/b5-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/b5-dbpush.log; exit 1; }
echo "== schema ready =="

JWT_SECRET=e2e-b5-test-secret \
CRON_SECRET=e2e-b5-cron-secret \
LOGIN_RATE_LIMIT_MAX=1000 \
REGISTER_RATE_LIMIT_MAX=200 \
SEND_RATE_LIMIT_MAX=100 \
UPLOAD_RATE_LIMIT_MAX=100 \
npx next dev -p 3006 -H 127.0.0.1 > /tmp/b5-next.log 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3006/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3006/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/b5-next.log; exit 1; }
# pre-warm the routes the suite hits (compiles them once)
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3006/api/auth/me
curl -s -o /dev/null --max-time 90 "http://127.0.0.1:3006/api/emails?folder=inbox&page=1&limit=20"
curl -s -o /dev/null --max-time 90 "http://127.0.0.1:3006/api/emails?folder=drafts&page=1&limit=20"
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3006/api/rules
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3006/api/user/export
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3006/api/business/analytics
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3006/api/business/team
echo "== dev server up =="

node scripts/batch5-e2e.mjs
RC=$?
echo "== suite exit: $RC =="
exit $RC

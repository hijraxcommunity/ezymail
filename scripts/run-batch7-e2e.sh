#!/bin/bash
# Batch 7 E2E runner (audit-verification batch: F-32r/F-38/F-39/F-40/F-41/
# F-44/F-46/F-49/F-50/F-51/F-52/F-53/F-63/F-64/F-65/F-66/F-67/S-09).
# Boots in ONE invocation (sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> next dev :3007 -> suite.
# All servers killed on exit. New Batch-7 limiters env-raised for the
# harness EXCEPT check-email (6, the 429 test needs a low ceiling) and
# rule-run (2, the 429 test needs a low ceiling). Usage:
#   bash scripts/run-batch7-e2e.sh
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

node scripts/embedded-pg-server.mjs > /tmp/b7-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/b7-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/b7-pg.log || { echo "PG_FAILED"; tail -20 /tmp/b7-pg.log; exit 1; }
echo "== PG up =="

export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/b7-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/b7-dbpush.log; exit 1; }
echo "== schema ready =="

JWT_SECRET=e2e-b7-test-secret \
CRON_SECRET=e2e-b7-cron-secret \
LOGIN_RATE_LIMIT_MAX=1000 \
REGISTER_RATE_LIMIT_MAX=200 \
SEND_RATE_LIMIT_MAX=100 \
UPLOAD_RATE_LIMIT_MAX=100 \
CHECK_EMAIL_RATE_LIMIT_MAX=6 \
USER_LOOKUP_RATE_LIMIT_MAX=100 \
PUSH_SUBSCRIBE_RATE_LIMIT_MAX=100 \
RULE_RUN_RATE_LIMIT_MAX=2 \
npx next dev -p 3007 -H 127.0.0.1 > /tmp/b7-next.log 2>&1 &
for i in $(seq 1 150); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3007/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3007/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/b7-next.log; exit 1; }
# pre-warm the routes the suite hits (compiles them once)
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/auth/me
curl -s -o /dev/null --max-time 90 "http://127.0.0.1:3007/api/emails?folder=inbox&page=1&limit=20"
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/folders
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/user/sessions
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/rules
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/admin/stats
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/business/customers
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/business/campaigns
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/business/verification
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/auth/check-email?email=warmup@ezy.af
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/users/lookup?email=warmup@ezy.af
curl -s -o /dev/null --max-time 90 http://127.0.0.1:3007/api/push/subscribe
echo "== dev server up =="

node scripts/batch7-e2e.mjs
RC=$?
echo "== suite exit: $RC =="
exit $RC

#!/bin/bash
# Scratch E2E runner for the committed WhatsApp OTP test suite. NEVER committed.
# Boots (in ONE invocation — sandbox kills background servers between calls):
#   embedded PostgreSQL :5433 -> prisma db push -> mock OpenWA :2785 -> next dev :3005
# then runs the given test file. All servers are killed on exit.
# Usage: bash scripts/run-otp-e2e.sh <test-file.mjs>
set -u
cd /home/z/my-project

TEST_FILE="$1"

cleanup() {
  pkill -f "next dev" 2>/dev/null
  pkill -f "mock-openwa" 2>/dev/null
  pkill -f "embedded-pg-server" 2>/dev/null
  if [ -f /tmp/pg-embed/data/postmaster.pid ]; then
    kill "$(head -1 /tmp/pg-embed/data/postmaster.pid)" 2>/dev/null
  fi
  sleep 1
}
trap cleanup EXIT

# kill any stale postmaster on 5433 left by earlier sessions
if [ -f /tmp/pg-embed/data/postmaster.pid ]; then
  kill "$(head -1 /tmp/pg-embed/data/postmaster.pid)" 2>/dev/null
  sleep 2
fi
pkill -f "embedded-pg-server" 2>/dev/null
pkill -f "pg-embed" 2>/dev/null
sleep 1
rm -rf /tmp/pg-embed/data

# 1) embedded PostgreSQL
node scripts/embedded-pg-server.mjs > /tmp/otp-pg.log 2>&1 &
for i in $(seq 1 90); do grep -q PG_READY /tmp/otp-pg.log 2>/dev/null && break; sleep 1; done
grep -q PG_READY /tmp/otp-pg.log || {
  # one retry after a hard port cleanup
  pkill -f "postgres.*pg-embed" 2>/dev/null; sleep 3; rm -rf /tmp/pg-embed/data
  node scripts/embedded-pg-server.mjs > /tmp/otp-pg.log 2>&1 &
  for i in $(seq 1 60); do grep -q PG_READY /tmp/otp-pg.log 2>/dev/null && break; sleep 1; done
}
grep -q PG_READY /tmp/otp-pg.log || { echo "PG_FAILED"; tail -20 /tmp/otp-pg.log; exit 1; }
echo "== PG up =="

# 2) schema + client
export DATABASE_URL='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
npx prisma db push --skip-generate > /tmp/otp-dbpush.log 2>&1 || { echo "DB_PUSH_FAILED"; tail -20 /tmp/otp-dbpush.log; exit 1; }
npx prisma generate > /tmp/otp-gen.log 2>&1 || { echo "PRISMA_GENERATE_FAILED"; tail -20 /tmp/otp-gen.log; exit 1; }
echo "== schema ready =="

# 3) mock OpenWA gateway
node scripts/mock-openwa.mjs > /tmp/otp-mock.log 2>&1 &
for i in $(seq 1 15); do grep -q MOCK_OPENWA_READY /tmp/otp-mock.log 2>/dev/null && break; sleep 1; done
grep -q MOCK_OPENWA_READY /tmp/otp-mock.log || { echo "MOCK_FAILED"; tail -10 /tmp/otp-mock.log; exit 1; }
echo "== mock OpenWA up =="

# 4) dev server with test env
JWT_SECRET=e2e-otp-test-secret-0192 \
OPENWA_API_URL=http://127.0.0.1:2785 \
OPENWA_API_KEY=test-gateway-key \
OPENWA_SESSION_ID=ezymail-test \
npx next dev -p 3005 -H 127.0.0.1 > /tmp/otp-next.log 2>&1 &
for i in $(seq 1 120); do curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ && break; sleep 1; done
curl -s -o /dev/null --max-time 2 http://127.0.0.1:3005/ || { echo "DEV_SERVER_FAILED"; tail -30 /tmp/otp-next.log; exit 1; }
# pre-warm the API route compilation
curl -s -o /dev/null --max-time 30 -X POST http://127.0.0.1:3005/api/auth/verify-phone -H 'Content-Type: application/json' -d '{}'
echo "== dev server up =="

# 5) run the suite
node "$TEST_FILE"
RC=$?
echo "== suite exit: $RC =="
exit $RC

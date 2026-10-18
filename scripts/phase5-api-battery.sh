#!/usr/bin/env bash
# =============================================================================
# EzyMail Phase 5 — API regression battery (rebuild of swept phase2-run.sh)
# Isolated rig: local sqlite + dummy secrets. ZERO contact with production.
# Run:  bash scripts/phase5-api-battery.sh
# Teardown is automatic (trap): .env and prisma/schema.prisma restored byte-exact.
# =============================================================================
set -u
cd "$(dirname "$0")/.." || exit 1

ROOT="$(pwd)"
LOG=/tmp/battery-server.log
PORT=3100
BASE="http://localhost:$PORT"
PASS=0; FAIL=0; FAILED_NAMES=""

say()  { printf '%s\n' "$*"; }
ok()   { PASS=$((PASS+1)); say "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); FAILED_NAMES="$FAILED_NAMES\n    - $1"; say "  FAIL: $1"; }
check(){ # check <name> <condition-exit-code>
  if [ "$2" -eq 0 ]; then ok "$1"; else bad "$1"; fi
}

JAR1=/tmp/battery-jar1.txt; JAR2=/tmp/battery-jar2.txt
rm -f "$JAR1" "$JAR2" "$LOG"

# ---------- guard: refuse if a server is already on PORT ----------
if curl -s -o /dev/null --max-time 2 "$BASE"; then
  say "Port $PORT already serving — aborting to avoid cross-contamination."; exit 1
fi

# ---------- protect real env/schema ----------
cp .env /tmp/battery-env-backup
cp prisma/schema.prisma /tmp/battery-schema-backup
cleanup() {
  say ""
  say "== teardown =="
  # kill the npm wrapper AND its next-server child (process renames to next-server)
  [ -n "${SERVER_PID:-}" ] && kill "$SERVER_PID" 2>/dev/null
  pkill -f "next-server" 2>/dev/null
  sleep 1
  say "server killed"
  cp /tmp/battery-env-backup .env       && say ".env restored"
  cp /tmp/battery-schema-backup prisma/schema.prisma && say "schema restored"
  rm -f "$ROOT/db/battery.db" "$JAR1" "$JAR2"
  node_modules/.bin/prisma generate >/dev/null 2>&1 && say "prisma client regenerated (postgresql)"
}
trap cleanup EXIT

# ---------- rig env (dummy secrets ONLY) ----------
# ABSOLUTE file path + exported: env beats .env AND beats any stale shell
# DATABASE_URL (anomaly: shell/export carries file:...db/custom.db)
export DATABASE_URL="file:$ROOT/db/battery.db"
cat > .env <<'EOF'
DATABASE_URL="file:./db/battery.db"
JWT_SECRET=battery-only-dummy-secret
CRON_SECRET=battery-dummy
FIREBASE_SERVICE_ACCOUNT_KEY={"client_email":"battery@battery.iam.gserviceaccount.com","private_key":"FAKEKEY"}
NEXT_PUBLIC_FIREBASE_VAPID_KEY=battery-dummy-vapid-key-0000000000000000
EOF
sed -i 's/provider = "postgresql"/provider = "sqlite"/' prisma/schema.prisma
rm -f "$ROOT/db/battery.db"
node_modules/.bin/prisma db push --skip-generate >/dev/null 2>&1 || { say "prisma db push failed"; exit 1; }
node_modules/.bin/prisma generate >/dev/null 2>&1 || { say "prisma generate failed"; exit 1; }
say "rig ready (sqlite + dummy secrets)"

# ---------- build & start server ----------
say "building…"
npm run build > /tmp/battery-build.log 2>&1 || { say "BUILD FAILED (see /tmp/battery-build.log)"; exit 1; }
PORT=$PORT npm start > "$LOG" 2>&1 &
SERVER_PID=$!
for i in $(seq 1 30); do
  curl -s -o /dev/null --max-time 2 "$BASE" && break
  sleep 1
done
curl -s -o /dev/null "$BASE" || { say "server did not start"; exit 1; }
[ -f "$ROOT/db/battery.db" ] || { say "SAFETY ABORT: rig db not in use — runtime resolved a different DATABASE_URL"; exit 1; }
say "server up (pid $SERVER_PID), rig db confirmed in use"

D1=$(date +%s)
# =========== 1. subscribe auth ===========
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/push/subscribe" -H 'Content-Type: application/json' -d '{"fcmToken":"tok-noauth","platform":"web"}')
[ "$code" = "401" ]; check "A1 subscribe without cookie -> 401" $?

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/push/subscribe" -H 'Content-Type: application/json' -H 'Cookie: ezymail-session=forged.token.value' -d '{"fcmToken":"tok-forged","platform":"web"}')
[ "$code" = "401" ]; check "A2 subscribe forged cookie -> 401" $?

# =========== 2. two users ===========
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d '{"firstName":"Battery","lastName":"One","dateOfBirth":"1995-05-05","email":"battery1@ezy.af","password":"BatteryPass1"}')
[ "$code" = "200" ] || [ "$code" = "201" ]; check "A3 register user1 -> 2xx ($code)" $?

code=$(curl -s -c "$JAR1" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"battery1@ezy.af","password":"BatteryPass1"}')
[ "$code" = "200" ]; check "A4 login user1 -> 200 + cookie" $?

curl -s -o /dev/null -X POST "$BASE/api/auth/register" -H 'Content-Type: application/json' \
  -d '{"firstName":"Battery","lastName":"Two","dateOfBirth":"1995-06-06","email":"battery2@ezy.af","password":"BatteryPass2"}'
code=$(curl -s -c "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/auth/login" -H 'Content-Type: application/json' -d '{"email":"battery2@ezy.af","password":"BatteryPass2"}')
[ "$code" = "200" ]; check "A5 register+login user2" $?

# =========== 3. subscriptions ===========
code=$(curl -s -b "$JAR1" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/push/subscribe" -H 'Content-Type: application/json' -d '{"fcmToken":"tok-u1-android","deviceInfo":"battery-rig","platform":"android"}')
[ "$code" = "200" ]; check "A6 subscribe user1 token -> 200" $?

code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/push/subscribe" -H 'Content-Type: application/json' -d '{"fcmToken":"tok-u2-web","deviceInfo":"battery-rig","platform":"web"}')
[ "$code" = "200" ]; check "A7 subscribe user2 token -> 200" $?

# =========== 4. compose -> push trigger (post-response after()) ===========
MARKER=$(wc -l < "$LOG")
code=$(curl -s -b "$JAR2" -o /tmp/battery-compose.json -w "%{http_code}" -X POST "$BASE/api/emails" -H 'Content-Type: application/json' \
  -d '{"to":"battery1@ezy.af","subject":"Battery Hello","body":"Phase5 battery body"}')
[ "$code" = "200" ] || [ "$code" = "201" ]; check "A8 compose user2->user1 -> 2xx ($code)" $?

sleep 4
sed -n "${MARKER},\$p" "$LOG" | grep -q "Sending to 1 token(s)"; check "A9 post-response push dispatch logged (1 token)" $?

sed -n "${MARKER},\$p" "$LOG" | grep -qE "Failed to get access token|Send failed for token|FCM API error|Failed to send push notification"; check "A10 FCM boundary reached, safe-fail with dummy creds" $?

curl -s -b "$JAR1" "$BASE/api/emails?folder=inbox" | grep -q "Battery Hello"; check "A11 email delivered to recipient inbox (no rollback after push failure)" $?

# =========== 5. reply path pushes ===========
EMAIL_ID=$(node -e "try{const d=require('/tmp/battery-compose.json');const e=d.email||d.emails?.[0]||d.data?.email||d;console.log(e.id||'')}catch(e){console.log('')}")
if [ -z "$EMAIL_ID" ]; then
  EMAIL_ID=$(curl -s -b "$JAR1" "$BASE/api/emails?folder=inbox" | node -e "let s='';process.stdin.on('data',c=>s+=c).on('end',()=>{try{const d=JSON.parse(s);const list=d.emails||d;console.log((list.find?list.find(x=>x.subject==='Battery Hello'):list[0]).id)}catch(e){console.log('')}})")
fi
[ -n "$EMAIL_ID" ]; check "A12 resolved composed email id from API" $?

MARKER=$(wc -l < "$LOG")
code=$(curl -s -b "$JAR1" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/emails/$EMAIL_ID/reply" -H 'Content-Type: application/json' -d '{"body":"Battery reply body"}')
[ "$code" = "200" ] || [ "$code" = "201" ]; check "A13 reply -> 2xx ($code)" $?

sleep 4
sed -n "${MARKER},\$p" "$LOG" | grep -q "Sending to 1 token(s)"; check "A14 reply-path push dispatch logged" $?

# =========== 6. preferences gate ===========
curl -s -b "$JAR2" -o /dev/null -X PUT "$BASE/api/user/profile" -H 'Content-Type: application/json' -d '{"preferences":{"desktopNotif":false}}'
MARKER=$(wc -l < "$LOG")
curl -s -b "$JAR1" -o /dev/null -X POST "$BASE/api/emails" -H 'Content-Type: application/json' \
  -d '{"to":"battery2@ezy.af","subject":"Battery PrefsGate","body":"should not push"}'
sleep 4
sed -n "${MARKER},\$p" "$LOG" | grep -q "desktop notifications disabled"; check "A15 prefs gate skips push (desktopNotif=false)" $?

# =========== 7. scheduled send = no push ===========
MARKER=$(wc -l < "$LOG")
code=$(curl -s -b "$JAR2" -o /dev/null -w "%{http_code}" -X POST "$BASE/api/emails" -H 'Content-Type: application/json' \
  -d "{\"to\":\"battery1@ezy.af\",\"subject\":\"Battery Scheduled\",\"body\":\"later\",\"scheduledAt\":\"$(date -u -d '+1 day' +%Y-%m-%dT%H:%M:%S.000Z)\"}")
[ "$code" = "200" ] || [ "$code" = "201" ]; check "A16 scheduled compose -> 2xx ($code)" $?
sleep 4
sed -n "${MARKER},\$p" "$LOG" | grep -q "Sending to"; NO_PUSH=$?
[ "$NO_PUSH" -ne 0 ]; check "A17 scheduled send produced NO push dispatch" $?

# =========== 8. ownership-scoped unsubscribe + counts ===========
COUNT_BEFORE=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.count().then(n=>{console.log(n);return p.\$disconnect()})")
curl -s -b "$JAR1" -o /dev/null -X POST "$BASE/api/push/unsubscribe" -H 'Content-Type: application/json' -d '{"fcmToken":"tok-u2-web"}'
COUNT_AFTER=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.count().then(n=>{console.log(n);return p.\$disconnect()})")
[ "$COUNT_BEFORE" = "$COUNT_AFTER" ] && [ "$COUNT_AFTER" = "2" ]; check "A18 cross-user unsubscribe denied (rows still 2: $COUNT_BEFORE->$COUNT_AFTER)" $?

curl -s -b "$JAR1" -o /dev/null -X POST "$BASE/api/push/unsubscribe" -H 'Content-Type: application/json' -d '{"fcmToken":"tok-u1-android"}'
COUNT_FINAL=$(node -e "const {PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.pushSubscription.count().then(n=>{console.log(n);return p.\$disconnect()})")
[ "$COUNT_FINAL" = "1" ]; check "A19 own unsubscribe removes own row only (count=1)" $?

MARKER=$(wc -l < "$LOG")
curl -s -b "$JAR2" -o /dev/null -X POST "$BASE/api/emails" -H 'Content-Type: application/json' \
  -d '{"to":"battery1@ezy.af","subject":"Battery NoSubs","body":"nobody subscribed"}'
sleep 4
sed -n "${MARKER},\$p" "$LOG" | grep -q "No push subscriptions found"; check "A20 zero-subscriber dispatch logged (no-op)" $?

# =========== 9. unauthorized profile isolation (no cross-account leak) ===========
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/user/profile")
[ "$code" = "401" ]; check "A21 profile without cookie -> 401 (no fallback)" $?

# =========== summary ===========
say ""
say "=========================================="
say "BATTERY RESULT: PASS=$PASS FAIL=$FAIL"
[ "$FAIL" -gt 0 ] && { say "failed cases:$FAILED_NAMES"; exit 1; }
say "ALL GREEN"
exit 0

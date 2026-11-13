#!/usr/bin/env bash
# SCRATCH-DB DEMO — full dry-run proof for scripts/backfill-thread-keys.ts
# against an ephemeral embedded PostgreSQL (127.0.0.1:5433/ezymail_test).
# NOT production. The DB directory is wiped at the start of every run.
set -u
cd /home/z/my-project

rm -rf /tmp/pg-embed
node scripts/embedded-pg-server.mjs > /tmp/pg.log 2>&1 &
PGPID=$!
for i in $(seq 1 90); do ss -tln 2>/dev/null | rg -q ':5433' && break; sleep 1; done
ss -tln 2>/dev/null | rg -q ':5433' || { echo 'PG never came up'; tail -5 /tmp/pg.log; exit 1; }

SUPER='postgresql://ezymail:ezymail-test@127.0.0.1:5433/ezymail_test'
RO='postgresql://dryrun_ro:ro123@127.0.0.1:5433/ezymail_test'

echo '─── [1] push production schema into scratch PG ───'
DATABASE_URL=$SUPER npx prisma db push --skip-generate 2>&1 | tail -2

echo '─── [2] seed legacy-fork fixtures ───'
DATABASE_URL=$SUPER npx tsx scripts/backfill-demo-seed.ts

echo '─── [3] create SELECT-only guard role ───'
DATABASE_URL=$SUPER npx tsx scripts/backfill-demo-grants.ts

echo '─── [4] snapshot BEFORE ───'
DATABASE_URL=$SUPER npx tsx scripts/backfill-demo-snapshot.ts /tmp/before.json

echo '─── [5] DRY-RUN all mailboxes — CLI runs as dryrun_ro (SELECT-only) ───'
DATABASE_URL=$RO npx tsx scripts/backfill-thread-keys.ts
echo "(exit=$?)"

echo '─── [6] DRY-RUN scoped: --mailbox=bob@ezy.af ───'
DATABASE_URL=$RO npx tsx scripts/backfill-thread-keys.ts --mailbox=bob@ezy.af
echo "(exit=$?)"

echo '─── [7] DRY-RUN scoped: --mailbox=carol@ezy.af (empty mailbox) ───'
DATABASE_URL=$RO npx tsx scripts/backfill-thread-keys.ts --mailbox=carol@ezy.af
echo "(exit=$?)"

echo '─── [8] DRY-RUN scoped: --mailbox=nobody@ezy.af (unknown mailbox) ───'
DATABASE_URL=$RO npx tsx scripts/backfill-thread-keys.ts --mailbox=nobody@ezy.af
echo "(exit=$?)"

echo '─── [9] snapshot AFTER ───'
DATABASE_URL=$SUPER npx tsx scripts/backfill-demo-snapshot.ts /tmp/after.json

python3 - <<'PYEOF'
import json
b = json.load(open('/tmp/before.json'))
a = json.load(open('/tmp/after.json'))
if b == a:
    print('WRITE-CHECK: before/after snapshots BYTE-IDENTICAL — zero rows touched')
else:
    bu, au = b['emails'], a['emails']
    bi = {r['id']: r for r in bu}; ai = {r['id']: r for r in au}
    for rid in sorted(set(bi) | set(ai)):
        if bi.get(rid) != ai.get(rid):
            print('DRIFT', rid, bi.get(rid), '->', ai.get(rid))
    print('WRITE-CHECK: FAILED')
PYEOF

kill $PGPID 2>/dev/null
echo '─── done (scratch PG torn down) ───'

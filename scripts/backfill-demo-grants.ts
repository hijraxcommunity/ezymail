/**
 * SCRATCH-DB DEMO GUARD — creates a SELECT-only role and hands it to the
 * dry-run. Running the backfill CLI as this role makes the read-only claim
 * provable: ANY write attempt would be rejected by PostgreSQL itself.
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  await db.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dryrun_ro') THEN
      CREATE ROLE dryrun_ro LOGIN PASSWORD 'ro123';
    END IF;
  END $$;`)
  await db.$executeRawUnsafe(`GRANT CONNECT ON DATABASE ezymail_test TO dryrun_ro`)
  await db.$executeRawUnsafe(`GRANT USAGE ON SCHEMA public TO dryrun_ro`)
  await db.$executeRawUnsafe(`GRANT SELECT ON ALL TABLES IN SCHEMA public TO dryrun_ro`)
  await db.$executeRawUnsafe(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO dryrun_ro`)
  console.log('RO GUARD: dryrun_ro has SELECT-only access')
  await db.$disconnect()
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1) })

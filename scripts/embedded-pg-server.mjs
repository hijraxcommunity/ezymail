/**
 * Test-only embedded PostgreSQL launcher (never deployed).
 * Starts a real Postgres on 127.0.0.1:5433 with a dedicated test database.
 */
import EmbeddedPostgres from 'embedded-postgres';

const pg = new EmbeddedPostgres({
  databaseDir: '/tmp/pg-embed/data',
  user: 'ezymail',
  password: 'ezymail-test',
  port: 5433,
  persistent: false,
});

async function main() {
  await pg.initialise();
  await pg.start();
  try {
    await pg.createDatabase('ezymail_test');
  } catch {
    // already exists
  }
  console.log('PG_READY');
  // keep running until killed
  process.on('SIGINT', async () => { await pg.stop(); process.exit(0); });
  process.on('SIGTERM', async () => { await pg.stop(); process.exit(0); });
  setInterval(() => {}, 1 << 30);
}

main().catch((e) => { console.error('PG_FAIL', e); process.exit(1); });

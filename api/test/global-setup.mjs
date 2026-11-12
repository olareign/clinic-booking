// Starts a real, throwaway Postgres for the e2e tests (no Docker or local install needed).
import EmbeddedPostgres from 'embedded-postgres';
import { rmSync } from 'fs';

export const TEST_PG_PORT = 54329;

export default async function globalSetup() {
  rmSync('.pg-test', { recursive: true, force: true });
  const pg = new EmbeddedPostgres({
    databaseDir: '.pg-test',
    user: 'postgres',
    password: 'postgres',
    port: TEST_PG_PORT,
    persistent: false,
    onLog: () => {},
  });
  await pg.initialise();
  await pg.start();
  globalThis.__PG__ = pg;
}

import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}

// Catch the common Railway misconfig: an unresolved ${{Postgres.DATABASE_URL}}
// reference makes postgres-js silently fall back to localhost.
let host;
try {
  host = new URL(url).hostname;
} catch {
  console.error(
    `DATABASE_URL is not a valid postgres URL (got: ${JSON.stringify(url)}).\n` +
      'On Railway this usually means the ${{Postgres.DATABASE_URL}} reference did not ' +
      'resolve — check the Postgres service name matches the reference.'
  );
  process.exit(1);
}
if ((host === 'localhost' || host === '127.0.0.1' || host === '::1') && process.env.NODE_ENV === 'production') {
  console.error(
    `DATABASE_URL points at localhost (${host}) in production. The Railway Postgres ` +
      'reference is not wired up — set DATABASE_URL to ${{Postgres.DATABASE_URL}} ' +
      'with the correct service name.'
  );
  process.exit(1);
}
console.log(`Running migrations against ${host}...`);

const client = postgres(url, { max: 1 });
const db = drizzle(client);

await migrate(db, { migrationsFolder: './drizzle' });
await client.end();
console.log('Migrations applied.');

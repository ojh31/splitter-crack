import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema.js';

// Lazily connect so importing this module during `vite build` (which only
// inspects exports) doesn't require DATABASE_URL to be set.
let _db;
function getDb() {
  if (!_db) {
    if (!env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
    }
    _db = drizzle(postgres(env.DATABASE_URL), { schema });
  }
  return _db;
}

export const db = new Proxy(
  {},
  {
    get(_t, prop) {
      const real = getDb();
      const val = real[prop];
      return typeof val === 'function' ? val.bind(real) : val;
    }
  }
);

export { schema };

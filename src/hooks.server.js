import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db/index.js';
import { SESSION_COOKIE, readSession } from '$lib/server/auth.js';

export async function handle({ event, resolve }) {
  const userId = readSession(event.cookies.get(SESSION_COOKIE));
  if (userId) {
    const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) });
    event.locals.user = user ?? null;
  } else {
    event.locals.user = null;
  }
  return resolve(event);
}

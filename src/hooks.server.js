import { eq } from 'drizzle-orm';
import { db, schema } from '$lib/server/db/index.js';
import { SESSION_COOKIE, readSession } from '$lib/server/auth.js';

export async function handle({ event, resolve }) {
  const memberId = readSession(event.cookies.get(SESSION_COOKIE));
  if (memberId) {
    const member = await db.query.members.findFirst({
      where: eq(schema.members.id, memberId)
    });
    event.locals.member = member ?? null;
  } else {
    event.locals.member = null;
  }
  return resolve(event);
}

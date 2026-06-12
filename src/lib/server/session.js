import { db, schema } from '$lib/server/db/index.js';
import { newToken, makeSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth.js';

/**
 * Return the current user, creating one (and setting the session cookie) if the
 * visitor isn't signed in yet. Used wherever an action needs an identity, e.g.
 * creating or joining a group.
 * @returns {Promise<{ id: string, loginToken: string }>}
 */
export async function ensureUser(locals, cookies) {
  if (locals.user) return locals.user;
  const [user] = await db
    .insert(schema.users)
    .values({ loginToken: newToken() })
    .returning();
  cookies.set(SESSION_COOKIE, makeSession(user.id), cookieOptions);
  locals.user = user;
  return user;
}

import { eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { makeSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth.js';

// Personal "magic link": opening it on any device signs you in as that user,
// giving access to all of their groups. Lands on the group list.
export async function GET({ params, cookies }) {
  const user = await db.query.users.findFirst({
    where: eq(schema.users.loginToken, params.loginToken)
  });
  if (!user) throw error(404, 'Login link not found');

  cookies.set(SESSION_COOKIE, makeSession(user.id), cookieOptions);
  throw redirect(303, '/');
}

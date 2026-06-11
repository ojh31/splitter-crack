import { eq } from 'drizzle-orm';
import { error, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { makeSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth.js';

// Personal "magic link": opening it on any device signs you in as that member.
export async function GET({ params, cookies }) {
  const member = await db.query.members.findFirst({
    where: eq(schema.members.loginToken, params.loginToken)
  });
  if (!member) throw error(404, 'Login link not found');

  cookies.set(SESSION_COOKIE, makeSession(member.id), cookieOptions);
  throw redirect(303, `/g/${member.groupId}`);
}

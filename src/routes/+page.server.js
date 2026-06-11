import { fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { newToken, makeSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth.js';

export function load({ locals }) {
  return { member: locals.member };
}

export const actions = {
  create: async ({ request, cookies }) => {
    const form = await request.formData();
    const groupName = String(form.get('groupName') ?? '').trim();
    const yourName = String(form.get('yourName') ?? '').trim();
    if (!groupName || !yourName) {
      return fail(400, { error: 'Both a group name and your name are required.' });
    }

    const [group] = await db
      .insert(schema.groups)
      .values({ name: groupName, inviteToken: newToken() })
      .returning();

    const [member] = await db
      .insert(schema.members)
      .values({ groupId: group.id, name: yourName, loginToken: newToken() })
      .returning();

    cookies.set(SESSION_COOKIE, makeSession(member.id), cookieOptions);
    throw redirect(303, `/g/${group.id}`);
  }
};

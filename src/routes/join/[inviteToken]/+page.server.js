import { eq } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { newToken, makeSession, SESSION_COOKIE, cookieOptions } from '$lib/server/auth.js';

async function groupByInvite(inviteToken) {
  return db.query.groups.findFirst({
    where: eq(schema.groups.inviteToken, inviteToken)
  });
}

export async function load({ params, locals }) {
  const group = await groupByInvite(params.inviteToken);
  if (!group) throw error(404, 'Invite link not found');
  // Already signed in to this group? Skip straight there.
  if (locals.member && locals.member.groupId === group.id) {
    throw redirect(303, `/g/${group.id}`);
  }
  return { groupName: group.name };
}

export const actions = {
  default: async ({ request, params, cookies }) => {
    const group = await groupByInvite(params.inviteToken);
    if (!group) throw error(404, 'Invite link not found');

    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Enter your name to join.' });

    const [member] = await db
      .insert(schema.members)
      .values({ groupId: group.id, name, loginToken: newToken() })
      .returning();

    cookies.set(SESSION_COOKIE, makeSession(member.id), cookieOptions);
    throw redirect(303, `/g/${group.id}`);
  }
};

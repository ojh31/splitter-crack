import { and, eq, isNull } from 'drizzle-orm';
import { fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { newToken } from '$lib/server/auth.js';
import { ensureUser } from '$lib/server/session.js';
import { loadGroupState } from '$lib/server/groups.js';

export async function load({ locals, url }) {
  if (!locals.user) return { groups: [], archivedGroups: [], loginUrl: null };

  // Active memberships only (not soft-left).
  const memberships = await db.query.members.findMany({
    where: and(eq(schema.members.userId, locals.user.id), isNull(schema.members.leftAt))
  });

  const groups = [];
  const archivedGroups = [];
  for (const m of memberships) {
    const group = await db.query.groups.findFirst({
      where: eq(schema.groups.id, m.groupId)
    });
    if (!group) continue;
    const { members, balances } = await loadGroupState(group.id);
    const row = {
      id: group.id,
      name: group.name,
      memberCount: members.filter((x) => !x.leftAt).length,
      myBalanceCents: balances.get(m.id) ?? 0
    };
    // Archived groups stay visible, just reprioritized into their own section.
    (group.archivedAt ? archivedGroups : groups).push(row);
  }
  groups.sort((a, b) => a.name.localeCompare(b.name));
  archivedGroups.sort((a, b) => a.name.localeCompare(b.name));

  return {
    groups,
    archivedGroups,
    loginUrl: `${url.origin}/login/${locals.user.loginToken}`
  };
}

export const actions = {
  create: async ({ request, cookies, locals }) => {
    const form = await request.formData();
    const groupName = String(form.get('groupName') ?? '').trim();
    const yourName = String(form.get('yourName') ?? '').trim();
    if (!groupName || !yourName) {
      return fail(400, { error: 'Both a group name and your name are required.' });
    }

    const user = await ensureUser(locals, cookies);
    const [group] = await db
      .insert(schema.groups)
      .values({ name: groupName, inviteToken: newToken() })
      .returning();
    await db
      .insert(schema.members)
      .values({ groupId: group.id, name: yourName, userId: user.id });

    throw redirect(303, `/g/${group.id}`);
  }
};

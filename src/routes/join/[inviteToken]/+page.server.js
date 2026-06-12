import { and, eq, isNull } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { ensureUser } from '$lib/server/session.js';

async function groupByInvite(inviteToken) {
  return db.query.groups.findFirst({
    where: eq(schema.groups.inviteToken, inviteToken)
  });
}

export async function load({ params, locals }) {
  const group = await groupByInvite(params.inviteToken);
  if (!group) throw error(404, 'Invite link not found');

  // Already an active member of this group? Go straight in.
  if (locals.user) {
    const existing = await db.query.members.findFirst({
      where: and(
        eq(schema.members.groupId, group.id),
        eq(schema.members.userId, locals.user.id),
        isNull(schema.members.leftAt)
      )
    });
    if (existing) throw redirect(303, `/g/${group.id}`);
  }

  // Offer any unclaimed placeholders to claim.
  const placeholders = await db.query.members.findMany({
    where: and(
      eq(schema.members.groupId, group.id),
      isNull(schema.members.userId),
      isNull(schema.members.leftAt)
    )
  });

  return {
    groupName: group.name,
    placeholders: placeholders.map((p) => ({ id: p.id, name: p.name }))
  };
}

export const actions = {
  default: async ({ request, params, cookies, locals }) => {
    const group = await groupByInvite(params.inviteToken);
    if (!group) throw error(404, 'Invite link not found');

    const form = await request.formData();
    const claimId = String(form.get('claimId') ?? '');
    const name = String(form.get('name') ?? '').trim();

    const user = await ensureUser(locals, cookies);

    if (claimId) {
      // Claim an existing placeholder: only if still unclaimed and in this group.
      const result = await db
        .update(schema.members)
        .set({ userId: user.id })
        .where(
          and(
            eq(schema.members.id, claimId),
            eq(schema.members.groupId, group.id),
            isNull(schema.members.userId)
          )
        )
        .returning();
      if (result.length === 0) {
        return fail(400, { error: 'That name was already claimed — pick another or add yourself.' });
      }
    } else {
      if (!name) return fail(400, { error: 'Enter your name or pick one to claim.' });
      await db
        .insert(schema.members)
        .values({ groupId: group.id, name, userId: user.id });
    }

    throw redirect(303, `/g/${group.id}`);
  }
};

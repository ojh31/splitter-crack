import { and, eq, isNull } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { simplifyDebts, equalShares } from '$lib/server/settle.js';
import { loadGroupState } from '$lib/server/groups.js';

// Parse a dollars string like "12.50" into integer cents. Returns null if invalid.
function parseCents(raw) {
  const s = String(raw ?? '').trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

// Return the caller's active member row for this group, or redirect home.
async function requireMember(locals, groupId) {
  if (!locals.user) throw redirect(303, '/');
  const member = await db.query.members.findFirst({
    where: and(
      eq(schema.members.groupId, groupId),
      eq(schema.members.userId, locals.user.id),
      isNull(schema.members.leftAt)
    )
  });
  if (!member) throw redirect(303, '/');
  return member;
}

// Archived groups are read-only: data is preserved, but no new changes until
// the group is restored. Returns a fail() to short-circuit the action, or null.
async function archivedGuard(groupId, errorKey) {
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, groupId)
  });
  if (group?.archivedAt) {
    return fail(400, { [errorKey]: 'This group is archived — restore it to make changes.' });
  }
  return null;
}

export async function load({ params, locals, url }) {
  const me = await requireMember(locals, params.groupId);
  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, params.groupId)
  });
  if (!group) throw error(404, 'Group not found');

  const { members, expenses, settlements, balances } = await loadGroupState(group.id);
  const nameById = new Map(members.map((m) => [m.id, m.name]));

  const active = members.filter((m) => !m.leftAt);
  // Left members still appear in balances/settle-up while they owe or are owed.
  const settleable = members.filter((m) => !m.leftAt || (balances.get(m.id) ?? 0) !== 0);

  const transfers = simplifyDebts(balances).map((t) => ({
    fromName: nameById.get(t.fromId),
    toName: nameById.get(t.toId),
    amountCents: t.amountCents
  }));

  return {
    me: { id: me.id, name: me.name },
    group: { id: group.id, name: group.name, archived: !!group.archivedAt },
    inviteUrl: `${url.origin}/join/${group.inviteToken}`,
    activeMembers: active.map((m) => ({ id: m.id, name: m.name, claimed: !!m.userId })),
    settleMembers: settleable.map((m) => ({ id: m.id, name: m.name, left: !!m.leftAt })),
    balances: settleable.map((m) => ({
      id: m.id,
      name: m.name,
      left: !!m.leftAt,
      cents: balances.get(m.id) ?? 0
    })),
    // Live expenses first, archived ones reprioritized to the bottom — kept
    // visible, just no longer counted.
    expenses: expenses
      .map((e) => ({
        id: e.id,
        description: e.description,
        amountCents: e.amountCents,
        paidByName: nameById.get(e.paidById),
        archived: !!e.archivedAt
      }))
      .sort((a, b) => Number(a.archived) - Number(b.archived)),
    settlements: settlements.map((s) => ({
      id: s.id,
      amountCents: s.amountCents,
      fromName: nameById.get(s.fromId),
      toName: nameById.get(s.toId)
    })),
    transfers
  };
}

async function activeMemberIds(groupId) {
  const rows = await db.query.members.findMany({
    where: and(eq(schema.members.groupId, groupId), isNull(schema.members.leftAt))
  });
  return new Set(rows.map((m) => m.id));
}

export const actions = {
  addMember: async ({ request, params, locals }) => {
    await requireMember(locals, params.groupId);
    const blocked = await archivedGuard(params.groupId, 'memberError');
    if (blocked) return blocked;
    const form = await request.formData();
    const name = String(form.get('name') ?? '').trim();
    if (!name) return fail(400, { memberError: 'Enter a name.' });
    // Placeholder: no userId until they claim it via the invite link.
    await db.insert(schema.members).values({ groupId: params.groupId, name, userId: null });
    return { memberAdded: true };
  },

  addExpense: async ({ request, params, locals }) => {
    await requireMember(locals, params.groupId);
    const blocked = await archivedGuard(params.groupId, 'addError');
    if (blocked) return blocked;
    const form = await request.formData();
    const description = String(form.get('description') ?? '').trim();
    const amountCents = parseCents(form.get('amount'));
    const paidById = String(form.get('paidById') ?? '');
    const participants = form.getAll('participants').map(String);

    if (!description) return fail(400, { addError: 'Add a description.' });
    if (!amountCents || amountCents <= 0) return fail(400, { addError: 'Enter a valid amount.' });
    if (participants.length === 0)
      return fail(400, { addError: 'Pick at least one person to split between.' });

    const valid = await activeMemberIds(params.groupId);
    if (!valid.has(paidById)) return fail(400, { addError: 'Unknown payer.' });
    if (!participants.every((p) => valid.has(p)))
      return fail(400, { addError: 'Unknown participant.' });

    const cents = equalShares(amountCents, participants.length);
    await db.transaction(async (tx) => {
      const [expense] = await tx
        .insert(schema.expenses)
        .values({ groupId: params.groupId, paidById, description, amountCents })
        .returning();
      await tx.insert(schema.expenseShares).values(
        participants.map((memberId, i) => ({
          expenseId: expense.id,
          memberId,
          shareCents: cents[i]
        }))
      );
    });
    return { added: true };
  },

  settle: async ({ request, params, locals }) => {
    await requireMember(locals, params.groupId);
    const blocked = await archivedGuard(params.groupId, 'settleError');
    if (blocked) return blocked;
    const form = await request.formData();
    const fromId = String(form.get('fromId') ?? '');
    const toId = String(form.get('toId') ?? '');
    const amountCents = parseCents(form.get('amount'));

    if (!amountCents || amountCents <= 0)
      return fail(400, { settleError: 'Enter a valid amount.' });
    if (!fromId || !toId || fromId === toId)
      return fail(400, { settleError: 'Pick two different people.' });

    // Settlements may involve a left member who still owes, so allow any member
    // of this group (not just active ones).
    const rows = await db.query.members.findMany({
      where: eq(schema.members.groupId, params.groupId)
    });
    const valid = new Set(rows.map((m) => m.id));
    if (!valid.has(fromId) || !valid.has(toId))
      return fail(400, { settleError: 'Unknown member.' });

    await db
      .insert(schema.settlements)
      .values({ groupId: params.groupId, fromId, toId, amountCents });
    return { settled: true };
  },

  archiveExpense: async ({ request, params, locals }) => {
    await requireMember(locals, params.groupId);
    const blocked = await archivedGuard(params.groupId, 'addError');
    if (blocked) return blocked;
    const form = await request.formData();
    const expenseId = String(form.get('expenseId') ?? '');
    // Soft-archive: the expense and its shares stay, they just stop counting.
    await db
      .update(schema.expenses)
      .set({ archivedAt: new Date() })
      .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, params.groupId)));
    return { expenseArchived: true };
  },

  restoreExpense: async ({ request, params, locals }) => {
    await requireMember(locals, params.groupId);
    const blocked = await archivedGuard(params.groupId, 'addError');
    if (blocked) return blocked;
    const form = await request.formData();
    const expenseId = String(form.get('expenseId') ?? '');
    await db
      .update(schema.expenses)
      .set({ archivedAt: null })
      .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, params.groupId)));
    return { expenseRestored: true };
  },

  leaveGroup: async ({ params, locals }) => {
    const me = await requireMember(locals, params.groupId);
    // Soft leave: keep the row so past expenses retain their balances.
    await db
      .update(schema.members)
      .set({ leftAt: new Date() })
      .where(eq(schema.members.id, me.id));
    throw redirect(303, '/');
  },

  archiveGroup: async ({ params, locals }) => {
    await requireMember(locals, params.groupId);
    // Soft-archive: keep every row, just stamp archivedAt. Nothing is lost —
    // the group drops out of active lists and becomes read-only until restored.
    await db
      .update(schema.groups)
      .set({ archivedAt: new Date() })
      .where(and(eq(schema.groups.id, params.groupId), isNull(schema.groups.archivedAt)));
    throw redirect(303, '/');
  },

  restoreGroup: async ({ params, locals }) => {
    await requireMember(locals, params.groupId);
    await db
      .update(schema.groups)
      .set({ archivedAt: null })
      .where(eq(schema.groups.id, params.groupId));
    return { restored: true };
  }
};

import { and, eq, desc, inArray } from 'drizzle-orm';
import { error, fail, redirect } from '@sveltejs/kit';
import { db, schema } from '$lib/server/db/index.js';
import { netBalances, simplifyDebts, equalShares } from '$lib/server/settle.js';

// Parse a dollars string like "12.50" into integer cents. Returns null if invalid.
function parseCents(raw) {
  const s = String(raw ?? '').trim().replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

async function requireMembership(locals, groupId) {
  if (!locals.member || locals.member.groupId !== groupId) {
    throw redirect(303, '/');
  }
}

export async function load({ params, locals, url }) {
  await requireMembership(locals, params.groupId);
  const groupId = params.groupId;

  const group = await db.query.groups.findFirst({
    where: eq(schema.groups.id, groupId)
  });
  if (!group) throw error(404, 'Group not found');

  const members = await db.query.members.findMany({
    where: eq(schema.members.groupId, groupId)
  });
  const expenses = await db.query.expenses.findMany({
    where: eq(schema.expenses.groupId, groupId),
    orderBy: desc(schema.expenses.createdAt)
  });
  const expenseIds = expenses.map((e) => e.id);
  const shares = expenseIds.length
    ? await db.query.expenseShares.findMany({
        where: inArray(schema.expenseShares.expenseId, expenseIds)
      })
    : [];
  const settlements = await db.query.settlements.findMany({
    where: eq(schema.settlements.groupId, groupId),
    orderBy: desc(schema.settlements.createdAt)
  });

  const nameById = new Map(members.map((m) => [m.id, m.name]));
  const balances = netBalances({ members, expenses, shares, settlements });
  const transfers = simplifyDebts(balances).map((t) => ({
    ...t,
    fromName: nameById.get(t.fromId),
    toName: nameById.get(t.toId)
  }));

  return {
    me: locals.member,
    group: { id: group.id, name: group.name },
    inviteUrl: `${url.origin}/join/${group.inviteToken}`,
    myLoginUrl: `${url.origin}/login/${locals.member.loginToken}`,
    members,
    expenses: expenses.map((e) => ({
      id: e.id,
      description: e.description,
      amountCents: e.amountCents,
      paidByName: nameById.get(e.paidById)
    })),
    settlements: settlements.map((s) => ({
      id: s.id,
      amountCents: s.amountCents,
      fromName: nameById.get(s.fromId),
      toName: nameById.get(s.toId)
    })),
    balances: members.map((m) => ({
      id: m.id,
      name: m.name,
      cents: balances.get(m.id) ?? 0
    })),
    transfers
  };
}

export const actions = {
  addExpense: async ({ request, params, locals }) => {
    await requireMembership(locals, params.groupId);
    const form = await request.formData();
    const description = String(form.get('description') ?? '').trim();
    const amountCents = parseCents(form.get('amount'));
    const paidById = String(form.get('paidById') ?? '');
    const participants = form.getAll('participants').map(String);

    if (!description) return fail(400, { addError: 'Add a description.' });
    if (!amountCents || amountCents <= 0) return fail(400, { addError: 'Enter a valid amount.' });
    if (participants.length === 0)
      return fail(400, { addError: 'Pick at least one person to split between.' });

    // Validate all referenced members belong to this group.
    const groupMembers = await db.query.members.findMany({
      where: eq(schema.members.groupId, params.groupId)
    });
    const validIds = new Set(groupMembers.map((m) => m.id));
    if (!validIds.has(paidById)) return fail(400, { addError: 'Unknown payer.' });
    if (!participants.every((p) => validIds.has(p)))
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
    await requireMembership(locals, params.groupId);
    const form = await request.formData();
    const fromId = String(form.get('fromId') ?? '');
    const toId = String(form.get('toId') ?? '');
    const amountCents = parseCents(form.get('amount'));

    if (!amountCents || amountCents <= 0)
      return fail(400, { settleError: 'Enter a valid amount.' });
    if (!fromId || !toId || fromId === toId)
      return fail(400, { settleError: 'Pick two different people.' });

    const groupMembers = await db.query.members.findMany({
      where: eq(schema.members.groupId, params.groupId)
    });
    const validIds = new Set(groupMembers.map((m) => m.id));
    if (!validIds.has(fromId) || !validIds.has(toId))
      return fail(400, { settleError: 'Unknown member.' });

    await db.insert(schema.settlements).values({
      groupId: params.groupId,
      fromId,
      toId,
      amountCents
    });
    return { settled: true };
  },

  deleteExpense: async ({ request, params, locals }) => {
    await requireMembership(locals, params.groupId);
    const form = await request.formData();
    const expenseId = String(form.get('expenseId') ?? '');
    // Cascade on expense_shares handles the child rows. Scope to group for safety.
    await db
      .delete(schema.expenses)
      .where(and(eq(schema.expenses.id, expenseId), eq(schema.expenses.groupId, params.groupId)));
    return { deleted: true };
  }
};

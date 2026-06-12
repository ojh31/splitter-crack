import { eq, desc, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db/index.js';
import { netBalances } from '$lib/server/settle.js';

/**
 * Load a group's members and all financial rows, and compute net balances.
 * Balances include left members, since their past expenses still affect who
 * owes whom until settled.
 * @returns {Promise<{ members, expenses, shares, settlements, balances: Map<string, number> }>}
 */
export async function loadGroupState(groupId) {
  const members = await db.query.members.findMany({
    where: eq(schema.members.groupId, groupId),
    orderBy: desc(schema.members.createdAt)
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
  const balances = netBalances({ members, expenses, shares, settlements });
  return { members, expenses, shares, settlements, balances };
}

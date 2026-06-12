import { eq, desc, inArray } from 'drizzle-orm';
import { db, schema } from '$lib/server/db/index.js';
import { netBalances } from '$lib/server/settle.js';

/**
 * Load a group's members and all financial rows, and compute net balances.
 * Balances include left members, since their past expenses still affect who
 * owes whom until settled. Archived expenses (and their shares) are returned
 * for display but excluded from the balance math — they no longer count.
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

  // Only live (non-archived) expenses and their shares feed the balances.
  const liveExpenses = expenses.filter((e) => !e.archivedAt);
  const liveExpenseIds = new Set(liveExpenses.map((e) => e.id));
  const liveShares = shares.filter((s) => liveExpenseIds.has(s.expenseId));
  const balances = netBalances({
    members,
    expenses: liveExpenses,
    shares: liveShares,
    settlements
  });
  return { members, expenses, shares, settlements, balances };
}

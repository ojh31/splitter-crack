/**
 * Bill-splitting math. Everything is in integer cents.
 *
 * Two steps:
 *  1. netBalances — for each member, (what they paid + what they were paid back)
 *     minus (their share of expenses + what they paid out in settlements).
 *     Positive = the group owes them; negative = they owe the group.
 *  2. simplifyDebts — greedily match the biggest creditor to the biggest debtor
 *     so the group settles in the fewest transfers, instead of every pair
 *     paying each other directly.
 */

/**
 * @param {{
 *   members: { id: string, name: string }[],
 *   expenses: { paidById: string, amountCents: number }[],
 *   shares: { memberId: string, shareCents: number }[],
 *   settlements: { fromId: string, toId: string, amountCents: number }[]
 * }} input
 * @returns {Map<string, number>} memberId -> net balance in cents
 */
export function netBalances({ members, expenses, shares, settlements }) {
  const balance = new Map();
  for (const m of members) balance.set(m.id, 0);

  for (const e of expenses) {
    balance.set(e.paidById, (balance.get(e.paidById) ?? 0) + e.amountCents);
  }
  for (const s of shares) {
    balance.set(s.memberId, (balance.get(s.memberId) ?? 0) - s.shareCents);
  }
  // A settlement moves cash: the payer reduces their debt (balance up),
  // the receiver reduces their credit (balance down).
  for (const s of settlements) {
    balance.set(s.fromId, (balance.get(s.fromId) ?? 0) + s.amountCents);
    balance.set(s.toId, (balance.get(s.toId) ?? 0) - s.amountCents);
  }
  return balance;
}

/**
 * Turn net balances into a minimal-ish set of "X pays Y" transfers.
 * @param {Map<string, number>} balances memberId -> cents
 * @returns {{ fromId: string, toId: string, amountCents: number }[]}
 */
export function simplifyDebts(balances) {
  const debtors = []; // owe money (negative)
  const creditors = []; // are owed money (positive)
  for (const [id, cents] of balances) {
    if (cents < 0) debtors.push({ id, amount: -cents });
    else if (cents > 0) creditors.push({ id, amount: cents });
  }
  // Largest first keeps the transfer count low and stable.
  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amount, creditors[j].amount);
    transfers.push({ fromId: debtors[i].id, toId: creditors[j].id, amountCents: pay });
    debtors[i].amount -= pay;
    creditors[j].amount -= pay;
    if (debtors[i].amount === 0) i++;
    if (creditors[j].amount === 0) j++;
  }
  return transfers;
}

/**
 * Split an amount into n integer-cent shares that sum exactly to the total.
 * Remainder cents are spread across the first few shares so nothing is lost.
 * @param {number} amountCents
 * @param {number} n
 * @returns {number[]} length n, sums to amountCents
 */
export function equalShares(amountCents, n) {
  if (n <= 0) return [];
  const base = Math.floor(amountCents / n);
  let remainder = amountCents - base * n;
  const out = [];
  for (let k = 0; k < n; k++) {
    out.push(base + (remainder > 0 ? 1 : 0));
    if (remainder > 0) remainder--;
  }
  return out;
}

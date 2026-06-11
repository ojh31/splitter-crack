import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index
} from 'drizzle-orm/pg-core';

// A household / shared-expense group.
export const groups = pgTable('groups', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  // Shareable token used to build the invite link (/join/:inviteToken).
  inviteToken: text('invite_token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

// A person within a group. No global accounts in v1 — identity is the
// per-member loginToken, which doubles as the personal "magic link".
export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    loginToken: text('login_token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    groupIdx: index('members_group_idx').on(t.groupId)
  })
);

// A single expense paid by one member. Amounts are stored as integer cents
// to avoid floating-point drift.
export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    paidById: uuid('paid_by_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    description: text('description').notNull(),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    groupIdx: index('expenses_group_idx').on(t.groupId)
  })
);

// How an expense is divided. One row per member who owes a portion.
// v1 only creates equal splits, but the model already supports uneven ones.
export const expenseShares = pgTable(
  'expense_shares',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    shareCents: integer('share_cents').notNull()
  },
  (t) => ({
    expenseIdx: index('expense_shares_expense_idx').on(t.expenseId)
  })
);

// A recorded payment from one member to another to clear debt.
export const settlements = pgTable(
  'settlements',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    groupId: uuid('group_id')
      .notNull()
      .references(() => groups.id, { onDelete: 'cascade' }),
    fromId: uuid('from_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    toId: uuid('to_id')
      .notNull()
      .references(() => members.id, { onDelete: 'restrict' }),
    amountCents: integer('amount_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
  },
  (t) => ({
    groupIdx: index('settlements_group_idx').on(t.groupId)
  })
);

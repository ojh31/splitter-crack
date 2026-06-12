// Weekly reminder job. Run on a schedule (e.g. Railway Cron, Mondays 09:00):
//
//   node scripts/weekly-reminders.js
//
// For every user with an email on file, it sums up what they owe / are owed
// across their active groups and emails a short digest. Users who are fully
// settled everywhere get nothing — no spam.
//
// Standalone on purpose: like scripts/migrate.js it spins up its own DB client
// and only imports env-free modules (schema, settle, email), so it runs under
// plain `node` without SvelteKit's $lib/$env aliases.

import { drizzle } from 'drizzle-orm/postgres-js';
import { and, eq, isNull, inArray, isNotNull } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from '../src/lib/server/db/schema.js';
import { netBalances, simplifyDebts } from '../src/lib/server/settle.js';
import { sendEmail } from '../src/lib/server/email.js';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set.');
  process.exit(1);
}
const origin = process.env.ORIGIN || '';

const money = (cents) =>
  (cents < 0 ? '-' : '') + '$' + (Math.abs(cents) / 100).toFixed(2);

const client = postgres(url, { max: 1 });
const db = drizzle(client, { schema });

// Recompute one group's live balances + minimal transfer set. Mirrors
// loadGroupState in src/lib/server/groups.js, minus the display-only fields.
async function groupSettlement(groupId) {
  const members = await db.query.members.findMany({
    where: eq(schema.members.groupId, groupId)
  });
  const expenses = await db.query.expenses.findMany({
    where: and(eq(schema.expenses.groupId, groupId), isNull(schema.expenses.archivedAt))
  });
  const expenseIds = expenses.map((e) => e.id);
  const shares = expenseIds.length
    ? await db.query.expenseShares.findMany({
        where: inArray(schema.expenseShares.expenseId, expenseIds)
      })
    : [];
  const settlements = await db.query.settlements.findMany({
    where: eq(schema.settlements.groupId, groupId)
  });

  const balances = netBalances({ members, expenses, shares, settlements });
  const transfers = simplifyDebts(balances);
  const nameById = new Map(members.map((m) => [m.id, m.name]));
  return { members, balances, transfers, nameById };
}

// Build the digest lines for one user across all their active, non-archived
// groups. Returns [] when the user is settled everywhere.
async function digestForUser(userId) {
  const memberships = await db.query.members.findMany({
    where: and(eq(schema.members.userId, userId), isNull(schema.members.leftAt))
  });

  const sections = [];
  for (const m of memberships) {
    const group = await db.query.groups.findFirst({ where: eq(schema.groups.id, m.groupId) });
    if (!group || group.archivedAt) continue;

    const { balances, transfers, nameById } = await groupSettlement(group.id);
    const net = balances.get(m.id) ?? 0;
    if (net === 0) continue; // settled in this group

    const youOwe = transfers
      .filter((t) => t.fromId === m.id)
      .map((t) => `you owe ${nameById.get(t.toId) ?? 'someone'} ${money(t.amountCents)}`);
    const owedToYou = transfers
      .filter((t) => t.toId === m.id)
      .map((t) => `${nameById.get(t.fromId) ?? 'someone'} owes you ${money(t.amountCents)}`);

    sections.push({
      groupId: group.id,
      groupName: group.name,
      net,
      lines: [...youOwe, ...owedToYou]
    });
  }
  return sections;
}

function renderEmail(sections, loginUrl) {
  const textBlocks = [];
  const htmlBlocks = [];
  for (const s of sections) {
    const headline =
      s.net > 0
        ? `you're owed ${money(s.net)}`
        : `you owe ${money(-s.net)}`;
    textBlocks.push(`${s.groupName} — ${headline}\n  ${s.lines.join('\n  ')}`);
    htmlBlocks.push(
      `<h3 style="margin:16px 0 4px">${s.groupName} — ${headline}</h3>` +
        `<ul style="margin:0 0 8px;padding-left:20px">${s.lines
          .map((l) => `<li>${l}</li>`)
          .join('')}</ul>`
    );
  }

  const footerText = loginUrl
    ? `\n\nOpen your groups: ${loginUrl}\nTo stop these emails, clear your address on that page.`
    : '\n\nTo stop these emails, clear your address on the app.';
  const footerHtml = loginUrl
    ? `<p style="margin-top:16px"><a href="${loginUrl}">Open your groups</a></p>` +
      `<p style="color:#888;font-size:12px">To stop these emails, clear your address on that page.</p>`
    : `<p style="color:#888;font-size:12px">To stop these emails, clear your address on the app.</p>`;

  return {
    text: `Your weekly splitter summary\n\n${textBlocks.join('\n\n')}${footerText}`,
    html:
      `<div style="font-family:system-ui,sans-serif;max-width:480px">` +
      `<h2>Your weekly splitter summary</h2>${htmlBlocks.join('')}${footerHtml}</div>`
  };
}

async function main() {
  const recipients = await db.query.users.findMany({
    where: isNotNull(schema.users.email)
  });
  console.log(`[weekly] ${recipients.length} user(s) with an email on file.`);

  let sent = 0;
  let skipped = 0;
  for (const user of recipients) {
    const sections = await digestForUser(user.id);
    if (sections.length === 0) {
      skipped++;
      continue;
    }
    const loginUrl = origin ? `${origin}/login/${user.loginToken}` : '';
    const { text, html } = renderEmail(sections, loginUrl);
    try {
      const result = await sendEmail({
        to: user.email,
        subject: 'Your weekly splitter summary',
        html,
        text
      });
      if (result.sent) {
        sent++;
      } else {
        skipped++;
        // Dry run (no provider configured): show what would have gone out.
        console.log(`[weekly] would email ${user.email}:\n${text}\n`);
      }
    } catch (err) {
      console.error(`[weekly] failed to email ${user.email}:`, err.message);
    }
  }
  console.log(`[weekly] done — ${sent} sent, ${skipped} skipped (settled or no provider).`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(err);
    await client.end();
    process.exit(1);
  });

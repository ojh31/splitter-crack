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
import { and, eq, isNull, inArray } from 'drizzle-orm';
import postgres from 'postgres';

import * as schema from '../src/lib/server/db/schema.js';
import { netBalances, simplifyDebts } from '../src/lib/server/settle.js';
import { sendEmail, verifyEmail } from '../src/lib/server/email.js';

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

// Build per-recipient digests keyed by contact email. A member's effective email
// is their per-member contact email, falling back to their linked account email,
// so people added by name (with a contact email) are reminded too — not just
// registered users. Members are grouped by email, so someone in several groups
// gets one combined digest; recipients settled everywhere get nothing.
// @returns {Promise<Map<string, { loginToken: string|null, sections: object[] }>>}
async function buildDigestsByEmail() {
  const users = await db.query.users.findMany();
  const userById = new Map(users.map((u) => [u.id, u]));

  const groups = await db.query.groups.findMany({
    where: isNull(schema.groups.archivedAt)
  });

  const byEmail = new Map();
  for (const group of groups) {
    const { members, balances, transfers, nameById } = await groupSettlement(group.id);
    for (const m of members) {
      if (m.leftAt) continue; // active members only
      const user = m.userId ? userById.get(m.userId) : null;
      const email = (m.email || user?.email || '').trim().toLowerCase();
      if (!email) continue;

      const net = balances.get(m.id) ?? 0;
      if (net === 0) continue; // settled in this group

      const oweLines = transfers
        .filter((t) => t.fromId === m.id)
        .map((t) => `you owe ${nameById.get(t.toId) ?? 'someone'} ${money(t.amountCents)}`);
      const owedLines = transfers
        .filter((t) => t.toId === m.id)
        .map((t) => `${nameById.get(t.fromId) ?? 'someone'} owes you ${money(t.amountCents)}`);

      let entry = byEmail.get(email);
      if (!entry) {
        entry = { loginToken: null, sections: [] };
        byEmail.set(email, entry);
      }
      // Use a real sign-in link if this person has claimed an account.
      if (!entry.loginToken && user?.loginToken) entry.loginToken = user.loginToken;
      entry.sections.push({ groupName: group.name, net, lines: [...oweLines, ...owedLines] });
    }
  }
  return byEmail;
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
  // Probe the provider up front so a connection/auth problem is reported once,
  // clearly, instead of once per recipient.
  const probe = await verifyEmail();
  if (probe.skipped) {
    console.log('[weekly] no email provider configured — running in log-only mode.');
  } else if (probe.ok) {
    console.log('[weekly] email provider verified.');
  } else {
    console.error(
      `[weekly] provider verify FAILED — code=${probe.error?.code} command=${probe.error?.command}: ${probe.error?.message}`
    );
  }

  const digests = await buildDigestsByEmail();
  console.log(`[weekly] ${digests.size} recipient(s) with an outstanding balance.`);

  let sent = 0;
  let skipped = 0;
  for (const [email, { loginToken, sections }] of digests) {
    const loginUrl = origin && loginToken ? `${origin}/login/${loginToken}` : '';
    const { text, html } = renderEmail(sections, loginUrl);
    try {
      const result = await sendEmail({
        to: email,
        subject: 'Your weekly splitter summary',
        html,
        text
      });
      if (result.sent) {
        sent++;
      } else {
        skipped++;
        // Dry run (no provider configured): show what would have gone out.
        console.log(`[weekly] would email ${email}:\n${text}\n`);
      }
    } catch (err) {
      console.error(
        `[weekly] failed to email ${email} — code=${err.code} command=${err.command}: ${err.message}`
      );
    }
  }
  console.log(`[weekly] done — ${sent} sent, ${skipped} skipped (no provider).`);
}

main()
  .then(() => client.end())
  .catch(async (err) => {
    console.error(err);
    await client.end();
    process.exit(1);
  });

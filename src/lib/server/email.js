// Minimal transactional-email sender backed by Gmail's SMTP server.
//
// Reads config straight from process.env (not SvelteKit's $env) so the same
// module works both inside the running app and in the standalone
// scripts/weekly-reminders.js cron job.
//
//   GMAIL_USER          — the Gmail address mail is sent from, e.g. you@gmail.com
//   GMAIL_APP_PASSWORD  — a 16-char Google "App Password" (NOT your login
//                         password). Requires 2-Step Verification on the account:
//                         https://myaccount.google.com/apppasswords
//   EMAIL_FROM          — optional display form, e.g. "Splitter <you@gmail.com>".
//                         Defaults to GMAIL_USER.
//   SMTP_PORT           — optional, 465 (default, implicit TLS) or 587 (STARTTLS).
//   SMTP_HOST           — optional, defaults to smtp.gmail.com.
//   EMAIL_DEBUG         — set to any value to print full SMTP conversation logs.
//
// If GMAIL_USER / GMAIL_APP_PASSWORD are unset we don't throw: we log and no-op,
// so local dev and tests run without SMTP credentials configured.

import nodemailer from 'nodemailer';

let _transport;
function getTransport() {
  if (_transport) return _transport;
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;

  const host = process.env.SMTP_HOST || 'smtp.gmail.com';
  const port = Number(process.env.SMTP_PORT || 465);
  const debug = Boolean(process.env.EMAIL_DEBUG);

  _transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = implicit TLS; 587 = STARTTLS (secure:false)
    auth: { user, pass },
    // Force IPv4: container egress often has no IPv6 route, which otherwise makes
    // the connection hang until timeout instead of connecting.
    family: 4,
    // Fail fast and loudly rather than the default ~2-minute hang.
    connectionTimeout: 20_000,
    greetingTimeout: 20_000,
    socketTimeout: 30_000,
    logger: debug,
    debug
  });
  return _transport;
}

/**
 * @param {{ to: string, subject: string, html: string, text?: string }} msg
 * @returns {Promise<{ sent: boolean, skipped?: boolean, id?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const transport = getTransport();
  if (!transport) {
    console.warn(
      `[email] GMAIL_USER / GMAIL_APP_PASSWORD unset — skipping email to ${to} ("${subject}")`
    );
    return { sent: false, skipped: true };
  }

  const from = process.env.EMAIL_FROM || process.env.GMAIL_USER;
  const info = await transport.sendMail({ from, to, subject, html, text });
  return { sent: true, id: info.messageId };
}

/**
 * Probe the SMTP connection/credentials without sending. Used by the reminder
 * job at startup so connection problems surface clearly before the send loop.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: Error }>}
 */
export async function verifyEmail() {
  const transport = getTransport();
  if (!transport) return { ok: false, skipped: true };
  try {
    await transport.verify();
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

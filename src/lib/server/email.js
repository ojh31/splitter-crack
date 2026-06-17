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
  _transport = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user, pass }
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

// Minimal transactional-email sender backed by Brevo's HTTP API.
//
// Why HTTP and not SMTP: Railway blocks all outbound SMTP ports, so nodemailer /
// Gmail SMTP can never connect from there. Brevo's REST API goes over plain
// HTTPS (port 443), which Railway allows, and its free tier lets you send from a
// single *verified sender* address — no domain or DNS setup required.
//
// Reads config straight from process.env (not SvelteKit's $env) so the same
// module works both inside the running app and in the standalone
// scripts/weekly-reminders.js cron job.
//
//   BREVO_API_KEY  — from https://app.brevo.com/settings/keys/api
//   EMAIL_FROM     — the verified sender, e.g. "Splitter <you@gmail.com>" or
//                    just "you@gmail.com". Must be verified in Brevo first:
//                    https://app.brevo.com/senders
//
// If BREVO_API_KEY is unset we don't throw: we log and no-op, so local dev and
// tests run without an email provider configured.

const API_URL = 'https://api.brevo.com/v3/smtp/email';

// Parse "Name <email@host>" or a bare "email@host" into Brevo's sender object.
function parseFrom(value) {
  const m = /^\s*(.*?)\s*<\s*(.+?)\s*>\s*$/.exec(value || '');
  if (m) return { name: m[1] || undefined, email: m[2] };
  return { email: (value || '').trim() };
}

/**
 * @param {{ to: string, subject: string, html: string, text?: string }} msg
 * @returns {Promise<{ sent: boolean, skipped?: boolean, id?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(`[email] BREVO_API_KEY unset — skipping email to ${to} ("${subject}")`);
    return { sent: false, skipped: true };
  }

  const sender = parseFrom(process.env.EMAIL_FROM);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'api-key': apiKey,
      'content-type': 'application/json',
      accept: 'application/json'
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
      textContent: text
    })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
  const data = await res.json().catch(() => ({}));
  return { sent: true, id: data.messageId };
}

/**
 * Probe the API key (and surface auth problems) without sending. Used by the
 * reminder job at startup so credential issues are reported once, clearly.
 * @returns {Promise<{ ok: boolean, skipped?: boolean, error?: Error }>}
 */
export async function verifyEmail() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return { ok: false, skipped: true };
  try {
    const res = await fetch('https://api.brevo.com/v3/account', {
      headers: { 'api-key': apiKey, accept: 'application/json' }
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { ok: false, error: new Error(`Brevo auth failed (${res.status}): ${body}`) };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

// Minimal transactional-email sender backed by Resend's HTTP API.
//
// Reads config straight from process.env (not SvelteKit's $env) so the same
// module works both inside the running app and in the standalone
// scripts/weekly-reminders.js cron job.
//
//   RESEND_API_KEY  — https://resend.com/api-keys
//   EMAIL_FROM      — verified sender, e.g. "Splitter <reminders@yourdomain.com>"
//
// If RESEND_API_KEY is unset we don't throw: we log and no-op, so local dev and
// tests run without an email provider configured.

/**
 * @param {{ to: string, subject: string, html: string, text?: string }} msg
 * @returns {Promise<{ sent: boolean, skipped?: boolean, id?: string }>}
 */
export async function sendEmail({ to, subject, html, text }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM || 'Splitter <onboarding@resend.dev>';

  if (!apiKey) {
    console.warn(`[email] RESEND_API_KEY unset — skipping email to ${to} ("${subject}")`);
    return { sent: false, skipped: true };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from, to, subject, html, text })
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Resend send failed (${res.status}): ${body}`);
  }
  const data = await res.json().catch(() => ({}));
  return { sent: true, id: data.id };
}

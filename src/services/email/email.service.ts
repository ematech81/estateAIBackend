import { env } from '../../config/env';

// Brevo's transactional email HTTP API — one endpoint, no SDK needed.
// https://developers.brevo.com/reference/sendtransacemail
const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

// No rate-limiting/spam protection on the endpoint that triggers this yet
// (see auth.routes.ts's /forgot-password) — flagging as a known gap, not
// silently skipping it. Same convention as leads.service.ts's public
// lead-capture endpoint.
export async function sendPasswordResetEmail(toEmail: string, toName: string, resetUrl: string): Promise<void> {
  if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
    throw new Error('Email sending is not configured (BREVO_API_KEY / BREVO_SENDER_EMAIL missing)');
  }

  const res = await fetch(BREVO_SEND_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': env.BREVO_API_KEY,
    },
    body: JSON.stringify({
      sender: { email: env.BREVO_SENDER_EMAIL, name: 'EstateAI' },
      to: [{ email: toEmail, name: toName }],
      subject: 'Reset your EstateAI password',
      htmlContent: passwordResetEmailHtml(toName, resetUrl),
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
}

function passwordResetEmailHtml(name: string, resetUrl: string): string {
  // Inline styles only — matches how most email clients actually render
  // (no external stylesheet support). Kept deliberately simple: one
  // message, one button, one plain-text fallback link.
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0B1C30;">
      <h1 style="font-size: 20px; margin-bottom: 16px;">Reset your password</h1>
      <p style="font-size: 15px; line-height: 1.5;">Hi ${escapeHtml(name)},</p>
      <p style="font-size: 15px; line-height: 1.5;">
        We received a request to reset your EstateAI password. Click the button below to choose a new one.
        This link expires in 1 hour.
      </p>
      <p style="margin: 24px 0;">
        <a href="${resetUrl}" style="background:#0F172A; color:#ffffff; padding:12px 24px; border-radius:6px; text-decoration:none; font-size:15px; display:inline-block;">
          Reset Password
        </a>
      </p>
      <p style="font-size: 13px; color: #45464d; line-height: 1.5;">
        If you didn't request this, you can safely ignore this email — your password won't change.
      </p>
      <p style="font-size: 13px; color: #45464d; line-height: 1.5;">
        Or paste this link into your browser: <br />
        <a href="${resetUrl}" style="color:#0F172A;">${resetUrl}</a>
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

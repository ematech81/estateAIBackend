import { env } from '../../config/env';

// Brevo's transactional email HTTP API — one endpoint, no SDK needed.
// https://developers.brevo.com/reference/sendtransacemail
const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';

// No rate-limiting/spam protection on the endpoints that trigger these yet
// (see auth.routes.ts's /forgot-password, /register, /resend-verification)
// — flagging as a known gap, not silently skipping it. Same convention as
// leads.service.ts's public lead-capture endpoint.
async function sendTransactionalEmail(toEmail: string, toName: string, subject: string, htmlContent: string): Promise<void> {
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
      subject,
      htmlContent,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Brevo send failed (${res.status}): ${body}`);
  }
}

export async function sendPasswordResetEmail(toEmail: string, toName: string, resetUrl: string): Promise<void> {
  await sendTransactionalEmail(
    toEmail,
    toName,
    'Reset your EstateAI password',
    emailButtonHtml({
      heading: 'Reset your password',
      name: toName,
      body: 'We received a request to reset your EstateAI password. Click the button below to choose a new one. This link expires in 1 hour.',
      buttonLabel: 'Reset Password',
      url: resetUrl,
      footnote: "If you didn't request this, you can safely ignore this email — your password won't change.",
    }),
  );
}

export async function sendEmailVerificationEmail(toEmail: string, toName: string, verifyUrl: string): Promise<void> {
  await sendTransactionalEmail(
    toEmail,
    toName,
    'Verify your EstateAI email address',
    emailButtonHtml({
      heading: 'Verify your email',
      name: toName,
      body: 'One last step — confirm this is really your email address so we know where to reach you. This link expires in 24 hours.',
      buttonLabel: 'Verify Email',
      url: verifyUrl,
      footnote: "If you didn't create an EstateAI account, you can safely ignore this email.",
    }),
  );
}

// Strictly opt-in (see User.emailMarketingOptIn) — the recipient is
// already a registered account, so "turn it off in Settings" is a real,
// immediate unsubscribe path, not a dead end.
export async function sendNewListingEmail(
  toEmail: string,
  toName: string,
  listingTitle: string,
  listingUrl: string,
): Promise<void> {
  await sendTransactionalEmail(
    toEmail,
    toName,
    `New on EstateAI: ${listingTitle}`,
    emailButtonHtml({
      heading: 'A new property just went live',
      name: toName,
      body: `"${listingTitle}" was just listed on EstateAI. Take a look while it's fresh.`,
      buttonLabel: 'View Listing',
      url: listingUrl,
      footnote: "You're getting this because you opted in to new-listing emails — turn it off anytime from your account settings.",
    }),
  );
}

// Shared layout for every "one message, one button, one plain-text
// fallback link" transactional email — password reset and email
// verification both fit this shape, so the template lives once.
function emailButtonHtml(params: {
  heading: string;
  name: string;
  body: string;
  buttonLabel: string;
  url: string;
  footnote: string;
}): string {
  const { heading, name, body, buttonLabel, url, footnote } = params;
  // Inline styles only — matches how most email clients actually render
  // (no external stylesheet support).
  return `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #0B1C30;">
      <h1 style="font-size: 20px; margin-bottom: 16px;">${escapeHtml(heading)}</h1>
      <p style="font-size: 15px; line-height: 1.5;">Hi ${escapeHtml(name)},</p>
      <p style="font-size: 15px; line-height: 1.5;">${escapeHtml(body)}</p>
      <p style="margin: 24px 0;">
        <a href="${url}" style="background:#0F172A; color:#ffffff; padding:12px 24px; border-radius:6px; text-decoration:none; font-size:15px; display:inline-block;">
          ${escapeHtml(buttonLabel)}
        </a>
      </p>
      <p style="font-size: 13px; color: #45464d; line-height: 1.5;">${escapeHtml(footnote)}</p>
      <p style="font-size: 13px; color: #45464d; line-height: 1.5;">
        Or paste this link into your browser: <br />
        <a href="${url}" style="color:#0F172A;">${url}</a>
      </p>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

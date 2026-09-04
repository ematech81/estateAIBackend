import crypto from 'crypto';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { PLANS, PayablePlan } from '../../config/plans';
import { User } from '../../models/User';
import { Payment } from '../../models/Payment';
import { sendNewListingEmail } from '../../services/email/email.service';
import { getEffectivePlanTier } from '../../services/plans/plan.service';

// This app's prefix on the shared korapay-webhook-router. Every checkout
// reference is {PREFIX}-{uuid}, never the Mongo _id — the router routes on
// this prefix, and the webhook looks the Payment up by the full reference.
const REFERENCE_PREFIX = 'EST';

const KORAPAY_INITIALIZE_URL = 'https://api.korapay.com/merchant/api/v1/charges/initialize';

// Confirmed against developers.korapay.com/docs/checkout-redirect: POST,
// Bearer {secret key}, response is { data: { reference, checkout_url } }.
// Amount unit is under-specified in KoraPay's own docs — best available
// evidence (their card-payment examples) points to whole Naira, not kobo,
// which is what this assumes. Verify with one real small test-mode
// transaction before this ever handles a live customer, per the plan
// discussed with the user — don't just trust this comment either.
interface KorapayInitializeResponse {
  status: boolean;
  message: string;
  data: { reference: string; checkout_url: string };
}

export async function initiateCheckout(
  userId: string,
  plan: PayablePlan,
): Promise<{ checkoutUrl: string }> {
  if (!env.KORAPAY_SECRET_KEY) {
    throw new ApiError(500, 'Payments are not configured on the server yet');
  }

  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.unauthorized();
  }

  const reference = `${REFERENCE_PREFIX}-${crypto.randomUUID()}`;
  const amount = PLANS[plan].priceNGN;

  const payment = await Payment.create({
    user: user._id,
    plan,
    amount,
    currency: 'NGN',
    checkoutReference: reference,
    status: 'pending',
  });

  let body: KorapayInitializeResponse;
  try {
    const res = await fetch(KORAPAY_INITIALIZE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.KORAPAY_SECRET_KEY}`,
      },
      // Deliberately no notification_url — the router (registered once,
      // directly on the KoraPay dashboard) is the only webhook destination
      // that matters; a per-transaction notification_url here would
      // bypass it and likely fail this app's own router-secret check.
      body: JSON.stringify({
        amount,
        currency: 'NGN',
        reference,
        customer: { email: user.email, name: user.name },
        redirect_url: `${env.WEB_ORIGIN}/agent/upgrade?reference=${reference}`,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`KoraPay initialize failed (${res.status}): ${errText}`);
    }
    body = (await res.json()) as KorapayInitializeResponse;
  } catch (err) {
    payment.status = 'failed';
    await payment.save();
    console.error('KoraPay checkout initialization failed:', err);
    throw new ApiError(502, 'Could not start checkout — please try again in a moment.');
  }

  payment.checkoutUrl = body.data.checkout_url;
  await payment.save();

  return { checkoutUrl: body.data.checkout_url };
}

// Confirmed against developers.korapay.com/docs/webhooks: HMAC-SHA256 of
// JSON.stringify(req.body.data) — the data object only, not the full body
// — keyed with the account's secret key. Works fine against an
// already-JSON-parsed body (KoraPay's own scheme re-stringifies the parsed
// object; it isn't a raw-byte signature), so express.json() upstream is
// not a problem here.
// secretKey defaults to the real configured key (production callers never
// pass a third argument); exposed as a parameter purely so tests can
// exercise the actual HMAC math with an explicit key, independent of
// tests/setup.ts blanking KORAPAY_SECRET_KEY (env.ts's config is read once
// at process start, so a test can't un-blank it after the fact).
export function verifyKorapaySignature(
  data: unknown,
  signatureHeader: string | undefined,
  secretKey: string | undefined = env.KORAPAY_SECRET_KEY,
): boolean {
  if (!secretKey || !signatureHeader) return false;
  const expected = crypto.createHmac('sha256', secretKey).update(JSON.stringify(data)).digest('hex');
  // Timing-safe compare — both must be the same length for timingSafeEqual,
  // so a length mismatch (any forged/garbage signature) is checked first.
  const expectedBuf = Buffer.from(expected, 'hex');
  const receivedBuf = Buffer.from(signatureHeader, 'hex');
  if (expectedBuf.length !== receivedBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, receivedBuf);
}

// Idempotent: the router retries on 5xx/timeout up to 3 times, so the same
// event can arrive more than once. Re-processing an already-'success'
// Payment is a safe no-op — it never re-extends planExpiresAt or
// double-sends anything.
export async function handleChargeSuccess(reference: string): Promise<void> {
  const payment = await Payment.findOne({ checkoutReference: reference });
  if (!payment) {
    console.warn('KoraPay webhook for unknown reference (not this app\'s or already deleted):', reference);
    return;
  }
  if (payment.status === 'success') {
    return; // already processed — duplicate delivery, not an error
  }

  payment.status = 'success';
  await payment.save();

  const user = await User.findById(payment.user);
  if (!user) return; // account deleted between checkout and webhook — nothing to activate

  const plan = PLANS[payment.plan];
  user.planTier = payment.plan;
  user.planExpiresAt = new Date(Date.now() + (plan.durationDays as number) * 24 * 60 * 60 * 1000);
  await user.save();
}

// Fire-and-forget from listing.service.ts's createListing — a Premium
// agent's new listing triggers this. Recipients are strictly opt-in (see
// User.emailMarketingOptIn); the Privacy Policy promises no marketing
// email without it.
//
// Sequential, not Promise.all — same reasoning as the photo-upload loop in
// the listing wizard: keeps this predictable and avoids bursting Brevo
// with N simultaneous requests. Flagged simplification: at meaningful
// recipient-list scale this needs real batching/a queue, not a loop.
export async function notifyNewListingIfPremium(
  property: { _id: unknown; title: string },
  posterId: string,
): Promise<void> {
  const poster = await User.findById(posterId);
  if (!poster) return;
  if (getEffectivePlanTier(poster) !== 'premium') return;

  const recipients = await User.find({ emailMarketingOptIn: true, _id: { $ne: posterId } }).select('email name');
  const listingUrl = `${env.WEB_ORIGIN}/properties/${property._id}`;

  for (const recipient of recipients) {
    try {
      await sendNewListingEmail(recipient.email, recipient.name, property.title, listingUrl);
    } catch (err) {
      console.error('New-listing email failed for', recipient.email, err);
    }
  }
}

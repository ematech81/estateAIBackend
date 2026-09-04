import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { env } from '../../config/env';
import { initiateCheckoutSchema } from './payment.validation';
import { handleChargeSuccess, initiateCheckout, verifyKorapaySignature } from './payment.service';

export const checkout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const input = initiateCheckoutSchema.parse(req.body);
  const result = await initiateCheckout(req.user.sub, input.plan);
  res.status(200).json(result);
});

// Public — server-to-server from the shared korapay-webhook-router, never
// a logged-in user's request. No requireAuth; the two checks below (router
// secret, then the real KoraPay signature) are the actual proof of origin.
export const korapayWebhook = asyncHandler(async (req: Request, res: Response) => {
  if (env.ROUTER_FORWARD_SECRET && req.headers['x-router-secret'] !== env.ROUTER_FORWARD_SECRET) {
    // Genuinely not from our router — a 4xx here is correct (the router
    // acks a destination 4xx to KoraPay and doesn't retry; retrying a
    // forged request wouldn't help anyway).
    throw ApiError.unauthorized('Invalid router secret');
  }

  const signatureHeader = req.headers['x-korapay-signature'] as string | undefined;
  if (!verifyKorapaySignature(req.body?.data, signatureHeader)) {
    throw ApiError.unauthorized('Invalid signature');
  }

  // Verified — respond fast, per the router doc's instruction not to make
  // KoraPay/the router wait on slow downstream work. The actual DB writes
  // here are fast (a couple of indexed lookups), so awaiting inline is
  // fine; nothing here calls out to another slow third party.
  if (req.body?.event === 'charge.success' && req.body?.data?.status === 'success') {
    await handleChargeSuccess(req.body.data.reference);
  }

  res.status(200).json({ ok: true });
});

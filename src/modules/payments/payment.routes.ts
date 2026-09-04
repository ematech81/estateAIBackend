import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { checkout, korapayWebhook } from './payment.controller';

// Authenticated surface — mounted at /api/payments in app.ts.
export const paymentRouter = Router();
paymentRouter.post('/checkout', requireAuth, checkout);

// Public surface — deliberately its own Router/mount point
// (/api/webhooks/korapay), physically separate from the authed one above
// so it's obvious at a glance that this route carries no auth middleware.
export const korapayWebhookRouter = Router();
korapayWebhookRouter.post('/', korapayWebhook);

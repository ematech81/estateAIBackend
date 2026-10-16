import { Router } from 'express';
import { requireAdmin, requireAuth } from '../../middleware/auth.middleware';
import {
  activity,
  listings,
  moderation,
  overview,
  payments,
  suspension,
  userDetail,
  users,
  verification,
} from './admin.controller';

export const adminRouter = Router();

// Every route on this router is admin-only, so one blanket guard is safe
// (same reasoning as blogAdmin.routes.ts).
adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/overview', overview);
adminRouter.get('/users', users);
adminRouter.get('/users/:id', userDetail);
adminRouter.patch('/users/:id/verification', verification);
adminRouter.patch('/users/:id/suspension', suspension);
adminRouter.get('/listings', listings);
adminRouter.patch('/listings/:id/moderation', moderation);
adminRouter.get('/payments', payments);
adminRouter.get('/activity', activity);

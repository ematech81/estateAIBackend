import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { mine } from './analytics.controller';

export const analyticsRouter = Router();

analyticsRouter.get('/mine', requireAuth, mine);

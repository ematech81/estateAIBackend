import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { mine, performance } from './analytics.controller';

export const analyticsRouter = Router();

analyticsRouter.get('/mine', requireAuth, mine);
analyticsRouter.get('/performance', requireAuth, performance);

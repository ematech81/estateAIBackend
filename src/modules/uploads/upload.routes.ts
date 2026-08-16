import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { signature } from './upload.controller';

export const uploadRouter = Router();

// Auth-gated so random visitors can't spend our Cloudinary quota.
uploadRouter.post('/signature', requireAuth, signature);

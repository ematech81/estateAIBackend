import { Router } from 'express';
import { optionalAuth } from '../../middleware/auth.middleware';
import { track } from './event.controller';

export const eventRouter = Router();

eventRouter.post('/', optionalAuth, track);

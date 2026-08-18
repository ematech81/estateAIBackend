import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { deleteMe, getAgent, listAgents, me, updateMe, updatePassword } from './user.controller';

export const userRouter = Router();

// Public — the agent directory (Header's "Agents" link).
userRouter.get('/agents', listAgents);
userRouter.get('/agents/:id', getAgent);

// Authenticated.
userRouter.get('/me', requireAuth, me);
userRouter.patch('/me', requireAuth, updateMe);
userRouter.patch('/me/password', requireAuth, updatePassword);
userRouter.delete('/me', requireAuth, deleteMe);

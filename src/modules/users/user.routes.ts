import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import { me, updateMe } from './user.controller';

export const userRouter = Router();

userRouter.use(requireAuth);
userRouter.get('/me', me);
userRouter.patch('/me', updateMe);

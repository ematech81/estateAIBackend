import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.middleware';
import {
  forgotPassword,
  login,
  register,
  resendVerification,
  resetPasswordHandler,
  verifyEmailHandler,
} from './auth.controller';

export const authRouter = Router();

authRouter.post('/register', register);
authRouter.post('/login', login);
authRouter.post('/forgot-password', forgotPassword);
authRouter.post('/reset-password', resetPasswordHandler);
authRouter.post('/verify-email', verifyEmailHandler);
authRouter.post('/resend-verification', requireAuth, resendVerification);

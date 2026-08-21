import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { toPublicUser } from '../../models/User';
import { forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from './auth.validation';
import { loginUser, registerUser, requestPasswordReset, resetPassword } from './auth.service';

export const register = asyncHandler(async (req: Request, res: Response) => {
  const input = registerSchema.parse(req.body);
  const { token, user } = await registerUser(input);
  res.status(201).json({ token, user: toPublicUser(user) });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const input = loginSchema.parse(req.body);
  const { token, user } = await loginUser(input);
  res.status(200).json({ token, user: toPublicUser(user) });
});

const GENERIC_RESET_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const input = forgotPasswordSchema.parse(req.body);
  try {
    await requestPasswordReset(input.email);
  } catch (err) {
    // Never let a misconfigured/unavailable email provider leak to the
    // client, and never let it reveal whether the account existed — log
    // server-side only, respond with the exact same message either way.
    console.error('Password reset email failed to send:', err);
  }
  res.status(200).json({ message: GENERIC_RESET_MESSAGE });
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const input = resetPasswordSchema.parse(req.body);
  await resetPassword(input.token, input.newPassword);
  res.status(200).json({ message: 'Password updated. You can now log in.' });
});

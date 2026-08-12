import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { toPublicUser } from '../../models/User';
import { loginSchema, registerSchema } from './auth.validation';
import { loginUser, registerUser } from './auth.service';

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

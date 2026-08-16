import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { toPublicUser } from '../../models/User';
import { getUserById, updateUser } from './user.service';
import { updateProfileSchema } from './user.validation';

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const user = await getUserById(req.user.sub);
  res.status(200).json({ user: toPublicUser(user) });
});

export const updateMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const input = updateProfileSchema.parse(req.body);
  const user = await updateUser(req.user.sub, input);
  res.status(200).json({ user: toPublicUser(user) });
});

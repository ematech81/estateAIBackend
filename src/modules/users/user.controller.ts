import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { toPublicUser } from '../../models/User';
import {
  changePassword,
  deleteAccount,
  getPublicAgentById,
  getUserById,
  listPublicAgents,
  updateUser,
} from './user.service';
import { changePasswordSchema, listAgentsSchema, updateProfileSchema } from './user.validation';

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

export const updatePassword = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const input = changePasswordSchema.parse(req.body);
  await changePassword(req.user.sub, input);
  res.status(200).json({ message: 'Password updated' });
});

export const deleteMe = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  await deleteAccount(req.user.sub);
  res.status(204).send();
});

// Public — no auth. Registered before requireAuth in user.routes.ts.
export const listAgents = asyncHandler(async (req: Request, res: Response) => {
  const input = listAgentsSchema.parse(req.query);
  const result = await listPublicAgents(input);
  res.status(200).json(result);
});

export const getAgent = asyncHandler(async (req: Request, res: Response) => {
  const agent = await getPublicAgentById(req.params.id);
  res.status(200).json({ agent });
});

import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import {
  getOverview,
  getUserDetail,
  listActivity,
  listListings,
  listPayments,
  listUsers,
  moderateListing,
  setUserSuspension,
  setUserVerification,
} from './admin.service';
import {
  listActivitySchema,
  listListingsSchema,
  listPaymentsSchema,
  listUsersSchema,
  moderateListingSchema,
  overviewQuerySchema,
  setSuspensionSchema,
  setVerificationSchema,
} from './admin.validation';

// Every route here sits behind requireAuth + requireAdmin (admin.routes.ts).
function adminId(req: Request): string {
  if (!req.user) throw ApiError.unauthorized();
  return req.user.sub;
}

export const overview = asyncHandler(async (req: Request, res: Response) => {
  const { days } = overviewQuerySchema.parse(req.query);
  res.status(200).json(await getOverview(days));
});

export const users = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listUsers(listUsersSchema.parse(req.query)));
});

export const userDetail = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await getUserDetail(req.params.id));
});

export const verification = asyncHandler(async (req: Request, res: Response) => {
  const { status } = setVerificationSchema.parse(req.body);
  const user = await setUserVerification(adminId(req), req.params.id, status);
  res.status(200).json({ user });
});

export const suspension = asyncHandler(async (req: Request, res: Response) => {
  const { suspended, reason } = setSuspensionSchema.parse(req.body);
  const user = await setUserSuspension(adminId(req), req.params.id, suspended, reason);
  res.status(200).json({ user });
});

export const listings = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listListings(listListingsSchema.parse(req.query)));
});

export const moderation = asyncHandler(async (req: Request, res: Response) => {
  const { action, note } = moderateListingSchema.parse(req.body);
  const listing = await moderateListing(adminId(req), req.params.id, action, note);
  res.status(200).json({ listing });
});

export const payments = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listPayments(listPaymentsSchema.parse(req.query)));
});

export const activity = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listActivity(listActivitySchema.parse(req.query)));
});

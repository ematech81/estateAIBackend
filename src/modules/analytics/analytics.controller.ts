import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { getMyAnalytics } from './analytics.service';

export const mine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const analytics = await getMyAnalytics(req.user.sub);
  res.status(200).json(analytics);
});

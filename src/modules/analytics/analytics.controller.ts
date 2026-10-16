import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { getMyAnalytics, getMyPerformance } from './analytics.service';

const performanceQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => [7, 30, 90].includes(d), 'days must be 7, 30 or 90')
    .default(30),
});

export const mine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const analytics = await getMyAnalytics(req.user.sub);
  res.status(200).json(analytics);
});

export const performance = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { days } = performanceQuerySchema.parse(req.query);
  const result = await getMyPerformance(req.user.sub, days);
  res.status(200).json(result);
});

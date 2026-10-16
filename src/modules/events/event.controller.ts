import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { recordEvent } from './event.service';
import { trackEventSchema } from './event.validation';

// Public — visitors don't sign in. optionalAuth (in event.routes.ts) only
// exists so an agent viewing their own listing isn't counted.
export const track = asyncHandler(async (req: Request, res: Response) => {
  const input = trackEventSchema.parse(req.body);
  const result = await recordEvent({ ...input, viewerId: req.user?.sub });
  res.status(202).json(result);
});

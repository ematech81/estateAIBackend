import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { getUploadSignature } from './upload.service';

export const signature = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json(getUploadSignature());
});

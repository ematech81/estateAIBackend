import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { createLead, getMyLeads, updateLeadStatus } from './lead.service';
import { createLeadSchema, updateLeadStatusSchema } from './lead.validation';

// Public — no auth. A seeker contacting an agent isn't necessarily a
// registered user. No rate-limiting/spam protection yet (known gap, not
// silently skipped — flagged for a follow-up once this sees real traffic).
export const create = asyncHandler(async (req: Request, res: Response) => {
  const input = createLeadSchema.parse(req.body);
  const lead = await createLead(input);
  res.status(201).json({ lead });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const leads = await getMyLeads(req.user.sub);
  res.status(200).json({ leads });
});

export const updateStatus = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { status } = updateLeadStatusSchema.parse(req.body);
  const lead = await updateLeadStatus(req.user.sub, req.params.id, status);
  res.status(200).json({ lead });
});

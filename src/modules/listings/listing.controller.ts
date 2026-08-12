import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { extractListingDraft } from '../../services/ai/extraction.service';
import { createListing, getMyListings, searchListings, updateListing } from './listing.service';
import {
  createListingSchema,
  draftRequestSchema,
  searchListingsSchema,
  updateListingSchema,
} from './listing.validation';

export const generateDraft = asyncHandler(async (req: Request, res: Response) => {
  const { text } = draftRequestSchema.parse(req.body);
  const draft = await extractListingDraft(text);
  res.status(200).json({ draft });
});

// Public — no auth. Registered before requireAuth in listing.routes.ts.
export const search = asyncHandler(async (req: Request, res: Response) => {
  const input = searchListingsSchema.parse(req.query);
  const listings = await searchListings(input);
  res.status(200).json({ listings });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const input = createListingSchema.parse(req.body);
  const listing = await createListing(req.user.sub, input);
  res.status(201).json({ listing });
});

export const listMine = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const listings = await getMyListings(req.user.sub);
  res.status(200).json({ listings });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const input = updateListingSchema.parse(req.body);
  const listing = await updateListing(req.user.sub, req.params.id, input);
  res.status(200).json({ listing });
});

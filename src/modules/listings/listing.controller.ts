import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ApiError } from '../../utils/ApiError';
import { recordEvent } from '../events/event.service';
import { contactRequestSchema } from '../events/event.validation';
import { extractListingDraft } from '../../services/ai/extraction.service';
import {
  createListing,
  getListingById,
  getListingContact,
  getMyListings,
  searchListings,
  updateListing,
} from './listing.service';
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
  const result = await searchListings(input);
  res.status(200).json(result);
});

// Public — no auth. Registered after '/mine' in listing.routes.ts so the
// literal path isn't shadowed by this param route.
export const getById = asyncHandler(async (req: Request, res: Response) => {
  const listing = await getListingById(req.params.id);
  res.status(200).json({ listing });
});

// Public — no auth (optionalAuth only so an agent's own preview isn't
// counted). A POST, not a GET, because handing out the agent's details is
// itself a tracked action: it records a `contact_reveal` event.
export const getContact = asyncHandler(async (req: Request, res: Response) => {
  const { visitorId } = contactRequestSchema.parse(req.body);
  const contact = await getListingContact(req.params.id);
  try {
    await recordEvent({ propertyId: req.params.id, type: 'contact_reveal', visitorId, viewerId: req.user?.sub });
  } catch (err) {
    // Analytics must never stop a seeker from getting the contact details.
    console.error('Recording contact_reveal failed:', err);
  }
  res.status(200).json({ contact });
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

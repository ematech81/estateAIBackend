import { z } from 'zod';

export const draftRequestSchema = z.object({
  text: z.string().min(10, 'Description is too short to extract anything useful from'),
});
export type DraftRequestInput = z.infer<typeof draftRequestSchema>;

// Strict schema for actually persisting a listing. Every hard constraint the
// master build prompt calls out (price, bedrooms, location) is enforced here
// deterministically — this is the gate the AI's draft output must pass
// through before it can become a real Property document, regardless of what
// the model produced or what the agent edited it to.
export const createListingSchema = z.object({
  title: z.string().min(5).max(150),
  description: z.string().min(10).max(5000),
  listingType: z.enum(['rent', 'sale', 'shortlet']),
  propertyType: z.enum([
    'apartment',
    'duplex',
    'bungalow',
    'terrace',
    'detached_house',
    'semi_detached_house',
    'land',
    'commercial',
    'other',
  ]),
  price: z.object({
    amount: z.number().positive('Price must be greater than 0'),
    currency: z.string().min(1).default('NGN'),
    period: z.enum(['yearly', 'monthly', 'one_time', 'nightly']),
  }),
  location: z.object({
    country: z.string().min(1).default('Nigeria'),
    state: z.string().optional(),
    city: z.string().min(1, 'City is required'),
    district: z.string().optional(),
    address: z.string().optional(),
    coordinates: z.object({ lat: z.number(), lng: z.number() }).optional(),
  }),
  specifications: z.object({
    bedrooms: z.number().int().min(0).optional(),
    bathrooms: z.number().int().min(0).optional(),
    sizeSqm: z.number().positive().optional(),
    amenities: z.array(z.string()).default([]),
  }),
  media: z.array(z.string()).default([]),
});
export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = createListingSchema.partial();
export type UpdateListingInput = z.infer<typeof updateListingSchema>;

// Public search — deliberately loose (plain text/city match, not the AI
// relevance-ranking "matching engine" described in Section 9 of the master
// build prompt, which isn't built yet). Query params only, so everything
// coerces from strings.
export const searchListingsSchema = z.object({
  q: z.string().trim().min(1).optional(),
  city: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(24).default(12),
});
export type SearchListingsInput = z.infer<typeof searchListingsSchema>;

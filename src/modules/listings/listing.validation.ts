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
  page: z.coerce.number().int().min(1).default(1),
  // International filter — no separate data source anymore (RentCast was
  // removed); "international" is just location.country !== 'Nigeria' on
  // our own agent-submitted listings.
  //
  // z.coerce.boolean() is NOT used here deliberately — it coerces via JS's
  // Boolean(), so the literal string "false" (any non-empty string, really)
  // becomes `true`. An explicit 'true'/'false' enum + transform avoids that.
  international: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
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
  ]).optional(),
  // Filtered on the raw price.amount regardless of currency — deliberately
  // not currency-aware/converted. Local listings are mostly NGN and
  // International mostly USD (very different scales), so a shared numeric
  // range only makes sense in the context of whichever tab is active. Known
  // simplification, not hidden.
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  // Powers the agent-detail page's "their listings" grid.
  agentId: z
    .string()
    .regex(/^[0-9a-fA-F]{24}$/, 'Invalid agent id')
    .optional(),
});
export type SearchListingsInput = z.infer<typeof searchListingsSchema>;

import { z } from 'zod';

// A "draft" is deliberately permissive/nullable — it reflects only what the
// AI could actually find in the agent's free text. Nothing here is trusted
// as final; the listing-creation endpoint re-validates everything with a
// strict schema before anything is persisted (see modules/listings/listing.validation.ts).
export const listingDraftSchema = z.object({
  title: z.string().nullable(),
  description: z.string(),
  listingType: z.enum(['rent', 'sale', 'shortlet']).nullable(),
  propertyType: z
    .enum([
      'apartment',
      'duplex',
      'bungalow',
      'terrace',
      'detached_house',
      'semi_detached_house',
      'land',
      'commercial',
      'other',
    ])
    .nullable(),
  price: z.object({
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    period: z.enum(['yearly', 'monthly', 'one_time', 'nightly']).nullable(),
  }),
  location: z.object({
    country: z.string().nullable(),
    state: z.string().nullable(),
    city: z.string().nullable(),
    district: z.string().nullable(),
    address: z.string().nullable(),
  }),
  specifications: z.object({
    bedrooms: z.number().nullable(),
    bathrooms: z.number().nullable(),
    sizeSqm: z.number().nullable(),
    amenities: z.array(z.string()),
  }),
});

export type ListingDraft = z.infer<typeof listingDraftSchema>;

/**
 * Service-abstraction boundary for LLM providers (Section 7 of the master
 * build prompt: "do not hard-code the app to one provider"). Any provider
 * plugged in here must follow the same non-negotiable rule: only extract
 * facts explicitly present in the input text, never invent values.
 */
export interface AIProvider {
  extractListingDraft(rawText: string): Promise<ListingDraft>;
}

import { z } from 'zod';

// Random id from the visitor's browser — constrained so it can't be used to
// stuff arbitrary payloads into the database.
export const visitorIdSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'Invalid visitorId');

export const trackEventSchema = z.object({
  propertyId: z.string().min(1),
  // contact_reveal is deliberately not accepted here — it's recorded
  // server-side when the contact details are actually handed out, so it
  // can't be inflated without really revealing them.
  type: z.enum(['view', 'contact_click']),
  visitorId: visitorIdSchema,
});
export type TrackEventInput = z.infer<typeof trackEventSchema>;

export const contactRequestSchema = z.object({ visitorId: visitorIdSchema });

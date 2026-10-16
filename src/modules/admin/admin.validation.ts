import { z } from 'zod';

const page = z.coerce.number().int().min(1).default(1);
const limit = z.coerce.number().int().min(1).max(100).default(20);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');
// 'true'/'false' query strings — z.coerce.boolean() would treat "false" as true.
const boolString = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

export const overviewQuerySchema = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((d) => [7, 30, 90].includes(d), 'days must be 7, 30 or 90')
    .default(30),
});

export const listUsersSchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  role: z.enum(['agent', 'agency', 'owner', 'admin']).optional(),
  plan: z.enum(['free', 'basic', 'premium']).optional(),
  emailVerified: boolString,
  suspended: boolString,
  verification: z.enum(['unverified', 'pending', 'verified']).optional(),
  page,
  limit,
});
export type ListUsersInput = z.infer<typeof listUsersSchema>;

export const setVerificationSchema = z.object({
  status: z.enum(['unverified', 'pending', 'verified']),
});

export const setSuspensionSchema = z.object({
  suspended: z.boolean(),
  reason: z.string().trim().max(500).optional(),
});

export const listListingsSchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['draft', 'pending_review', 'active', 'inactive']).optional(),
  listingType: z.enum(['rent', 'sale', 'shortlet']).optional(),
  removed: boolString,
  agentId: objectId.optional(),
  page,
  limit,
});
export type ListListingsInput = z.infer<typeof listListingsSchema>;

export const moderateListingSchema = z.object({
  action: z.enum(['remove', 'restore']),
  note: z.string().trim().max(500).optional(),
});

export const listPaymentsSchema = z.object({
  status: z.enum(['pending', 'success', 'failed']).optional(),
  plan: z.enum(['basic', 'premium']).optional(),
  page,
  limit,
});
export type ListPaymentsInput = z.infer<typeof listPaymentsSchema>;

export const listActivitySchema = z.object({ page, limit });
export type ListActivityInput = z.infer<typeof listActivitySchema>;

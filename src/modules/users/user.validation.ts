import { z } from 'zod';

// Deliberately excludes email/password/role — changing those needs
// re-verification/uniqueness handling not built in this milestone.
export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  phone: z.string().min(7).optional(),
  businessName: z.string().min(2).optional(),
  primaryLocation: z.string().min(2).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

// Public agent directory — no auth, no free-text search (that's what the
// property search is for); just pagination.
export const listAgentsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(24).default(12),
  page: z.coerce.number().int().min(1).default(1),
});
export type ListAgentsInput = z.infer<typeof listAgentsSchema>;

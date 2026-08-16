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

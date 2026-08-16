import { z } from 'zod';

export const createLeadSchema = z.object({
  propertyId: z.string().min(1),
  name: z.string().min(2),
  email: z.string().email(),
  phone: z.string().min(7).optional(),
  message: z.string().max(2000).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadStatusSchema = z.object({
  status: z.enum(['new', 'contacted', 'closed']),
});
export type UpdateLeadStatusInput = z.infer<typeof updateLeadStatusSchema>;

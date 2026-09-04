import { z } from 'zod';
import { PAYABLE_PLANS } from '../../config/plans';

export const initiateCheckoutSchema = z.object({
  plan: z.enum(PAYABLE_PLANS),
});
export type InitiateCheckoutInput = z.infer<typeof initiateCheckoutSchema>;

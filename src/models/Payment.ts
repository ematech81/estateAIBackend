import { Schema, model, Document, Types } from 'mongoose';
import { PayablePlan } from '../config/plans';

export type PaymentStatus = 'pending' | 'success' | 'failed';

// One row per checkout attempt. checkoutReference (not _id) is what the
// KoraPay webhook looks up by — per the shared-router doc, references are
// {PREFIX}-{uuid}, generated here, never the Mongo _id.
export interface IPayment extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  plan: PayablePlan;
  amount: number; // whole Naira (see payment.service.ts for the "confirm, don't assume" note)
  currency: string;
  checkoutReference: string;
  checkoutUrl?: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: String, enum: ['basic', 'premium'], required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'NGN' },
    checkoutReference: { type: String, required: true, unique: true },
    checkoutUrl: { type: String },
    status: { type: String, enum: ['pending', 'success', 'failed'], default: 'pending' },
  },
  { timestamps: true },
);

paymentSchema.index({ user: 1, createdAt: -1 });

export const Payment = model<IPayment>('Payment', paymentSchema);

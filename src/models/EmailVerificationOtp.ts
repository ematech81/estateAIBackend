import { Schema, model, Document, Types } from 'mongoose';

// One live email-verification code per user. The code itself is never stored
// — only an HMAC of it — and it dies after `expiresAt` (TTL index) or after
// too many wrong guesses. Separate from PasswordResetToken on purpose: that
// one is a long random link token, this is a short human-typed code, so it
// needs attempt-limiting that a 256-bit token doesn't.
export interface IEmailVerificationOtp extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
  // Drives the resend cooldown.
  lastSentAt: Date;
}

const emailVerificationOtpSchema = new Schema<IEmailVerificationOtp>({
  user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  lastSentAt: { type: Date, required: true },
});

emailVerificationOtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationOtp = model<IEmailVerificationOtp>('EmailVerificationOtp', emailVerificationOtpSchema);

import { Schema, model, Document, Types } from 'mongoose';

// Same shape and same reasoning as PasswordResetToken — kept as a separate
// model rather than one generic "VerificationToken" with a purpose field,
// so each model's single job stays obvious at a glance (and a bug in one
// flow's queries can't accidentally touch the other's tokens).
export interface IEmailVerificationToken extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const emailVerificationTokenSchema = new Schema<IEmailVerificationToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

emailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailVerificationToken = model<IEmailVerificationToken>(
  'EmailVerificationToken',
  emailVerificationTokenSchema,
);

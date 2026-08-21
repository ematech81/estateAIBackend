import { Schema, model, Document, Types } from 'mongoose';

// Only the hash is ever stored — same principle as a password. The raw
// token goes out in the email link and never touches the database, so a DB
// leak alone can't be used to reset anyone's password.
export interface IPasswordResetToken extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const passwordResetTokenSchema = new Schema<IPasswordResetToken>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// TTL index — MongoDB automatically deletes a document once its expiresAt
// has passed, so expired/used tokens don't need a manual cleanup job.
passwordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetToken = model<IPasswordResetToken>('PasswordResetToken', passwordResetTokenSchema);

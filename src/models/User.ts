import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'agent' | 'agency' | 'owner' | 'admin';
export type VerificationStatus = 'unverified' | 'pending' | 'verified';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  hashedPassword: string;
  role: UserRole;
  name: string;
  phone?: string;
  businessName?: string;
  verificationStatus: VerificationStatus;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    hashedPassword: { type: String, required: true },
    role: { type: String, enum: ['agent', 'agency', 'owner', 'admin'], required: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    businessName: { type: String, trim: true },
    // Foundation only for this milestone — no KYC/document verification flow yet.
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified'],
      default: 'unverified',
    },
  },
  { timestamps: true },
);

export const User = model<IUser>('User', userSchema);

/** Strips sensitive fields before a user document is ever sent in a response. */
export function toPublicUser(user: IUser) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    businessName: user.businessName,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt,
  };
}

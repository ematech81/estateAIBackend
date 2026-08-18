import { Schema, model, Document, Types } from 'mongoose';
import { Property } from './Property';
import { Lead } from './Lead';

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
  // Free-text for now (e.g. "Ikoyi, Lagos") — the agent's stated base of
  // operations, not a listing location. Useful later for per-city outreach
  // prioritization (Section 5: "inventory density per city").
  primaryLocation?: string;
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
    primaryLocation: { type: String, trim: true },
    // Foundation only for this milestone — no KYC/document verification flow yet.
    verificationStatus: {
      type: String,
      enum: ['unverified', 'pending', 'verified'],
      default: 'unverified',
    },
  },
  { timestamps: true },
);

// Cascade delete — MongoDB has no foreign-key/cascade support of its own,
// and a Property's `createdBy` is just an unenforced ObjectId reference.
// Without this, deleting a user (through the app) would silently orphan
// their listings and leads rather than actually removing them.
//
// IMPORTANT: this only fires when Mongoose itself performs the delete (i.e.
// through this app's code). A document removed directly in the Atlas UI or
// mongosh bypasses the app entirely, so nothing here runs for that case —
// there's no way to hook a raw database operation from application code.
async function cascadeDeleteForUserIds(userIds: Types.ObjectId[]): Promise<void> {
  if (userIds.length === 0) return;
  await Promise.all([
    Property.deleteMany({ createdBy: { $in: userIds } }),
    Lead.deleteMany({ agent: { $in: userIds } }),
  ]);
}

userSchema.pre('findOneAndDelete', async function (next) {
  const user = await this.model.findOne(this.getFilter()).select('_id');
  if (user) await cascadeDeleteForUserIds([user._id]);
  next();
});

userSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  await cascadeDeleteForUserIds([this._id]);
  next();
});

userSchema.pre('deleteMany', async function (next) {
  const ids = await this.model.find(this.getFilter()).select('_id');
  await cascadeDeleteForUserIds(ids.map((u) => u._id));
  next();
});

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
    primaryLocation: user.primaryLocation,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt,
  };
}

/**
 * Public agent-directory shape — deliberately excludes email/phone. Contact
 * goes through a listing's lead-capture form, not a public directory
 * (Section 13.5: never expose sensitive agent/user info unnecessarily).
 */
export function toPublicAgent(user: IUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    role: user.role,
    businessName: user.businessName,
    primaryLocation: user.primaryLocation,
    verificationStatus: user.verificationStatus,
    createdAt: user.createdAt,
  };
}

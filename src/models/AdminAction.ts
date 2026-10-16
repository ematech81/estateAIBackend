import { Schema, model, Document, Types } from 'mongoose';

// Append-only audit trail of everything an admin changes — who did what to
// which record, and when. Shown on the admin dashboard's Activity page.
export type AdminActionType =
  | 'user.suspend'
  | 'user.unsuspend'
  | 'user.verify'
  | 'user.unverify'
  | 'listing.remove'
  | 'listing.restore'
  | 'blog.create'
  | 'blog.update'
  | 'blog.delete';

export type AdminActionTarget = 'user' | 'listing' | 'blog';

export interface IAdminAction extends Document {
  _id: Types.ObjectId;
  admin: Types.ObjectId;
  type: AdminActionType;
  targetType: AdminActionTarget;
  targetId: Types.ObjectId;
  // Human-readable snapshot (e.g. the user's email, the listing title) so the
  // log still reads sensibly after the target is renamed or deleted.
  targetLabel: string;
  note?: string;
  createdAt: Date;
}

const adminActionSchema = new Schema<IAdminAction>(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    targetType: { type: String, enum: ['user', 'listing', 'blog'], required: true },
    targetId: { type: Schema.Types.ObjectId, required: true },
    targetLabel: { type: String, required: true },
    note: { type: String, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

adminActionSchema.index({ createdAt: -1 });

export const AdminAction = model<IAdminAction>('AdminAction', adminActionSchema);

export async function logAdminAction(input: {
  adminId: string;
  type: AdminActionType;
  targetType: AdminActionTarget;
  targetId: Types.ObjectId | string;
  targetLabel: string;
  note?: string;
}): Promise<void> {
  await AdminAction.create({
    admin: input.adminId,
    type: input.type,
    targetType: input.targetType,
    targetId: input.targetId,
    targetLabel: input.targetLabel,
    note: input.note,
  });
}

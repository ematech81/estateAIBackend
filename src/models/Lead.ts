import { Schema, model, Document, Types } from 'mongoose';

export type LeadStatus = 'new' | 'contacted' | 'closed';

export interface ILead extends Document {
  _id: Types.ObjectId;
  property: Types.ObjectId;
  // Denormalized from the property's createdBy at creation time — lets
  // "my leads" query directly on Lead without joining through Property.
  agent: Types.ObjectId;
  name: string;
  email: string;
  phone?: string;
  message?: string;
  status: LeadStatus;
  createdAt: Date;
  updatedAt: Date;
}

const leadSchema = new Schema<ILead>(
  {
    property: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    agent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    message: { type: String, trim: true },
    status: { type: String, enum: ['new', 'contacted', 'closed'], default: 'new' },
  },
  { timestamps: true },
);

leadSchema.index({ agent: 1, createdAt: -1 });

export const Lead = model<ILead>('Lead', leadSchema);

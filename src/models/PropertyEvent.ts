import { Schema, model, Document, Types } from 'mongoose';

// What a seeker did on a listing:
//  - view:           opened the property details page (this is what both the
//                    card's "Details" and "Contact the Agent" buttons lead to)
//  - contact_click:  clicked "Contact the Agent" on the details page
//  - contact_reveal: accepted the notice and was shown the agent's details
export type PropertyEventType = 'view' | 'contact_click' | 'contact_reveal';
export const PROPERTY_EVENT_TYPES: PropertyEventType[] = ['view', 'contact_click', 'contact_reveal'];

export interface IPropertyEvent extends Document {
  _id: Types.ObjectId;
  property: Types.ObjectId;
  // Denormalized from the property's createdBy at write time so an agent's
  // stats are one indexed query, with no join through Property.
  agent: Types.ObjectId;
  type: PropertyEventType;
  // Random anonymous id generated in the visitor's browser (visitors never
  // sign in). Only used to count *unique* visitors — it identifies no one.
  visitorId: string;
  createdAt: Date;
}

const propertyEventSchema = new Schema<IPropertyEvent>(
  {
    property: { type: Schema.Types.ObjectId, ref: 'Property', required: true },
    agent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: PROPERTY_EVENT_TYPES, required: true },
    visitorId: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

propertyEventSchema.index({ agent: 1, createdAt: -1 });
propertyEventSchema.index({ property: 1, visitorId: 1, type: 1, createdAt: -1 });

export const PropertyEvent = model<IPropertyEvent>('PropertyEvent', propertyEventSchema);

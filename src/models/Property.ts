import { Schema, model, Document, Types } from 'mongoose';

// Canonical property schema — Section 9 of the master build prompt.
// Every source (internal Nigerian listings, RentCast, future providers) is
// normalized into this exact shape before it ever reaches the frontend.

export type PropertySource = 'internal' | 'rentcast';
export type ListingType = 'rent' | 'sale' | 'shortlet';
export type PropertyType =
  | 'apartment'
  | 'duplex'
  | 'bungalow'
  | 'terrace'
  | 'detached_house'
  | 'semi_detached_house'
  | 'land'
  | 'commercial'
  | 'other';
export type PropertyStatus = 'draft' | 'pending_review' | 'active' | 'inactive';
export type PricePeriod = 'yearly' | 'monthly' | 'one_time' | 'nightly';

export interface IPropertyPrice {
  amount: number;
  currency: string;
  period: PricePeriod;
}

export interface IPropertyLocation {
  country: string;
  state?: string;
  city: string;
  district?: string;
  address?: string;
  coordinates?: { lat: number; lng: number };
}

export interface IPropertySpecifications {
  bedrooms?: number;
  bathrooms?: number;
  sizeSqm?: number;
  amenities: string[];
}

export interface IProperty extends Document {
  _id: Types.ObjectId;
  source: PropertySource;
  sourcePropertyId?: string;
  createdBy: Types.ObjectId;
  title: string;
  description: string;
  listingType: ListingType;
  propertyType: PropertyType;
  status: PropertyStatus;
  price: IPropertyPrice;
  location: IPropertyLocation;
  specifications: IPropertySpecifications;
  media: string[];
  createdAt: Date;
  updatedAt: Date;
}

const priceSchema = new Schema<IPropertyPrice>(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: 'NGN' },
    period: { type: String, enum: ['yearly', 'monthly', 'one_time', 'nightly'], required: true },
  },
  { _id: false },
);

const locationSchema = new Schema<IPropertyLocation>(
  {
    country: { type: String, required: true, default: 'Nigeria' },
    state: { type: String, trim: true },
    city: { type: String, required: true, trim: true },
    district: { type: String, trim: true },
    address: { type: String, trim: true },
    coordinates: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { _id: false },
);

const specificationsSchema = new Schema<IPropertySpecifications>(
  {
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    sizeSqm: { type: Number, min: 0 },
    amenities: { type: [String], default: [] },
  },
  { _id: false },
);

const propertySchema = new Schema<IProperty>(
  {
    source: { type: String, enum: ['internal', 'rentcast'], required: true, default: 'internal' },
    sourcePropertyId: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    listingType: { type: String, enum: ['rent', 'sale', 'shortlet'], required: true },
    propertyType: {
      type: String,
      enum: [
        'apartment',
        'duplex',
        'bungalow',
        'terrace',
        'detached_house',
        'semi_detached_house',
        'land',
        'commercial',
        'other',
      ],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'pending_review', 'active', 'inactive'],
      default: 'pending_review',
    },
    price: { type: priceSchema, required: true },
    location: { type: locationSchema, required: true },
    specifications: { type: specificationsSchema, required: true, default: () => ({ amenities: [] }) },
    media: { type: [String], default: [] },
  },
  { timestamps: true },
);

propertySchema.index({ 'location.city': 1 });
propertySchema.index({ status: 1 });
propertySchema.index({ createdBy: 1 });

export const Property = model<IProperty>('Property', propertySchema);

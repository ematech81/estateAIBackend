import { Types } from 'mongoose';
import { Property } from '../../models/Property';
import { ApiError } from '../../utils/ApiError';
import { CreateListingInput, UpdateListingInput } from './listing.validation';

export async function createListing(userId: string, input: CreateListingInput) {
  return Property.create({
    ...input,
    source: 'internal',
    createdBy: new Types.ObjectId(userId),
    status: 'pending_review',
  });
}

export async function getMyListings(userId: string) {
  return Property.find({ createdBy: userId }).sort({ createdAt: -1 });
}

export async function updateListing(userId: string, listingId: string, input: UpdateListingInput) {
  const listing = await Property.findById(listingId);
  if (!listing) {
    throw ApiError.notFound('Listing not found');
  }
  if (listing.createdBy.toString() !== userId) {
    throw ApiError.forbidden('You do not have access to this listing');
  }

  Object.assign(listing, input);
  await listing.save();
  return listing;
}

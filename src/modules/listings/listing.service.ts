import { Types } from 'mongoose';
import { Property } from '../../models/Property';
import { ApiError } from '../../utils/ApiError';
import { CreateListingInput, SearchListingsInput, UpdateListingInput } from './listing.validation';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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

// Public search. Intentionally basic — plain text/city matching, not the AI
// relevance-ranking "matching engine" from Section 9 (not built yet). No
// moderation/approval pipeline exists yet either, so both `pending_review`
// and `active` are treated as publicly visible for now; narrow this to
// `active` only once an approval step exists.
export async function searchListings({ q, city, limit }: SearchListingsInput) {
  const filter: Record<string, unknown> = { status: { $in: ['pending_review', 'active'] } };

  if (city) {
    filter['location.city'] = new RegExp(escapeRegex(city), 'i');
  }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }, { 'location.city': pattern }];
  }

  const listings = await Property.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    // Only the one non-sensitive field needed to decide whether to show a
    // "Verified" badge — never leak the agent's email/phone/etc. here
    // (Section 13.5: never expose sensitive agent/user info unnecessarily).
    .populate<{ createdBy: { verificationStatus: string } }>('createdBy', 'verificationStatus');

  return listings.map((listing) => {
    const { createdBy, ...rest } = listing.toObject();
    const agentVerified =
      (createdBy as unknown as { verificationStatus?: string })?.verificationStatus === 'verified';
    return { ...rest, agentVerified };
  });
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

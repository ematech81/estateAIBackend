import { Types, isValidObjectId } from 'mongoose';
import { Property } from '../../models/Property';
import { ApiError } from '../../utils/ApiError';
import { CreateListingInput, SearchListingsInput, UpdateListingInput } from './listing.validation';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Shared by searchListings and getListingById — strips createdBy down to
// the one derived boolean the UI needs (Section 13.5: never expose
// sensitive agent/user info unnecessarily).
type WithPopulatedCreator = { createdBy: unknown; toObject: () => Record<string, unknown> };
function toPublicListing(listing: WithPopulatedCreator) {
  const { createdBy, ...rest } = listing.toObject();
  const agentVerified =
    (createdBy as { verificationStatus?: string } | undefined)?.verificationStatus === 'verified';
  return { ...rest, agentVerified };
}

export async function createListing(userId: string, input: CreateListingInput) {
  return Property.create({
    ...input,
    source: 'internal',
    createdBy: new Types.ObjectId(userId),
    // No moderation queue exists yet — publish straight to 'active' rather
    // than sitting in a misleading "pending_review" that nothing ever
    // reviews. Revert to 'pending_review' once the admin approval flow
    // (Section 10) is built, so it means something again.
    status: 'active',
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
export async function searchListings({
  q,
  city,
  limit,
  page,
  international,
  propertyType,
  minPrice,
  maxPrice,
  agentId,
}: SearchListingsInput) {
  const filter: Record<string, unknown> = { status: { $in: ['pending_review', 'active'] } };

  if (city) {
    filter['location.city'] = new RegExp(escapeRegex(city), 'i');
  }
  if (q) {
    const pattern = new RegExp(escapeRegex(q), 'i');
    filter.$or = [{ title: pattern }, { description: pattern }, { 'location.city': pattern }];
  }
  if (international != null) {
    filter['location.country'] = international ? { $ne: 'Nigeria' } : 'Nigeria';
  }
  if (propertyType) {
    filter.propertyType = propertyType;
  }
  if (minPrice != null || maxPrice != null) {
    filter['price.amount'] = {
      ...(minPrice != null ? { $gte: minPrice } : {}),
      ...(maxPrice != null ? { $lte: maxPrice } : {}),
    };
  }
  if (agentId) {
    filter.createdBy = new Types.ObjectId(agentId);
  }

  const skip = (page - 1) * limit;

  // Run the page fetch and the total count in parallel — count doesn't
  // depend on the page's results, no reason to serialize them.
  const [listings, total] = await Promise.all([
    Property.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      // Only the one non-sensitive field needed to decide whether to show a
      // "Verified" badge — never leak the agent's email/phone/etc. here
      // (Section 13.5: never expose sensitive agent/user info unnecessarily).
      .populate<{ createdBy: { verificationStatus: string } }>('createdBy', 'verificationStatus'),
    Property.countDocuments(filter),
  ]);

  return {
    listings: listings.map(toPublicListing),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

// Public single-listing fetch — same visibility rule as search (only
// pending_review/active), so a draft can't be viewed just by guessing its id.
export async function getListingById(id: string) {
  // A public route gets hit with arbitrary garbage in the URL far more than
  // the auth-gated ones — a malformed id should 404, not fall through to a
  // Mongoose CastError and a generic 500.
  if (!isValidObjectId(id)) {
    throw ApiError.notFound('Listing not found');
  }

  const listing = await Property.findOne({ _id: id, status: { $in: ['pending_review', 'active'] } }).populate<{
    createdBy: { verificationStatus: string };
  }>('createdBy', 'verificationStatus');

  if (!listing) {
    throw ApiError.notFound('Listing not found');
  }

  return toPublicListing(listing);
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

import { Types, isValidObjectId } from 'mongoose';
import { Property } from '../../models/Property';
import { User } from '../../models/User';
import { ApiError } from '../../utils/ApiError';
import { PLANS, PlanTier } from '../../config/plans';
import { getEffectivePlanTier } from '../../services/plans/plan.service';
import { notifyNewListingIfPremium } from '../payments/payment.service';
import { CreateListingInput, SearchListingsInput, UpdateListingInput } from './listing.validation';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type PopulatedCreator = { verificationStatus?: string; planTier?: PlanTier; planExpiresAt?: Date };

// Shared by searchListings and getListingById — strips createdBy down to
// the derived fields the UI/SEO logic actually needs (Section 13.5: never
// expose sensitive agent/user info unnecessarily — no email/phone/raw
// plan-tier string ever leaves this function).
type WithPopulatedCreator = { createdBy: unknown; toObject: () => Record<string, unknown> };
function toPublicListing(listing: WithPopulatedCreator) {
  const { createdBy, ...rest } = listing.toObject();
  const creator = createdBy as PopulatedCreator | undefined;
  const agentVerified = creator?.verificationStatus === 'verified';
  const effectiveTier: PlanTier = creator
    ? getEffectivePlanTier({ planTier: creator.planTier ?? 'free', planExpiresAt: creator.planExpiresAt })
    : 'free';
  return {
    ...rest,
    agentVerified,
    // "Promoted"-style badge on Basic/Premium listings — makes the
    // "priority on search results" feature actually visible, not just an
    // invisible sort order.
    featured: effectiveTier !== 'free',
    googleIndexable: PLANS[effectiveTier].googleIndexable,
  };
}

const CREATOR_PLAN_FIELDS = 'verificationStatus planTier planExpiresAt';

export async function createListing(userId: string, input: CreateListingInput) {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.unauthorized();
  }

  const effectiveTier = getEffectivePlanTier(user);
  const quota = PLANS[effectiveTier].listingQuotaPerMonth;
  if (quota !== Infinity) {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const countThisMonth = await Property.countDocuments({
      createdBy: userId,
      createdAt: { $gte: startOfMonth },
    });
    if (countThisMonth >= quota) {
      throw ApiError.forbidden(
        `You've reached your ${PLANS[effectiveTier].name} plan's limit of ${quota} listing${quota === 1 ? '' : 's'} this month. Upgrade to list more.`,
      );
    }
  }

  const listing = await Property.create({
    ...input,
    source: 'internal',
    createdBy: new Types.ObjectId(userId),
    // No moderation queue exists yet — publish straight to 'active' rather
    // than sitting in a misleading "pending_review" that nothing ever
    // reviews. Revert to 'pending_review' once the admin approval flow
    // (Section 10) is built, so it means something again.
    status: 'active',
  });

  // Fire-and-forget — a Premium agent's new listing triggers an opt-in
  // email to other users. Never blocks or fails listing creation itself.
  notifyNewListingIfPremium(listing, userId).catch((err) => {
    console.error('New-listing notification failed:', err);
  });

  return listing;
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
  const now = new Date();

  // Aggregation (not a plain .find().sort()) because "priority on search
  // results" sorts by the LISTING OWNER's plan, a joined field — Mongoose
  // can't sort by a populated field's value without one. Paid (effective,
  // non-expired) listings sort first, then most-recent within each tier.
  const [listings, total] = await Promise.all([
    Property.aggregate([
      { $match: filter },
      {
        $lookup: {
          from: 'users',
          localField: 'createdBy',
          foreignField: '_id',
          as: 'creator',
        },
      },
      { $unwind: '$creator' },
      {
        $addFields: {
          agentVerified: { $eq: ['$creator.verificationStatus', 'verified'] },
          _planActive: { $and: [{ $ne: ['$creator.planTier', 'free'] }, { $gt: ['$creator.planExpiresAt', now] }] },
          _searchPriority: {
            $switch: {
              branches: [
                {
                  case: {
                    $and: [{ $eq: ['$creator.planTier', 'premium'] }, { $gt: ['$creator.planExpiresAt', now] }],
                  },
                  then: PLANS.premium.searchPriority,
                },
                {
                  case: {
                    $and: [{ $eq: ['$creator.planTier', 'basic'] }, { $gt: ['$creator.planExpiresAt', now] }],
                  },
                  then: PLANS.basic.searchPriority,
                },
              ],
              default: PLANS.free.searchPriority,
            },
          },
        },
      },
      { $addFields: { featured: '$_planActive' } },
      { $sort: { _searchPriority: -1, createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { creator: 0, _planActive: 0, _searchPriority: 0 } },
    ]),
    Property.countDocuments(filter),
  ]);

  return {
    listings,
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
    createdBy: PopulatedCreator;
  }>('createdBy', CREATOR_PLAN_FIELDS);

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

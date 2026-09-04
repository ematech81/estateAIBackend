// Single source of truth for what each subscription tier actually gets.
// Static config, not DB-driven — there's no admin UI for managing plans,
// and three fixed tiers don't need one yet.
export type PlanTier = 'free' | 'basic' | 'premium';

export interface PlanConfig {
  name: string;
  priceNGN: number;
  // null = never expires (free). A number of days = a fixed-duration pass,
  // manually renewed by purchasing again — not auto-recurring billing.
  // KoraPay's charge-initialize flow (see payment.service.ts) is a one-off
  // charge confirmation, not card tokenization/auto-charge; building real
  // recurring billing (saved cards, dunning on failed renewals) is a
  // separate, much bigger feature this deliberately doesn't take on yet.
  durationDays: number | null;
  // Monthly listing-creation quota. Infinity = unlimited (checked with
  // `=== Infinity`, never serialized — this only ever lives server-side).
  listingQuotaPerMonth: number;
  // Higher sorts first in search results. Free and Basic/Premium are two
  // *different* priority values (not tied) — Premium ranks above Basic,
  // which costs nothing extra to do properly.
  searchPriority: number;
  // Whether creating a new listing on this plan triggers the opt-in
  // "new listing" email to other users (see notifyNewListingIfPremium).
  emailMarketingOnNewListing: boolean;
  // Whether this plan's listings are allowed to be indexed by search
  // engines (robots meta tag on the listing detail page). Deliberately a
  // per-listing-owner gate, not a blanket site setting.
  googleIndexable: boolean;
}

export const PLANS: Record<PlanTier, PlanConfig> = {
  free: {
    name: 'Free',
    priceNGN: 0,
    durationDays: null,
    listingQuotaPerMonth: 2,
    searchPriority: 0,
    emailMarketingOnNewListing: false,
    googleIndexable: false,
  },
  basic: {
    name: 'Basic',
    priceNGN: 5000,
    durationDays: 14,
    listingQuotaPerMonth: 10,
    searchPriority: 1,
    emailMarketingOnNewListing: false,
    googleIndexable: false,
  },
  premium: {
    name: 'Premium',
    priceNGN: 15000,
    durationDays: 30,
    listingQuotaPerMonth: Infinity,
    searchPriority: 2,
    emailMarketingOnNewListing: true,
    googleIndexable: true,
  },
};

// The only two tiers anyone actually pays for — used to validate the
// checkout request (you can't "buy" Free).
export const PAYABLE_PLANS = ['basic', 'premium'] as const;
export type PayablePlan = (typeof PAYABLE_PLANS)[number];

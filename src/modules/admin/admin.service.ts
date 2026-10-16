import { FilterQuery, Types, isValidObjectId } from 'mongoose';
import { AdminAction, logAdminAction } from '../../models/AdminAction';
import { Payment } from '../../models/Payment';
import { IProperty, Property } from '../../models/Property';
import { PropertyEvent } from '../../models/PropertyEvent';
import { IUser, User } from '../../models/User';
import { getEffectivePlanTier } from '../../services/plans/plan.service';
import { ApiError } from '../../utils/ApiError';
import {
  ListActivityInput,
  ListListingsInput,
  ListPaymentsInput,
  ListUsersInput,
} from './admin.validation';

const DAY_MS = 24 * 60 * 60 * 1000;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function paginate(page: number, limit: number) {
  return { skip: (page - 1) * limit, limit };
}

function pageMeta(total: number, page: number, limit: number) {
  return { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

function requireValidId(id: string, what: string): void {
  if (!isValidObjectId(id)) throw ApiError.notFound(`${what} not found`);
}

// Start of the UTC day `days - 1` days ago, so a series has exactly `days`
// daily buckets ending today.
function rangeStart(days: number): Date {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return new Date(today.getTime() - (days - 1) * DAY_MS);
}

function fillDaily(rows: { _id: string; value: number }[], since: Date, days: number) {
  const byDay = new Map(rows.map((r) => [r._id, r.value]));
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return { date, value: byDay.get(date) ?? 0 };
  });
}

const dayGroup = (field = '$createdAt') => ({ $dateToString: { format: '%Y-%m-%d', date: field } });

function toAdminUser(user: IUser) {
  return {
    id: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
    phone: user.phone,
    businessName: user.businessName,
    primaryLocation: user.primaryLocation,
    verificationStatus: user.verificationStatus,
    emailVerified: user.emailVerified,
    // The *effective* tier — an expired paid plan already reads as 'free'.
    planTier: getEffectivePlanTier(user),
    planExpiresAt: user.planExpiresAt,
    suspended: user.suspended === true,
    suspendedAt: user.suspendedAt,
    suspensionReason: user.suspensionReason,
    createdAt: user.createdAt,
  };
}

// ---------------------------------------------------------------- overview

export async function getOverview(days: number) {
  const since = rangeStart(days);
  const now = new Date();
  const nonAdmin = { role: { $ne: 'admin' } };
  const inRange = { createdAt: { $gte: since } };

  const [
    usersByRole,
    newUsers,
    emailVerifiedCount,
    identityVerifiedCount,
    suspendedCount,
    paidByTier,
    listingsByStatus,
    activeByType,
    newListings,
    topCities,
    revenueAllTime,
    revenueInRange,
    failedInRange,
    pendingPayments,
    eventsByType,
    uniqueVisitorRows,
    signupsDaily,
    listingsDaily,
    viewsDaily,
    revenueDaily,
    topListingRows,
    removedListings,
  ] = await Promise.all([
    User.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$role', count: { $sum: 1 } } }]),
    User.countDocuments({ ...nonAdmin, ...inRange }),
    User.countDocuments({ ...nonAdmin, emailVerified: true }),
    User.countDocuments({ ...nonAdmin, verificationStatus: 'verified' }),
    User.countDocuments({ suspended: true }),
    User.aggregate<{ _id: string; count: number }>([
      { $match: { planTier: { $in: ['basic', 'premium'] }, planExpiresAt: { $gt: now } } },
      { $group: { _id: '$planTier', count: { $sum: 1 } } },
    ]),
    Property.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Property.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$listingType', count: { $sum: 1 } } },
    ]),
    Property.countDocuments(inRange),
    Property.aggregate<{ _id: string; count: number }>([
      { $match: { status: 'active' } },
      { $group: { _id: '$location.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 },
    ]),
    Payment.aggregate<{ total: number; count: number }>([
      { $match: { status: 'success' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ total: number; count: number }>([
      { $match: { status: 'success', ...inRange } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
    Payment.countDocuments({ status: 'failed', ...inRange }),
    Payment.countDocuments({ status: 'pending' }),
    PropertyEvent.aggregate<{ _id: string; count: number }>([
      { $match: inRange },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
    PropertyEvent.aggregate<{ unique: number }>([
      { $match: { ...inRange, type: 'view' } },
      { $group: { _id: '$visitorId' } },
      { $count: 'unique' },
    ]),
    User.aggregate<{ _id: string; value: number }>([
      { $match: { ...nonAdmin, ...inRange } },
      { $group: { _id: dayGroup(), value: { $sum: 1 } } },
    ]),
    Property.aggregate<{ _id: string; value: number }>([
      { $match: inRange },
      { $group: { _id: dayGroup(), value: { $sum: 1 } } },
    ]),
    PropertyEvent.aggregate<{ _id: string; value: number }>([
      { $match: { ...inRange, type: 'view' } },
      { $group: { _id: dayGroup(), value: { $sum: 1 } } },
    ]),
    Payment.aggregate<{ _id: string; value: number }>([
      { $match: { status: 'success', ...inRange } },
      { $group: { _id: dayGroup(), value: { $sum: '$amount' } } },
    ]),
    PropertyEvent.aggregate<{ _id: Types.ObjectId; views: number }>([
      { $match: { ...inRange, type: 'view' } },
      { $group: { _id: '$property', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 5 },
    ]),
    Property.countDocuments({ unavailableReason: 'removed' }),
  ]);

  const toRecord = (rows: { _id: string; count: number }[]) => Object.fromEntries(rows.map((r) => [r._id, r.count]));
  const events = toRecord(eventsByType);
  const topProperties = await Property.find({ _id: { $in: topListingRows.map((r) => r._id) } })
    .select('title location.city status createdBy')
    .populate<{ createdBy: { name: string } | null }>('createdBy', 'name');
  const topById = new Map(topProperties.map((p) => [p._id.toString(), p]));

  const roles = toRecord(usersByRole);
  const paid = toRecord(paidByTier);

  return {
    days,
    users: {
      total: Object.entries(roles).reduce((sum, [role, n]) => (role === 'admin' ? sum : sum + n), 0),
      byRole: roles,
      newInRange: newUsers,
      emailVerified: emailVerifiedCount,
      identityVerified: identityVerifiedCount,
      suspended: suspendedCount,
    },
    subscriptions: {
      activeBasic: paid.basic ?? 0,
      activePremium: paid.premium ?? 0,
    },
    listings: {
      total: listingsByStatus.reduce((sum, r) => sum + r.count, 0),
      byStatus: toRecord(listingsByStatus),
      activeByType: toRecord(activeByType),
      newInRange: newListings,
      removedByAdmin: removedListings,
      topCities: topCities.map((c) => ({ city: c._id, count: c.count })),
    },
    revenue: {
      allTime: revenueAllTime[0]?.total ?? 0,
      allTimePayments: revenueAllTime[0]?.count ?? 0,
      inRange: revenueInRange[0]?.total ?? 0,
      paymentsInRange: revenueInRange[0]?.count ?? 0,
      failedInRange,
      pending: pendingPayments,
    },
    engagement: {
      views: events.view ?? 0,
      uniqueVisitors: uniqueVisitorRows[0]?.unique ?? 0,
      contactClicks: events.contact_click ?? 0,
      contactReveals: events.contact_reveal ?? 0,
    },
    daily: {
      signups: fillDaily(signupsDaily, since, days),
      listings: fillDaily(listingsDaily, since, days),
      views: fillDaily(viewsDaily, since, days),
      revenue: fillDaily(revenueDaily, since, days),
    },
    topListings: topListingRows.map((r) => {
      const p = topById.get(r._id.toString());
      return {
        id: r._id.toString(),
        title: p?.title ?? '(deleted listing)',
        city: p?.location.city,
        agent: p?.createdBy?.name,
        views: r.views,
      };
    }),
  };
}

// ------------------------------------------------------------------- users

export async function listUsers(input: ListUsersInput) {
  const now = new Date();
  const filter: FilterQuery<IUser> = {};

  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ name: pattern }, { email: pattern }, { businessName: pattern }, { phone: pattern }];
  }
  if (input.role) filter.role = input.role;
  if (input.emailVerified !== undefined) filter.emailVerified = input.emailVerified;
  if (input.suspended !== undefined) filter.suspended = input.suspended ? true : { $ne: true };
  if (input.verification) filter.verificationStatus = input.verification;
  if (input.plan === 'free') {
    // Effective free: never paid, or the paid plan has lapsed.
    filter.$and = [
      { $or: [{ planTier: 'free' }, { planExpiresAt: { $exists: false } }, { planExpiresAt: { $lte: now } }] },
    ];
  } else if (input.plan) {
    filter.planTier = input.plan;
    filter.planExpiresAt = { $gt: now };
  }

  const { skip, limit } = paginate(input.page, input.limit);
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);

  const counts = await Property.aggregate<{ _id: Types.ObjectId; total: number; active: number }>([
    { $match: { createdBy: { $in: users.map((u) => u._id) } } },
    {
      $group: {
        _id: '$createdBy',
        total: { $sum: 1 },
        active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
      },
    },
  ]);
  const countsById = new Map(counts.map((c) => [c._id.toString(), c]));

  return {
    users: users.map((u) => ({
      ...toAdminUser(u),
      listingCount: countsById.get(u._id.toString())?.total ?? 0,
      activeListingCount: countsById.get(u._id.toString())?.active ?? 0,
    })),
    ...pageMeta(total, input.page, input.limit),
  };
}

export async function getUserDetail(id: string) {
  requireValidId(id, 'User');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const [listings, payments, eventRows] = await Promise.all([
    Property.find({ createdBy: user._id })
      .sort({ createdAt: -1 })
      .select('title status listingType price location.city unavailableReason createdAt'),
    Payment.find({ user: user._id }).sort({ createdAt: -1 }).limit(20),
    PropertyEvent.aggregate<{ _id: string; count: number }>([
      { $match: { agent: user._id } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]),
  ]);
  const events = Object.fromEntries(eventRows.map((r) => [r._id, r.count]));

  return {
    user: toAdminUser(user),
    listings: listings.map((l) => ({
      id: l._id.toString(),
      title: l.title,
      status: l.status,
      listingType: l.listingType,
      price: l.price,
      city: l.location.city,
      unavailableReason: l.unavailableReason,
      createdAt: l.createdAt,
    })),
    payments: payments.map((p) => ({
      id: p._id.toString(),
      plan: p.plan,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      reference: p.checkoutReference,
      createdAt: p.createdAt,
    })),
    engagement: {
      views: events.view ?? 0,
      contactClicks: events.contact_click ?? 0,
      contactReveals: events.contact_reveal ?? 0,
    },
  };
}

export async function setUserVerification(adminId: string, userId: string, status: IUser['verificationStatus']) {
  requireValidId(userId, 'User');
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin') throw ApiError.badRequest('Admin accounts are not verified this way');

  user.verificationStatus = status;
  await user.save();
  await logAdminAction({
    adminId,
    type: status === 'verified' ? 'user.verify' : 'user.unverify',
    targetType: 'user',
    targetId: user._id,
    targetLabel: user.email,
    note: `Identity status set to ${status}`,
  });
  return toAdminUser(user);
}

export async function setUserSuspension(adminId: string, userId: string, suspended: boolean, reason?: string) {
  requireValidId(userId, 'User');
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  if (user.role === 'admin') throw ApiError.badRequest('Admin accounts cannot be suspended here');
  if (user._id.toString() === adminId) throw ApiError.badRequest('You cannot suspend your own account');

  user.suspended = suspended;
  user.suspendedAt = suspended ? new Date() : undefined;
  user.suspensionReason = suspended ? reason : undefined;
  await user.save();
  await logAdminAction({
    adminId,
    type: suspended ? 'user.suspend' : 'user.unsuspend',
    targetType: 'user',
    targetId: user._id,
    targetLabel: user.email,
    note: reason,
  });
  return toAdminUser(user);
}

// ---------------------------------------------------------------- listings

export async function listListings(input: ListListingsInput) {
  const filter: FilterQuery<IProperty> = {};
  if (input.search) {
    const pattern = new RegExp(escapeRegex(input.search), 'i');
    filter.$or = [{ title: pattern }, { 'location.city': pattern }, { 'location.district': pattern }];
  }
  if (input.status) filter.status = input.status;
  if (input.listingType) filter.listingType = input.listingType;
  if (input.removed === true) filter.unavailableReason = 'removed';
  if (input.removed === false) filter.unavailableReason = { $ne: 'removed' };
  if (input.agentId) filter.createdBy = new Types.ObjectId(input.agentId);

  const { skip, limit } = paginate(input.page, input.limit);
  const [listings, total] = await Promise.all([
    Property.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate<{ createdBy: { _id: Types.ObjectId; name: string; email: string; suspended?: boolean } | null }>(
        'createdBy',
        'name email suspended',
      ),
    Property.countDocuments(filter),
  ]);

  const viewRows = await PropertyEvent.aggregate<{ _id: Types.ObjectId; views: number }>([
    { $match: { property: { $in: listings.map((l) => l._id) }, type: 'view' } },
    { $group: { _id: '$property', views: { $sum: 1 } } },
  ]);
  const viewsById = new Map(viewRows.map((r) => [r._id.toString(), r.views]));

  return {
    listings: listings.map((l) => ({
      id: l._id.toString(),
      title: l.title,
      status: l.status,
      listingType: l.listingType,
      propertyType: l.propertyType,
      price: l.price,
      city: l.location.city,
      state: l.location.state,
      photo: l.media[0],
      unavailableReason: l.unavailableReason,
      views: viewsById.get(l._id.toString()) ?? 0,
      createdAt: l.createdAt,
      agent: l.createdBy
        ? { id: l.createdBy._id.toString(), name: l.createdBy.name, email: l.createdBy.email, suspended: l.createdBy.suspended === true }
        : null,
    })),
    ...pageMeta(total, input.page, input.limit),
  };
}

export async function moderateListing(adminId: string, listingId: string, action: 'remove' | 'restore', note?: string) {
  requireValidId(listingId, 'Listing');
  const listing = await Property.findById(listingId);
  if (!listing) throw ApiError.notFound('Listing not found');

  if (action === 'remove') {
    listing.status = 'inactive';
    listing.unavailableReason = 'removed';
    listing.unavailableAt = new Date();
  } else {
    if (listing.unavailableReason !== 'removed') {
      throw ApiError.badRequest('Only a listing removed by an admin can be restored here');
    }
    listing.status = 'active';
    listing.unavailableReason = undefined;
    listing.unavailableAt = undefined;
  }
  await listing.save();

  await logAdminAction({
    adminId,
    type: action === 'remove' ? 'listing.remove' : 'listing.restore',
    targetType: 'listing',
    targetId: listing._id,
    targetLabel: listing.title,
    note,
  });
  return { id: listing._id.toString(), status: listing.status, unavailableReason: listing.unavailableReason };
}

// --------------------------------------------------------------- payments

export async function listPayments(input: ListPaymentsInput) {
  const filter: FilterQuery<typeof Payment.prototype> = {};
  if (input.status) filter.status = input.status;
  if (input.plan) filter.plan = input.plan;

  const { skip, limit } = paginate(input.page, input.limit);
  const [payments, total, totals] = await Promise.all([
    Payment.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate<{ user: { _id: Types.ObjectId; name: string; email: string } | null }>('user', 'name email'),
    Payment.countDocuments(filter),
    Payment.aggregate<{ _id: string; total: number; count: number }>([
      { $group: { _id: '$status', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),
  ]);

  return {
    payments: payments.map((p) => ({
      id: p._id.toString(),
      plan: p.plan,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      reference: p.checkoutReference,
      createdAt: p.createdAt,
      user: p.user ? { id: p.user._id.toString(), name: p.user.name, email: p.user.email } : null,
    })),
    totalsByStatus: Object.fromEntries(totals.map((t) => [t._id, { amount: t.total, count: t.count }])),
    ...pageMeta(total, input.page, input.limit),
  };
}

// --------------------------------------------------------------- activity

export async function listActivity(input: ListActivityInput) {
  const { skip, limit } = paginate(input.page, input.limit);
  const [actions, total] = await Promise.all([
    AdminAction.find()
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate<{ admin: { name: string; email: string } | null }>('admin', 'name email'),
    AdminAction.countDocuments(),
  ]);

  return {
    actions: actions.map((a) => ({
      id: a._id.toString(),
      type: a.type,
      targetType: a.targetType,
      targetId: a.targetId.toString(),
      targetLabel: a.targetLabel,
      note: a.note,
      createdAt: a.createdAt,
      admin: a.admin ? { name: a.admin.name, email: a.admin.email } : null,
    })),
    ...pageMeta(total, input.page, input.limit),
  };
}

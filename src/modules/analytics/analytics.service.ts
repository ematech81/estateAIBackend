import { Types } from 'mongoose';
import { Property } from '../../models/Property';
import { PropertyEvent, PropertyEventType } from '../../models/PropertyEvent';

// Every number here is derived from documents we really store: Property for
// the listings snapshot, PropertyEvent (one row per tracked visitor action)
// for performance. Nothing is estimated (Section 13.5: never fabricate metrics).
export async function getMyAnalytics(userId: string) {
  const agentId = new Types.ObjectId(userId);

  const [listingsByStatusRows, listingsByMonthRows] = await Promise.all([
    Property.aggregate<{ _id: string; count: number }>([
      { $match: { createdBy: agentId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Property.aggregate<{ _id: string; count: number }>([
      { $match: { createdBy: agentId } },
      { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } }, count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return {
    listingsByStatus: rowsToRecord(listingsByStatusRows),
    listingsByMonth: listingsByMonthRows.map((r) => ({ month: r._id, count: r.count })),
  };
}

function rowsToRecord(rows: { _id: string; count: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

interface ListingStats {
  views: number;
  uniqueVisitors: number;
  contactClicks: number;
  contactReveals: number;
}
const EMPTY_STATS: ListingStats = { views: 0, uniqueVisitors: 0, contactClicks: 0, contactReveals: 0 };

const DAY_MS = 24 * 60 * 60 * 1000;

// How the agent's listings performed over the last `days` days: totals,
// a per-day views series, and a per-listing breakdown.
export async function getMyPerformance(userId: string, days: number) {
  const agentId = new Types.ObjectId(userId);
  // Start of the UTC day `days - 1` days ago, so the series has exactly
  // `days` buckets ending today.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const since = new Date(today.getTime() - (days - 1) * DAY_MS);

  const match = { agent: agentId, createdAt: { $gte: since } };

  const [listings, perListingRows, uniqueVisitorRows, dailyRows] = await Promise.all([
    Property.find({ createdBy: agentId }).select('title status unavailableReason location.city'),
    // Two-stage group so "unique visitors" is a count, not an ever-growing
    // array of ids held in memory.
    PropertyEvent.aggregate<{
      _id: { property: Types.ObjectId; type: PropertyEventType };
      total: number;
      unique: number;
    }>([
      { $match: match },
      { $group: { _id: { property: '$property', type: '$type', visitorId: '$visitorId' }, n: { $sum: 1 } } },
      { $group: { _id: { property: '$_id.property', type: '$_id.type' }, total: { $sum: '$n' }, unique: { $sum: 1 } } },
    ]),
    PropertyEvent.aggregate<{ unique: number }>([
      { $match: { ...match, type: 'view' } },
      { $group: { _id: '$visitorId' } },
      { $count: 'unique' },
    ]),
    PropertyEvent.aggregate<{ _id: string; count: number }>([
      { $match: { ...match, type: 'view' } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
    ]),
  ]);

  const stats = new Map<string, ListingStats>();
  for (const row of perListingRows) {
    const key = row._id.property.toString();
    const s = stats.get(key) ?? { ...EMPTY_STATS };
    if (row._id.type === 'view') {
      s.views = row.total;
      s.uniqueVisitors = row.unique;
    } else if (row._id.type === 'contact_click') {
      s.contactClicks = row.total;
    } else if (row._id.type === 'contact_reveal') {
      s.contactReveals = row.total;
    }
    stats.set(key, s);
  }

  const perListing = listings
    .map((l) => ({
      id: l._id.toString(),
      title: l.title,
      city: l.location.city,
      status: l.status,
      unavailableReason: l.unavailableReason,
      ...(stats.get(l._id.toString()) ?? EMPTY_STATS),
    }))
    .sort((a, b) => b.views - a.views || b.contactReveals - a.contactReveals);

  const totals = perListing.reduce(
    (acc, l) => ({
      views: acc.views + l.views,
      contactClicks: acc.contactClicks + l.contactClicks,
      contactReveals: acc.contactReveals + l.contactReveals,
    }),
    { views: 0, contactClicks: 0, contactReveals: 0 },
  );

  const viewsByDay = new Map(dailyRows.map((r) => [r._id, r.count]));
  const daily = Array.from({ length: days }, (_, i) => {
    const date = new Date(since.getTime() + i * DAY_MS).toISOString().slice(0, 10);
    return { date, views: viewsByDay.get(date) ?? 0 };
  });

  return {
    days,
    totals: { ...totals, uniqueVisitors: uniqueVisitorRows[0]?.unique ?? 0 },
    daily,
    listings: perListing,
  };
}

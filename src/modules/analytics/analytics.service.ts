import { Types } from 'mongoose';
import { Property } from '../../models/Property';
import { Lead } from '../../models/Lead';

// No new tracking infrastructure — every number here is derived from
// Property/Lead documents the agent already owns. No view/click counts
// exist anywhere in the app, so none are reported (Section 13.5: never
// fabricate metrics).
export async function getMyAnalytics(userId: string) {
  const agentId = new Types.ObjectId(userId);

  const [listingsByStatusRows, leadsByStatusRows, listingsByMonthRows] = await Promise.all([
    Property.aggregate<{ _id: string; count: number }>([
      { $match: { createdBy: agentId } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    Lead.aggregate<{ _id: string; count: number }>([
      { $match: { agent: agentId } },
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
    leadsByStatus: rowsToRecord(leadsByStatusRows),
    listingsByMonth: listingsByMonthRows.map((r) => ({ month: r._id, count: r.count })),
  };
}

function rowsToRecord(rows: { _id: string; count: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
}

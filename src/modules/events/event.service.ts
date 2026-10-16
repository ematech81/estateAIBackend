import { isValidObjectId } from 'mongoose';
import { Property } from '../../models/Property';
import { PropertyEvent, PropertyEventType } from '../../models/PropertyEvent';
import { ApiError } from '../../utils/ApiError';

// The same visitor repeating the same action on the same listing inside this
// window counts once — a page refresh or a double click shouldn't inflate an
// agent's numbers.
const DEDUPE_WINDOW_MS = 30 * 60 * 1000;

interface RecordEventInput {
  propertyId: string;
  type: PropertyEventType;
  visitorId: string;
  // Set when the request carried a valid agent token — an agent previewing
  // their own listing must not count as a visitor.
  viewerId?: string;
}

export async function recordEvent({ propertyId, type, visitorId, viewerId }: RecordEventInput) {
  if (!isValidObjectId(propertyId)) {
    throw ApiError.notFound('Listing not found');
  }

  // Same visibility rule as the public listing endpoints.
  const property = await Property.findOne({ _id: propertyId, status: { $in: ['pending_review', 'active'] } }).select(
    'createdBy',
  );
  if (!property) {
    throw ApiError.notFound('Listing not found');
  }

  if (viewerId && property.createdBy.toString() === viewerId) {
    return { recorded: false };
  }

  const duplicate = await PropertyEvent.exists({
    property: property._id,
    type,
    visitorId,
    createdAt: { $gte: new Date(Date.now() - DEDUPE_WINDOW_MS) },
  });
  if (duplicate) {
    return { recorded: false };
  }

  await PropertyEvent.create({ property: property._id, agent: property.createdBy, type, visitorId });
  return { recorded: true };
}

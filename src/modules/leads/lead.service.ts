import { isValidObjectId } from 'mongoose';
import { Lead } from '../../models/Lead';
import { Property } from '../../models/Property';
import { ApiError } from '../../utils/ApiError';
import { CreateLeadInput } from './lead.validation';

export async function createLead(input: CreateLeadInput) {
  if (!isValidObjectId(input.propertyId)) {
    throw ApiError.notFound('Listing not found');
  }

  // Same visibility rule as the public listing endpoints — a lead can only
  // be submitted against a listing a seeker could actually have seen, and
  // this doubles as not leaking a draft listing's existence via this route.
  const property = await Property.findOne({
    _id: input.propertyId,
    status: { $in: ['pending_review', 'active'] },
  });
  if (!property) {
    throw ApiError.notFound('Listing not found');
  }

  return Lead.create({
    property: property._id,
    agent: property.createdBy,
    name: input.name,
    email: input.email,
    phone: input.phone,
    message: input.message,
  });
}

export async function getMyLeads(agentId: string) {
  return Lead.find({ agent: agentId })
    .sort({ createdAt: -1 })
    .populate<{ property: { title: string; location: { city: string } } }>(
      'property',
      'title location.city',
    );
}

export async function updateLeadStatus(agentId: string, leadId: string, status: string) {
  const lead = await Lead.findById(leadId);
  if (!lead) {
    throw ApiError.notFound('Lead not found');
  }
  if (lead.agent.toString() !== agentId) {
    throw ApiError.forbidden('You do not have access to this lead');
  }

  lead.status = status as typeof lead.status;
  await lead.save();
  return lead;
}

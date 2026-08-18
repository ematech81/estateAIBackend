import bcrypt from 'bcryptjs';
import { Types, isValidObjectId } from 'mongoose';
import { User, toPublicAgent } from '../../models/User';
import { Property } from '../../models/Property';
import { ApiError } from '../../utils/ApiError';
import { ChangePasswordInput, ListAgentsInput, UpdateProfileInput } from './user.validation';

const SALT_ROUNDS = 10;

export async function getUserById(id: string) {
  const user = await User.findById(id);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  return user;
}

export async function updateUser(id: string, input: UpdateProfileInput) {
  const user = await getUserById(id);
  Object.assign(user, input);
  await user.save();
  return user;
}

export async function changePassword(id: string, input: ChangePasswordInput) {
  const user = await getUserById(id);
  const matches = await bcrypt.compare(input.currentPassword, user.hashedPassword);
  if (!matches) {
    throw ApiError.unauthorized('Current password is incorrect');
  }
  user.hashedPassword = await bcrypt.hash(input.newPassword, SALT_ROUNDS);
  await user.save();
}

// findOneAndDelete (not findByIdAndDelete's underlying deleteOne-by-filter
// variant) is deliberate — it's the one User.ts's cascade pre-hook actually
// listens on, so the agent's own listings + leads get removed too.
export async function deleteAccount(id: string) {
  await User.findOneAndDelete({ _id: id });
}

// Excludes admin (not a public role).
const PUBLIC_AGENT_FILTER = {
  role: { $in: ['agent', 'agency', 'owner'] },
};

export async function listPublicAgents({ page, limit }: ListAgentsInput) {
  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(PUBLIC_AGENT_FILTER).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(PUBLIC_AGENT_FILTER),
  ]);

  const counts = await getActiveListingCounts(users.map((u) => u._id));

  return {
    agents: users.map((u) => ({ ...toPublicAgent(u), activeListingCount: counts.get(u._id.toString()) ?? 0 })),
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getPublicAgentById(id: string) {
  // Same reasoning as listing.service.ts's getListingById — a public route
  // gets hit with garbage IDs; that should 404, not 500 on a CastError.
  if (!isValidObjectId(id)) {
    throw ApiError.notFound('Agent not found');
  }

  const user = await User.findOne({ _id: id, ...PUBLIC_AGENT_FILTER });
  if (!user) {
    throw ApiError.notFound('Agent not found');
  }
  const counts = await getActiveListingCounts([user._id]);
  return { ...toPublicAgent(user), activeListingCount: counts.get(user._id.toString()) ?? 0 };
}

async function getActiveListingCounts(userIds: Types.ObjectId[]) {
  if (userIds.length === 0) return new Map<string, number>();
  const rows = await Property.aggregate<{ _id: unknown; count: number }>([
    { $match: { createdBy: { $in: userIds }, status: 'active' } },
    { $group: { _id: '$createdBy', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

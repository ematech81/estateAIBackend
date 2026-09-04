import { PlanTier } from '../../config/plans';

// A user's stored planTier is just "what they most recently purchased" —
// it's never proactively reverted to 'free' by a cron job when a pass
// expires. Instead, every place that cares about the *current* plan calls
// this, which lazily treats an expired paid plan as free. Simpler and just
// as correct as a scheduled sweep, with no scheduler to run or fail.
export function getEffectivePlanTier(user: { planTier: PlanTier; planExpiresAt?: Date | null }): PlanTier {
  if (user.planTier === 'free') return 'free';
  if (!user.planExpiresAt || user.planExpiresAt.getTime() < Date.now()) return 'free';
  return user.planTier;
}

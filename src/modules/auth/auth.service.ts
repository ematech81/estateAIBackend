import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { User } from '../../models/User';
import { PasswordResetToken } from '../../models/PasswordResetToken';
import { sendPasswordResetEmail } from '../../services/email/email.service';
import { LoginInput, RegisterInput } from './auth.validation';

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function issueToken(userId: string, role: string): string {
  // @types/jsonwebtoken narrows `expiresIn` to a template-literal union
  // (e.g. "7d") rather than plain `string`; env vars are always strings, so
  // the cast is safe here and keeps the env schema simple.
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, options);
}

export async function registerUser(input: RegisterInput) {
  const existing = await User.findOne({ email: input.email });
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  const hashedPassword = await bcrypt.hash(input.password, SALT_ROUNDS);
  const user = await User.create({
    email: input.email,
    hashedPassword,
    name: input.name,
    role: input.role,
    phone: input.phone,
    businessName: input.businessName,
    primaryLocation: input.primaryLocation,
  });

  const token = issueToken(user._id.toString(), user.role);
  return { token, user };
}

// Deliberately silent (no throw, no "account not found") when the email
// isn't registered — the controller sends the exact same generic response
// either way, so this can't be used to enumerate which emails have
// accounts. A caught email-send failure is the controller's job to log
// without leaking to the client, not this function's.
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user) return;

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashResetToken(rawToken);

  // Only one live reset link per account — starting a new request
  // invalidates any earlier unused one rather than leaving both valid.
  await PasswordResetToken.deleteMany({ user: user._id });
  await PasswordResetToken.create({
    user: user._id,
    tokenHash,
    expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
  });

  const resetUrl = `${env.WEB_ORIGIN}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(user.email, user.name, resetUrl);
}

export async function resetPassword(rawToken: string, newPassword: string): Promise<void> {
  const tokenHash = hashResetToken(rawToken);
  const record = await PasswordResetToken.findOne({ tokenHash });
  if (!record || record.expiresAt < new Date()) {
    throw ApiError.badRequest('This reset link is invalid or has expired.');
  }

  const user = await User.findById(record.user);
  if (!user) {
    throw ApiError.badRequest('This reset link is invalid or has expired.');
  }

  user.hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await user.save();
  // One-time use — burn the token the moment it's redeemed, successfully
  // or not (a raw token that briefly failed for an unrelated reason
  // shouldn't stay valid for reuse).
  await PasswordResetToken.deleteOne({ _id: record._id });
}

export async function loginUser(input: LoginInput) {
  const user = await User.findOne({ email: input.email });
  if (!user) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const passwordMatches = await bcrypt.compare(input.password, user.hashedPassword);
  if (!passwordMatches) {
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = issueToken(user._id.toString(), user.role);
  return { token, user };
}

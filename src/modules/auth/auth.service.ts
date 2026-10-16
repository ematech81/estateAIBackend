import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { IUser, User } from '../../models/User';
import { PasswordResetToken } from '../../models/PasswordResetToken';
import { EmailVerificationOtp } from '../../models/EmailVerificationOtp';
import { sendEmailVerificationEmail, sendPasswordResetEmail } from '../../services/email/email.service';
import { LoginInput, RegisterInput } from './auth.validation';

const SALT_ROUNDS = 10;
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_LENGTH = 6;
// Alphanumeric, minus the look-alikes (0/O, 1/I/L) people misread when
// typing a code from an email.
const OTP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function hashToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function issueToken(userId: string, role: string): string {
  // @types/jsonwebtoken narrows `expiresIn` to a template-literal union
  // (e.g. "7d") rather than plain `string`; env vars are always strings, so
  // the cast is safe here and keeps the env schema simple.
  const options: jwt.SignOptions = { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'] };
  return jwt.sign({ sub: userId, role }, env.JWT_SECRET, options);
}

// Random code that always mixes letters and digits (e.g. "K7M2QX") — a
// uniformly random pick from the alphabet, re-rolled until it has both.
function generateOtp(): string {
  for (;;) {
    const code = Array.from({ length: OTP_LENGTH }, () => OTP_ALPHABET[crypto.randomInt(OTP_ALPHABET.length)]).join('');
    if (/[A-Z]/.test(code) && /[0-9]/.test(code)) return code;
  }
}

// Keyed with the server secret so a leaked database can't be brute-forced
// offline (a 6-character code alone would fall in seconds to a plain hash).
function hashOtp(userId: string, code: string): string {
  return crypto.createHmac('sha256', env.JWT_SECRET).update(`${userId}:${code}`).digest('hex');
}

// Users type the code by hand — be forgiving about case and stray spaces or dashes.
function normalizeOtp(input: string): string {
  return input.replace(/[\s-]/g, '').toUpperCase();
}

// Shared by registration and the resend endpoint. Swallows its own
// email-send failure — a Brevo hiccup should never break registration
// itself; the agent can just request another code.
async function issueAndSendVerificationOtp(user: IUser, { enforceCooldown }: { enforceCooldown: boolean }): Promise<void> {
  const now = Date.now();
  if (enforceCooldown) {
    const existing = await EmailVerificationOtp.findOne({ user: user._id });
    if (existing) {
      const waitMs = existing.lastSentAt.getTime() + OTP_RESEND_COOLDOWN_MS - now;
      if (waitMs > 0) {
        throw ApiError.tooManyRequests(`Please wait ${Math.ceil(waitMs / 1000)} seconds before requesting another code.`);
      }
    }
  }

  const code = generateOtp();
  // One live code per account — a new one replaces (and so invalidates) the
  // previous, and resets the attempt counter.
  await EmailVerificationOtp.findOneAndUpdate(
    { user: user._id },
    {
      user: user._id,
      codeHash: hashOtp(user._id.toString(), code),
      attempts: 0,
      expiresAt: new Date(now + OTP_TTL_MS),
      lastSentAt: new Date(now),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  try {
    await sendEmailVerificationEmail(user.email, user.name, code);
  } catch (err) {
    console.error('Verification email failed to send:', err);
  }
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

  // Registration succeeds regardless of whether this email actually sends
  // — an agent shouldn't be locked out of an account they just paid
  // nothing to create because of a transient email-provider issue.
  await issueAndSendVerificationOtp(user, { enforceCooldown: false });

  const token = issueToken(user._id.toString(), user.role);
  return { token, user };
}

export async function verifyEmail(userId: string, rawCode: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  if (user.emailVerified) {
    return;
  }

  const record = await EmailVerificationOtp.findOne({ user: user._id });
  if (!record || record.expiresAt < new Date()) {
    throw ApiError.badRequest('This code has expired. Request a new one.');
  }
  if (record.attempts >= OTP_MAX_ATTEMPTS) {
    await EmailVerificationOtp.deleteOne({ _id: record._id });
    throw ApiError.tooManyRequests('Too many incorrect attempts. Request a new code.');
  }

  const expected = Buffer.from(record.codeHash, 'hex');
  const actual = Buffer.from(hashOtp(userId, normalizeOtp(rawCode)), 'hex');
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) {
    record.attempts += 1;
    if (record.attempts >= OTP_MAX_ATTEMPTS) {
      await EmailVerificationOtp.deleteOne({ _id: record._id });
      throw ApiError.tooManyRequests('Too many incorrect attempts. Request a new code.');
    }
    await record.save();
    const left = OTP_MAX_ATTEMPTS - record.attempts;
    throw ApiError.badRequest(`That code isn't right. ${left} attempt${left === 1 ? '' : 's'} left.`);
  }

  user.emailVerified = true;
  await user.save();
  await EmailVerificationOtp.deleteOne({ _id: record._id });
}

export async function resendVerificationEmail(userId: string): Promise<{ alreadyVerified: boolean }> {
  const user = await User.findById(userId);
  if (!user) {
    throw ApiError.notFound('User not found');
  }
  if (user.emailVerified) {
    return { alreadyVerified: true };
  }

  await issueAndSendVerificationOtp(user, { enforceCooldown: true });
  return { alreadyVerified: false };
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
  const tokenHash = hashToken(rawToken);

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
  const tokenHash = hashToken(rawToken);
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

  if (user.suspended) {
    throw ApiError.forbidden('Your account has been suspended. Contact EstateAI support.');
  }

  const token = issueToken(user._id.toString(), user.role);
  return { token, user };
}

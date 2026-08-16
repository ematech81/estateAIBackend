import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { ApiError } from '../../utils/ApiError';
import { User } from '../../models/User';
import { LoginInput, RegisterInput } from './auth.validation';

const SALT_ROUNDS = 10;

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

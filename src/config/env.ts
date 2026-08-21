import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().default('claude-sonnet-5'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  // Optional, same lazy-fail convention as ANTHROPIC_API_KEY — app still
  // boots without these; the upload service throws a clear error only if
  // actually invoked unconfigured.
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  // Brevo — transactional email (password reset). Same lazy-fail
  // convention: the app boots without these, but requesting a password
  // reset while unconfigured fails loudly server-side rather than silently
  // pretending to have sent an email.
  BREVO_API_KEY: z.string().optional(),
  // Plain z.string() (not .email()) to match every other optional secret's
  // convention — tests/setup.ts blanks this to '' so tests never touch a
  // developer's real Brevo account, and an .email() refinement would
  // reject that empty string instead of treating it as "unconfigured".
  BREVO_SENDER_EMAIL: z.string().optional(),
});

/**
 * Fails fast on boot if required env vars are missing/invalid, rather than
 * surfacing confusing errors deep inside a request handler later.
 */
function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;

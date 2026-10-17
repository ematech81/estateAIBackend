import { z } from 'zod';
import dotenv from 'dotenv';
import { parseOrigins } from './origins';

dotenv.config();

const envSchema = z.object({
  PORT: z.coerce.number().default(4000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  // OpenAI — AI-assisted listing extraction. Optional (lazy-fail, like the
  // other third-party keys): the app boots without it and the draft
  // endpoint returns a clear "not configured" error until it's set.
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o-mini'),
  // The public site's address. May be a comma-separated list; the FIRST is
  // the main site (used in generated links), the rest are also allowed by CORS.
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  // The admin dashboard's origin (separate app). Optional — only needed in
  // production, where CORS is locked to the listed origins.
  ADMIN_ORIGIN: z.string().optional(),
  // Optional, same lazy-fail convention as OPENAI_API_KEY — app still
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
  // KoraPay — subscriptions, routed through a shared webhook router used
  // across multiple apps (see modules/payments/). Same lazy-fail
  // convention as the others above.
  KORAPAY_SECRET_KEY: z.string().optional(),
  // Shared secret the router attaches to every forwarded webhook
  // (x-router-secret header) — optional here on purpose: the signature
  // check below is the real proof of origin, this is just a second layer
  // when set, and skipped when not.
  ROUTER_FORWARD_SECRET: z.string().optional(),
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
  return {
    ...parsed.data,
    // WEB_ORIGIN may list several addresses (CORS allows all of them), but
    // links we generate — password-reset emails, the payment return page,
    // listing URLs — must use ONE: the first entry is the main site.
    WEB_URL: parseOrigins(parsed.data.WEB_ORIGIN)[0] ?? 'http://localhost:3000',
  };
}

export const env = loadEnv();
export type Env = typeof env;

// Runs before each test file's own imports (Jest setupFilesAfterEnv), so
// config/env.ts sees valid values the moment anything imports it.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/estateai-test-placeholder';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.AI_MODEL = 'claude-sonnet-5';
// Forced to '' rather than deleted — dotenv.config() in config/env.ts only
// fills in a var if it's NOT already present in process.env, so an absent
// key is exactly what lets it leak in from a developer's real local .env
// (real Cloudinary/Anthropic credentials). An empty string counts as
// "already present" to dotenv, so it's left alone, and env.ts's own
// .optional() parsing treats it the same as unconfigured. Tests must never
// depend on what happens to be in a developer's .env — mock providers
// (setAIProvider) and explicit "not configured" assertions are what's
// actually under test.
process.env.ANTHROPIC_API_KEY = '';
process.env.CLOUDINARY_CLOUD_NAME = '';
process.env.CLOUDINARY_API_KEY = '';
process.env.CLOUDINARY_API_SECRET = '';
// Same reasoning — without this, the password-reset tests would try to
// send real email through a developer's real Brevo account.
process.env.BREVO_API_KEY = '';
process.env.BREVO_SENDER_EMAIL = '';
// Same reasoning — tests must never depend on, or accidentally hit, a
// developer's real KoraPay account.
process.env.KORAPAY_SECRET_KEY = '';
process.env.ROUTER_FORWARD_SECRET = '';

// Global mock, not per-file: registerUser() now sends a verification email
// on every registration, and registerAndLogin() helpers are used across
// nearly every test file — without this, every single one of those calls
// would hit the real (blanked-out, so throwing) email service and spam a
// caught-but-logged "not configured" error on every test run. Auto-mocked
// exports resolve to undefined and never throw, which is exactly the
// "email sent successfully" shape most tests should see by default.
// auth.test.ts's own `jest.mock` + typed casts still work on top of this —
// it just needs specific per-test return values (mockResolvedValueOnce,
// mockRejectedValueOnce, etc.), not a different mock altogether.
jest.mock('../src/services/email/email.service');

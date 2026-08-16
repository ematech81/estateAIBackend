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

// Runs before each test file's own imports (Jest setupFilesAfterEnv), so
// config/env.ts sees valid values the moment anything imports it.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.JWT_EXPIRES_IN = '1h';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/estateai-test-placeholder';
process.env.WEB_ORIGIN = 'http://localhost:3000';
process.env.AI_MODEL = 'claude-sonnet-5';
// Deliberately no ANTHROPIC_API_KEY — tests must never call a real AI provider.

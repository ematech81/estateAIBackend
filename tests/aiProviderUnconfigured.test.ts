import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';

// Deliberately its own file, and deliberately never calls setAIProvider()
// (unlike listing.test.ts) — extraction.service.ts's provider is
// module-level state that, once set, stays set for the rest of that
// module's lifetime. Jest gives each test file its own fresh module
// registry, so this is the one place the real (unconfigured, per
// tests/setup.ts blanking ANTHROPIC_API_KEY) AnthropicProvider
// construction path actually gets exercised.
const app = createApp();

beforeAll(async () => {
  await startTestDB();
});

afterAll(async () => {
  await stopTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

async function registerAndLogin(email = 'agent@example.com') {
  const res = await request(app).post('/api/auth/register').send({
    email,
    password: 'supersecret123',
    name: 'Chinedu Okafor',
    role: 'agent',
  });
  return res.body.token as string;
}

describe('POST /api/listings/draft with no AI provider configured', () => {
  it('returns a clear, safe 500 instead of a generic or leaked internal error', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/listings/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year...' });

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/not configured/i);
  });
});

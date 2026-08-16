import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';

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

describe('POST /api/uploads/signature', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/uploads/signature');
    expect(res.status).toBe(401);
  });

  it('returns a clear 500 when Cloudinary is not configured (the test-env default)', async () => {
    const token = await registerAndLogin();
    const res = await request(app).post('/api/uploads/signature').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.message).toMatch(/not configured/i);
  });
});

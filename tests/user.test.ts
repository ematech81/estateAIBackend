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

describe('GET /api/users/me', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('returns the authenticated user without the password hash', async () => {
    const token = await registerAndLogin();
    const res = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('agent@example.com');
    expect(res.body.user).not.toHaveProperty('hashedPassword');
  });
});

describe('PATCH /api/users/me', () => {
  it('updates allowed profile fields', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Updated Name', primaryLocation: 'Ikoyi, Lagos' });

    expect(res.status).toBe(200);
    expect(res.body.user.name).toBe('Updated Name');
    expect(res.body.user.primaryLocation).toBe('Ikoyi, Lagos');
  });

  it('ignores an attempt to change email through this endpoint', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'hijacked@example.com' });

    // Zod strips unknown keys by default (no .strict()), so this succeeds
    // but the email is simply not among the fields actually applied.
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('agent@example.com');
  });
});

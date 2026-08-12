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

const validAgent = {
  email: 'agent@example.com',
  password: 'supersecret123',
  name: 'Chinedu Okafor',
  role: 'agent' as const,
  phone: '+2348012345678',
};

describe('POST /api/auth/register', () => {
  it('registers a new agent and returns a token + public user (no password hash)', async () => {
    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(validAgent.email);
    expect(res.body.user.role).toBe('agent');
    expect(res.body.user).not.toHaveProperty('hashedPassword');
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(409);
  });

  it('rejects an invalid role (admin is not self-registrable)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validAgent, role: 'admin' });

    expect(res.status).toBe(400);
  });

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validAgent, password: '123' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await request(app).post('/api/auth/register').send(validAgent);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validAgent.email, password: validAgent.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    await request(app).post('/api/auth/register').send(validAgent);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validAgent.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    expect(res.status).toBe(401);
  });
});

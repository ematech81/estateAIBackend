import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';
import { User } from '../src/models/User';
import { Property } from '../src/models/Property';
import { Lead } from '../src/models/Lead';

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

describe('PATCH /api/users/me/password', () => {
  it('requires auth', async () => {
    const res = await request(app)
      .patch('/api/users/me/password')
      .send({ currentPassword: 'supersecret123', newPassword: 'newpassword456' });
    expect(res.status).toBe(401);
  });

  it('rejects the wrong current password', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong-password', newPassword: 'newpassword456' });

    expect(res.status).toBe(401);
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'supersecret123', newPassword: 'short' });

    expect(res.status).toBe(400);
  });

  it('updates the password and lets the user log in with the new one', async () => {
    const email = 'password-change@example.com';
    const token = await registerAndLogin(email);
    const changeRes = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'supersecret123', newPassword: 'newpassword456' });

    expect(changeRes.status).toBe(200);

    const oldLogin = await request(app).post('/api/auth/login').send({ email, password: 'supersecret123' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app).post('/api/auth/login').send({ email, password: 'newpassword456' });
    expect(newLogin.status).toBe(200);
  });
});

describe('DELETE /api/users/me', () => {
  it('requires auth', async () => {
    const res = await request(app).delete('/api/users/me');
    expect(res.status).toBe(401);
  });

  it('deletes the account and cascades its listings and leads', async () => {
    const validListingPayload = {
      title: 'Newly built 3 bedroom duplex, Lekki Phase 1',
      description: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year with BQ and pool.',
      listingType: 'rent',
      propertyType: 'duplex',
      price: { amount: 8_000_000, currency: 'NGN', period: 'yearly' },
      location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1' },
      specifications: { bedrooms: 3, bathrooms: 4, amenities: ['BQ', 'swimming pool'] },
    };
    const token = await registerAndLogin();
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    const userId = me.body.user.id;

    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);
    await request(app)
      .post('/api/leads')
      .send({ propertyId: listingRes.body.listing._id, name: 'Seeker', email: 'seeker@example.com' });

    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(await User.findById(userId)).toBeNull();
    expect(await Property.countDocuments({ createdBy: userId })).toBe(0);
    expect(await Lead.countDocuments({ agent: userId })).toBe(0);
  });
});

// Belt-and-suspenders: exercises the Mongoose-level cascade middleware
// directly (models/User.ts) regardless of which code path triggers a
// delete — the DELETE /api/users/me tests above cover the HTTP path.
describe('User deletion cascade (models/User.ts middleware)', () => {
  const validListingPayload = {
    title: 'Newly built 3 bedroom duplex, Lekki Phase 1',
    description: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year with BQ and pool.',
    listingType: 'rent',
    propertyType: 'duplex',
    price: { amount: 8_000_000, currency: 'NGN', period: 'yearly' },
    location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1' },
    specifications: { bedrooms: 3, bathrooms: 4, amenities: ['BQ', 'swimming pool'] },
  };

  it('findByIdAndDelete removes the user’s listings and leads too', async () => {
    const token = await registerAndLogin();
    const meRes = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);
    const userId = meRes.body.user.id;

    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);
    const listingId = listingRes.body.listing._id;

    await request(app)
      .post('/api/leads')
      .send({ propertyId: listingId, name: 'Seeker', email: 'seeker@example.com' });

    expect(await Property.countDocuments({ createdBy: userId })).toBe(1);
    expect(await Lead.countDocuments({ agent: userId })).toBe(1);

    await User.findByIdAndDelete(userId);

    expect(await User.findById(userId)).toBeNull();
    expect(await Property.countDocuments({ createdBy: userId })).toBe(0);
    expect(await Lead.countDocuments({ agent: userId })).toBe(0);
  });

  it('does not touch another user’s listings', async () => {
    const tokenA = await registerAndLogin('agent-a@example.com');
    const tokenB = await registerAndLogin('agent-b@example.com');
    const meB = await request(app).get('/api/users/me').set('Authorization', `Bearer ${tokenB}`);
    const userBId = meB.body.user.id;

    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenA}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenB}`).send(validListingPayload);

    await User.findByIdAndDelete(userBId);

    expect(await Property.countDocuments({})).toBe(1);
  });
});

const validListingPayload = {
  title: 'Newly built 3 bedroom duplex, Lekki Phase 1',
  description: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year with BQ and pool.',
  listingType: 'rent',
  propertyType: 'duplex',
  price: { amount: 8_000_000, currency: 'NGN', period: 'yearly' },
  location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1' },
  specifications: { bedrooms: 3, bathrooms: 4, amenities: ['BQ', 'swimming pool'] },
};

describe('GET /api/users/agents', () => {
  it('is public and lists registered agents without email/phone', async () => {
    const token = await registerAndLogin();
    const res = await request(app).get('/api/users/agents');

    expect(res.status).toBe(200);
    expect(res.body.agents).toHaveLength(1);
    expect(res.body.agents[0]).not.toHaveProperty('email');
    expect(res.body.agents[0]).not.toHaveProperty('phone');
    expect(res.body.agents[0].name).toBe('Chinedu Okafor');
    void token;
  });

  it('excludes admin accounts', async () => {
    await registerAndLogin('real-agent@example.com');
    await User.create({
      email: 'admin@example.com',
      hashedPassword: 'irrelevant',
      name: 'Admin',
      role: 'admin',
    });

    const res = await request(app).get('/api/users/agents');

    expect(res.body.total).toBe(1);
    expect(res.body.agents.some((a: { name: string }) => a.name === 'Admin')).toBe(false);
  });

  it('reports an agent’s active listing count', async () => {
    const token = await registerAndLogin();
    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);

    const res = await request(app).get('/api/users/agents');

    expect(res.body.agents[0].activeListingCount).toBe(1);
  });
});

describe('GET /api/users/agents/:id', () => {
  it('returns a single public agent profile', async () => {
    const token = await registerAndLogin();
    const me = await request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    const res = await request(app).get(`/api/users/agents/${me.body.user.id}`);

    expect(res.status).toBe(200);
    expect(res.body.agent.name).toBe('Chinedu Okafor');
    expect(res.body.agent).not.toHaveProperty('email');
  });

  it('404s for a malformed id instead of 500ing', async () => {
    const res = await request(app).get('/api/users/agents/not-a-valid-id');
    expect(res.status).toBe(404);
  });

  it('404s for an admin account (not a public agent)', async () => {
    const admin = await User.create({
      email: 'admin2@example.com',
      hashedPassword: 'irrelevant',
      name: 'Admin',
      role: 'admin',
    });

    const res = await request(app).get(`/api/users/agents/${admin._id}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/listings?agentId=', () => {
  it('filters to only that agent’s listings', async () => {
    const tokenA = await registerAndLogin('agent-a@example.com');
    const tokenB = await registerAndLogin('agent-b@example.com');
    const meA = await request(app).get('/api/users/me').set('Authorization', `Bearer ${tokenA}`);

    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenA}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenB}`).send(validListingPayload);

    const res = await request(app).get(`/api/listings?agentId=${meA.body.user.id}`);

    expect(res.body.total).toBe(1);
  });
});

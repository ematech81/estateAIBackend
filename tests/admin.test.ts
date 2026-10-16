import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';
import { User } from '../src/models/User';
import { Payment } from '../src/models/Payment';

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

const PASSWORD = 'supersecret123';

async function register(email: string, name = 'Some Agent', role: 'agent' | 'owner' = 'agent') {
  const res = await request(app).post('/api/auth/register').send({ email, password: PASSWORD, name, role });
  return { token: res.body.token as string, id: res.body.user.id as string };
}

// There is deliberately no self-serve way to become an admin — promote
// directly in the database, then log in again so the JWT carries the role.
async function registerAdmin(email = 'admin@example.com') {
  const { id } = await register(email, 'Admin Person');
  await User.updateOne({ _id: id }, { role: 'admin' });
  const login = await request(app).post('/api/auth/login').send({ email, password: PASSWORD });
  return { token: login.body.token as string, id };
}

const listingPayload = (overrides: object = {}) => ({
  title: 'Newly built 3 bedroom duplex, Lekki Phase 1',
  description: 'Newly built 3 bedroom duplex at Lekki Phase 1 with BQ and parking.',
  listingType: 'sale',
  propertyType: 'duplex',
  price: { amount: 80_000_000, currency: 'NGN', period: 'one_time' },
  location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1' },
  specifications: { bedrooms: 3, amenities: [] },
  ...overrides,
});

async function createListing(token: string, overrides: object = {}) {
  const res = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(listingPayload(overrides));
  return res.body.listing._id as string;
}

const get = (path: string, token: string) => request(app).get(`/api/admin${path}`).set('Authorization', `Bearer ${token}`);
const patch = (path: string, token: string, body: object) =>
  request(app).patch(`/api/admin${path}`).set('Authorization', `Bearer ${token}`).send(body);

describe('admin access control', () => {
  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/api/admin/overview')).status).toBe(401);
  });

  it('rejects non-admin users on every admin route', async () => {
    const { token } = await register('agent@example.com');
    for (const path of ['/overview', '/users', '/listings', '/payments', '/activity']) {
      expect((await get(path, token)).status).toBe(403);
    }
    expect((await patch('/users/64b64b64b64b64b64b64b64b/suspension', token, { suspended: true })).status).toBe(403);
  });
});

describe('GET /api/admin/overview', () => {
  it('reports users, listings, subscriptions, revenue and engagement', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com', 'Agent A');
    await register('b@example.com', 'Agent B', 'owner');
    const id = await createListing(a.token);

    await request(app).post('/api/events').send({ propertyId: id, type: 'view', visitorId: 'visitor-aaaa-1' });
    await request(app).post('/api/events').send({ propertyId: id, type: 'contact_click', visitorId: 'visitor-aaaa-1' });
    await request(app).post(`/api/listings/${id}/contact`).send({ visitorId: 'visitor-aaaa-1' });

    await User.updateOne({ _id: a.id }, { planTier: 'premium', planExpiresAt: new Date(Date.now() + 86_400_000) });
    await Payment.create({ user: a.id, plan: 'premium', amount: 15000, currency: 'NGN', checkoutReference: 'EST-1', status: 'success' });
    await Payment.create({ user: a.id, plan: 'basic', amount: 5000, currency: 'NGN', checkoutReference: 'EST-2', status: 'failed' });

    const res = await get('/overview', admin.token);
    expect(res.status).toBe(200);
    // The admin account itself is not counted as a user.
    expect(res.body.users.total).toBe(2);
    expect(res.body.users.byRole).toMatchObject({ agent: 1, owner: 1, admin: 1 });
    expect(res.body.listings.total).toBe(1);
    expect(res.body.listings.byStatus.active).toBe(1);
    expect(res.body.listings.activeByType.sale).toBe(1);
    expect(res.body.listings.topCities[0]).toEqual({ city: 'Lagos', count: 1 });
    expect(res.body.subscriptions).toEqual({ activeBasic: 0, activePremium: 1 });
    expect(res.body.revenue.allTime).toBe(15000);
    expect(res.body.revenue.failedInRange).toBe(1);
    expect(res.body.engagement).toEqual({ views: 1, uniqueVisitors: 1, contactClicks: 1, contactReveals: 1 });
    expect(res.body.daily.views).toHaveLength(30);
    expect(res.body.daily.views[29].value).toBe(1);
    expect(res.body.daily.revenue[29].value).toBe(15000);
    expect(res.body.topListings[0]).toMatchObject({ id, views: 1, agent: 'Agent A' });
  });

  it('only accepts 7, 30 or 90 days', async () => {
    const admin = await registerAdmin();
    expect((await get('/overview?days=5', admin.token)).status).toBe(400);
    expect((await get('/overview?days=7', admin.token)).body.daily.signups).toHaveLength(7);
  });

  it('returns zeros, not errors, on an empty platform', async () => {
    const admin = await registerAdmin();
    const res = await get('/overview', admin.token);
    expect(res.status).toBe(200);
    expect(res.body.revenue.allTime).toBe(0);
    expect(res.body.topListings).toEqual([]);
  });
});

describe('admin users', () => {
  it('lists, searches and filters users with listing counts', async () => {
    const admin = await registerAdmin();
    const a = await register('alice@example.com', 'Alice Okafor');
    await register('bob@example.com', 'Bob Smith', 'owner');
    await createListing(a.token);

    const all = await get('/users', admin.token);
    expect(all.body.total).toBe(3);

    const search = await get('/users?search=alice', admin.token);
    expect(search.body.users).toHaveLength(1);
    expect(search.body.users[0]).toMatchObject({ email: 'alice@example.com', listingCount: 1, activeListingCount: 1 });

    const owners = await get('/users?role=owner', admin.token);
    expect(owners.body.users.map((u: { email: string }) => u.email)).toEqual(['bob@example.com']);
  });

  it('filters by effective plan — an expired paid plan counts as free', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const b = await register('b@example.com');
    await User.updateOne({ _id: a.id }, { planTier: 'premium', planExpiresAt: new Date(Date.now() + 86_400_000) });
    await User.updateOne({ _id: b.id }, { planTier: 'premium', planExpiresAt: new Date(Date.now() - 86_400_000) });

    const premium = await get('/users?plan=premium', admin.token);
    expect(premium.body.users.map((u: { email: string }) => u.email)).toEqual(['a@example.com']);
    const free = await get('/users?plan=free', admin.token);
    expect(free.body.users.map((u: { email: string }) => u.email).sort()).toEqual(['admin@example.com', 'b@example.com']);
  });

  it('returns a user detail with listings, payments and engagement, and 404s for unknown ids', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);
    await Payment.create({ user: a.id, plan: 'basic', amount: 5000, currency: 'NGN', checkoutReference: 'EST-9', status: 'success' });
    await request(app).post('/api/events').send({ propertyId: id, type: 'view', visitorId: 'visitor-aaaa-1' });

    const res = await get(`/users/${a.id}`, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('a@example.com');
    expect(res.body.listings).toHaveLength(1);
    expect(res.body.payments[0]).toMatchObject({ plan: 'basic', status: 'success' });
    expect(res.body.engagement.views).toBe(1);

    expect((await get('/users/64b64b64b64b64b64b64b64b', admin.token)).status).toBe(404);
    expect((await get('/users/not-an-id', admin.token)).status).toBe(404);
  });

  it('lets an admin set identity verification, which shows as a verified listing badge', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);

    expect((await request(app).get(`/api/listings/${id}`)).body.listing.agentVerified).toBe(false);
    const res = await patch(`/users/${a.id}/verification`, admin.token, { status: 'verified' });
    expect(res.status).toBe(200);
    expect(res.body.user.verificationStatus).toBe('verified');
    expect((await request(app).get(`/api/listings/${id}`)).body.listing.agentVerified).toBe(true);
  });
});

describe('suspension', () => {
  it('blocks login and existing tokens, and hides the agent and their listings from the public', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);

    const res = await patch(`/users/${a.id}/suspension`, admin.token, { suspended: true, reason: 'Fraud report' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ suspended: true, suspensionReason: 'Fraud report' });

    // Can't log in, and the token they already hold stops working at once.
    const login = await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: PASSWORD });
    expect(login.status).toBe(403);
    expect((await request(app).get('/api/listings/mine').set('Authorization', `Bearer ${a.token}`)).status).toBe(403);

    // Hidden everywhere on the public site.
    expect((await request(app).get(`/api/listings/${id}`)).status).toBe(404);
    expect((await request(app).post(`/api/listings/${id}/contact`).send({ visitorId: 'visitor-aaaa-1' })).status).toBe(404);
    const search = await request(app).get('/api/listings');
    expect(search.body.listings).toHaveLength(0);
    expect(search.body.total).toBe(0);
    expect((await request(app).get('/api/users/agents')).body.agents).toHaveLength(0);
  });

  it('restores everything when the account is un-suspended', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);

    await patch(`/users/${a.id}/suspension`, admin.token, { suspended: true });
    await patch(`/users/${a.id}/suspension`, admin.token, { suspended: false });

    expect((await request(app).post('/api/auth/login').send({ email: 'a@example.com', password: PASSWORD })).status).toBe(200);
    expect((await request(app).get(`/api/listings/${id}`)).status).toBe(200);
    expect((await request(app).get('/api/listings')).body.total).toBe(1);
  });

  it('cannot suspend an admin or oneself', async () => {
    const admin = await registerAdmin();
    const other = await registerAdmin('admin2@example.com');
    expect((await patch(`/users/${admin.id}/suspension`, admin.token, { suspended: true })).status).toBe(400);
    expect((await patch(`/users/${other.id}/suspension`, admin.token, { suspended: true })).status).toBe(400);
  });
});

describe('listing moderation', () => {
  it('lists listings with views and filters, removes one from the public, and restores it', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);
    await createListing(a.token, { title: 'A second property in Abuja', listingType: 'rent', price: { amount: 3_000_000, currency: 'NGN', period: 'yearly' }, location: { country: 'Nigeria', state: 'FCT', city: 'Abuja' } });
    await request(app).post('/api/events').send({ propertyId: id, type: 'view', visitorId: 'visitor-aaaa-1' });

    const all = await get('/listings', admin.token);
    expect(all.body.total).toBe(2);
    expect(all.body.listings.find((l: { id: string }) => l.id === id)).toMatchObject({ views: 1, agent: { email: 'a@example.com' } });
    expect((await get('/listings?search=abuja', admin.token)).body.total).toBe(1);
    expect((await get('/listings?listingType=rent', admin.token)).body.total).toBe(1);

    const removed = await patch(`/listings/${id}/moderation`, admin.token, { action: 'remove', note: 'Misleading photos' });
    expect(removed.body.listing).toMatchObject({ status: 'inactive', unavailableReason: 'removed' });
    expect((await request(app).get(`/api/listings/${id}`)).status).toBe(404);
    expect((await get('/listings?removed=true', admin.token)).body.total).toBe(1);

    const restored = await patch(`/listings/${id}/moderation`, admin.token, { action: 'restore' });
    expect(restored.body.listing.status).toBe('active');
    expect((await request(app).get(`/api/listings/${id}`)).status).toBe(200);
  });

  it('stops the agent from restoring a listing an admin removed', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);
    await patch(`/listings/${id}/moderation`, admin.token, { action: 'remove' });

    const res = await request(app)
      .patch(`/api/listings/${id}/availability`)
      .set('Authorization', `Bearer ${a.token}`)
      .send({ available: true });
    expect(res.status).toBe(403);
  });

  it('only restores listings that an admin removed, and 404s on unknown ids', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);
    expect((await patch(`/listings/${id}/moderation`, admin.token, { action: 'restore' })).status).toBe(400);
    expect((await patch('/listings/64b64b64b64b64b64b64b64b/moderation', admin.token, { action: 'remove' })).status).toBe(404);
  });
});

describe('payments', () => {
  it('lists payments with the paying user and totals by status', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com', 'Agent A');
    await Payment.create({ user: a.id, plan: 'premium', amount: 15000, currency: 'NGN', checkoutReference: 'EST-1', status: 'success' });
    await Payment.create({ user: a.id, plan: 'basic', amount: 5000, currency: 'NGN', checkoutReference: 'EST-2', status: 'pending' });

    const res = await get('/payments', admin.token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect(res.body.totalsByStatus.success).toEqual({ amount: 15000, count: 1 });
    expect(res.body.payments[0].user).toMatchObject({ email: 'a@example.com' });

    expect((await get('/payments?status=success', admin.token)).body.payments).toHaveLength(1);
    expect((await get('/payments?plan=basic', admin.token)).body.payments).toHaveLength(1);
  });
});

describe('activity log', () => {
  it('records every admin action, newest first, with who did it', async () => {
    const admin = await registerAdmin();
    const a = await register('a@example.com');
    const id = await createListing(a.token);

    await patch(`/users/${a.id}/verification`, admin.token, { status: 'verified' });
    await patch(`/listings/${id}/moderation`, admin.token, { action: 'remove', note: 'Spam' });
    await patch(`/users/${a.id}/suspension`, admin.token, { suspended: true, reason: 'Fraud' });

    const res = await get('/activity', admin.token);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.actions.map((x: { type: string }) => x.type)).toEqual(['user.suspend', 'listing.remove', 'user.verify']);
    expect(res.body.actions[0]).toMatchObject({ targetLabel: 'a@example.com', note: 'Fraud', admin: { email: 'admin@example.com' } });
  });

  it('logs blog changes too', async () => {
    const admin = await registerAdmin();
    const created = await request(app)
      .post('/api/blog-admin')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ title: 'How to rent in Lagos', excerpt: 'A short guide to renting in Lagos.', bodyMarkdown: '# Hello\n\nSome body text here.', status: 'draft' });
    expect(created.status).toBe(201);
    await request(app).delete(`/api/blog-admin/${created.body.post._id}`).set('Authorization', `Bearer ${admin.token}`);

    const res = await get('/activity', admin.token);
    expect(res.body.actions.map((x: { type: string }) => x.type)).toEqual(['blog.delete', 'blog.create']);
  });
});

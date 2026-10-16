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

const validListingPayload = {
  title: 'Newly built 3 bedroom duplex, Lekki Phase 1',
  description: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year with BQ and pool.',
  listingType: 'rent',
  propertyType: 'duplex',
  price: { amount: 8_000_000, currency: 'NGN', period: 'yearly' },
  location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1' },
  specifications: { bedrooms: 3, bathrooms: 4, amenities: ['BQ', 'swimming pool'] },
};

describe('GET /api/analytics/mine', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/analytics/mine');
    expect(res.status).toBe(401);
  });

  it('counts only the requesting agent’s own listings', async () => {
    const tokenA = await registerAndLogin('agent-a@example.com');
    const tokenB = await registerAndLogin('agent-b@example.com');

    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenA}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenA}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenB}`).send(validListingPayload);

    const res = await request(app).get('/api/analytics/mine').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.listingsByStatus.active).toBe(2);
    expect(Array.isArray(res.body.listingsByMonth)).toBe(true);
    expect(res.body.listingsByMonth.reduce((sum: number, m: { count: number }) => sum + m.count, 0)).toBe(2);
  });

  it('returns all-zero shapes for an agent with nothing yet, not an error', async () => {
    const token = await registerAndLogin();
    const res = await request(app).get('/api/analytics/mine').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.listingsByStatus).toEqual({});
    expect(res.body.listingsByMonth).toEqual([]);
  });
});

describe('visitor tracking + GET /api/analytics/performance', () => {
  async function createListing(token: string) {
    const res = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);
    return res.body.listing._id as string;
  }
  const track = (propertyId: string, type: string, visitorId: string) =>
    request(app).post('/api/events').send({ propertyId, type, visitorId });

  it('requires auth', async () => {
    expect((await request(app).get('/api/analytics/performance')).status).toBe(401);
  });

  it('counts views, unique visitors, contact clicks and reveals per listing', async () => {
    const token = await registerAndLogin();
    const id = await createListing(token);

    await track(id, 'view', 'visitor-aaaa-1');
    await track(id, 'view', 'visitor-bbbb-2');
    await track(id, 'contact_click', 'visitor-aaaa-1');
    await request(app).post(`/api/listings/${id}/contact`).send({ visitorId: 'visitor-aaaa-1' });

    const res = await request(app).get('/api/analytics/performance').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.days).toBe(30);
    expect(res.body.totals).toEqual({ views: 2, uniqueVisitors: 2, contactClicks: 1, contactReveals: 1 });
    expect(res.body.listings[0]).toMatchObject({ id, views: 2, uniqueVisitors: 2, contactClicks: 1, contactReveals: 1 });
    expect(res.body.daily).toHaveLength(30);
    expect(res.body.daily[29].views).toBe(2);
  });

  it('counts a repeat of the same action by the same visitor only once', async () => {
    const token = await registerAndLogin();
    const id = await createListing(token);

    const first = await track(id, 'view', 'visitor-aaaa-1');
    const refresh = await track(id, 'view', 'visitor-aaaa-1');
    expect(first.body.recorded).toBe(true);
    expect(refresh.body.recorded).toBe(false);

    const res = await request(app).get('/api/analytics/performance').set('Authorization', `Bearer ${token}`);
    expect(res.body.totals.views).toBe(1);
  });

  it('does not count the owning agent viewing their own listing', async () => {
    const token = await registerAndLogin();
    const id = await createListing(token);

    const res = await request(app)
      .post('/api/events')
      .set('Authorization', `Bearer ${token}`)
      .send({ propertyId: id, type: 'view', visitorId: 'visitor-aaaa-1' });
    expect(res.body.recorded).toBe(false);
  });

  it('keeps one agent’s numbers out of another agent’s report', async () => {
    const tokenA = await registerAndLogin('agent-a@example.com');
    const tokenB = await registerAndLogin('agent-b@example.com');
    const idA = await createListing(tokenA);
    await createListing(tokenB);
    await track(idA, 'view', 'visitor-aaaa-1');

    const res = await request(app).get('/api/analytics/performance').set('Authorization', `Bearer ${tokenB}`);
    expect(res.body.totals.views).toBe(0);
    expect(res.body.listings).toHaveLength(1);
  });

  it('rejects contact_reveal from the public events endpoint, bad ids, and unknown listings', async () => {
    const token = await registerAndLogin();
    const id = await createListing(token);

    expect((await track(id, 'contact_reveal', 'visitor-aaaa-1')).status).toBe(400);
    expect((await track(id, 'view', 'x')).status).toBe(400);
    expect((await track('64b64b64b64b64b64b64b64b', 'view', 'visitor-aaaa-1')).status).toBe(404);
  });

  it('only accepts 7, 30 or 90 days', async () => {
    const token = await registerAndLogin();
    const bad = await request(app).get('/api/analytics/performance?days=5').set('Authorization', `Bearer ${token}`);
    expect(bad.status).toBe(400);
    const ok = await request(app).get('/api/analytics/performance?days=7').set('Authorization', `Bearer ${token}`);
    expect(ok.body.daily).toHaveLength(7);
  });
});

import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';
import { setAIProvider } from '../src/services/ai/extraction.service';
import { AIProvider, ListingDraft } from '../src/services/ai/AIProvider';

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

const fakeDraft: ListingDraft = {
  title: 'Newly built 3 bedroom duplex, Lekki Phase 1',
  description: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year. BQ, pool, parking, 24/7 security, prepaid meter.',
  listingType: 'rent',
  propertyType: 'duplex',
  price: { amount: 8_000_000, currency: 'NGN', period: 'yearly' },
  location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1', address: null },
  specifications: { bedrooms: 3, bathrooms: null, sizeSqm: null, amenities: ['BQ', 'swimming pool', 'parking space', '24/7 security', 'prepaid meter'] },
};

describe('POST /api/listings/draft', () => {
  it('requires auth', async () => {
    const res = await request(app).post('/api/listings/draft').send({ text: 'a'.repeat(20) });
    expect(res.status).toBe(401);
  });

  it('returns a structured draft from a mocked AI provider, unmodified', async () => {
    const mockProvider: AIProvider = {
      extractListingDraft: jest.fn().mockResolvedValue(fakeDraft),
    };
    setAIProvider(mockProvider);

    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/listings/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year...' });

    expect(res.status).toBe(200);
    expect(res.body.draft).toEqual(fakeDraft);
    expect(mockProvider.extractListingDraft).toHaveBeenCalledTimes(1);
  });

  it('rejects text that is too short to be worth extracting', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/listings/draft')
      .set('Authorization', `Bearer ${token}`)
      .send({ text: 'too short' });

    expect(res.status).toBe(400);
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

describe('POST /api/listings', () => {
  it('creates a listing for the authenticated agent with status pending_review', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);

    expect(res.status).toBe(201);
    expect(res.body.listing.status).toBe('pending_review');
    expect(res.body.listing.source).toBe('internal');
  });

  it('rejects a listing with a non-positive price even if everything else is valid', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, price: { ...validListingPayload.price, amount: -100 } });

    expect(res.status).toBe(400);
  });

  it('rejects a listing missing a required city', async () => {
    const token = await registerAndLogin();
    const { city, ...locationWithoutCity } = validListingPayload.location;
    void city;
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, location: locationWithoutCity });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/listings/mine', () => {
  it('only returns listings created by the requesting agent', async () => {
    const tokenA = await registerAndLogin('agent-a@example.com');
    const tokenB = await registerAndLogin('agent-b@example.com');

    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenA}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${tokenB}`).send(validListingPayload);

    const res = await request(app).get('/api/listings/mine').set('Authorization', `Bearer ${tokenA}`);

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(1);
  });
});

describe('PATCH /api/listings/:id', () => {
  it('rejects edits from a user who does not own the listing', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');

    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${owner}`)
      .send(validListingPayload);
    const listingId = createRes.body.listing._id;

    const res = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${intruder}`)
      .send({ title: 'Hijacked title' });

    expect(res.status).toBe(403);
  });
});

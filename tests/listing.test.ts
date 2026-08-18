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
  it('creates a listing for the authenticated agent with status active (no moderation queue yet)', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);

    expect(res.status).toBe(201);
    expect(res.body.listing.status).toBe('active');
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

describe('GET /api/listings (search/pagination)', () => {
  async function createNListings(token: string, n: number) {
    for (let i = 0; i < n; i++) {
      await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validListingPayload, title: `${validListingPayload.title} #${i}` });
    }
  }

  it('defaults to 12 per page and reports pagination metadata', async () => {
    const token = await registerAndLogin();
    await createNListings(token, 15);

    const res = await request(app).get('/api/listings');

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(12);
    expect(res.body).toMatchObject({ total: 15, page: 1, limit: 12, totalPages: 2 });
  });

  it('returns the remainder on page 2, with no overlap with page 1', async () => {
    const token = await registerAndLogin();
    await createNListings(token, 15);

    const page1 = await request(app).get('/api/listings?page=1');
    const page2 = await request(app).get('/api/listings?page=2');

    expect(page2.body.listings).toHaveLength(3);
    expect(page2.body.page).toBe(2);

    const page1Ids = page1.body.listings.map((l: { _id: string }) => l._id);
    const page2Ids = page2.body.listings.map((l: { _id: string }) => l._id);
    expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
  });

  it('an empty-of-results page still reports correct totals, not an error', async () => {
    const token = await registerAndLogin();
    await createNListings(token, 5);

    const res = await request(app).get('/api/listings?page=99');

    expect(res.status).toBe(200);
    expect(res.body.listings).toHaveLength(0);
    expect(res.body).toMatchObject({ total: 5, page: 99, totalPages: 1 });
  });

  it('filters by international (location.country !== Nigeria)', async () => {
    const token = await registerAndLogin();
    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload); // Nigeria
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ...validListingPayload,
        location: { ...validListingPayload.location, country: 'United States', state: 'TX', city: 'Austin' },
      });

    const noFilter = await request(app).get('/api/listings');
    const internationalOnly = await request(app).get('/api/listings?international=true');
    const localOnly = await request(app).get('/api/listings?international=false');

    expect(noFilter.body.total).toBe(2);
    expect(internationalOnly.body.total).toBe(1);
    expect(internationalOnly.body.listings[0].location.country).toBe('United States');
    expect(localOnly.body.total).toBe(1);
    expect(localOnly.body.listings[0].location.country).toBe('Nigeria');
  });

  it('filters by propertyType', async () => {
    const token = await registerAndLogin();
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, propertyType: 'apartment' });
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, propertyType: 'land' });

    const res = await request(app).get('/api/listings?propertyType=land');

    expect(res.body.total).toBe(1);
    expect(res.body.listings[0].propertyType).toBe('land');
  });

  it('filters by min/max price range', async () => {
    const token = await registerAndLogin();
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, price: { ...validListingPayload.price, amount: 2_000_000 } });
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, price: { ...validListingPayload.price, amount: 10_000_000 } });

    const res = await request(app).get('/api/listings?minPrice=5000000&maxPrice=15000000');

    expect(res.body.total).toBe(1);
    expect(res.body.listings[0].price.amount).toBe(10_000_000);
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

describe('GET /api/listings/mine (routing order regression)', () => {
  it('still requires auth and is not shadowed by the GET /:id route', async () => {
    // Guards against the exact bug the routes file comments call out:
    // '/:id' registered before the literal '/mine' would treat "mine" as an
    // id and 404/misbehave instead of 401ing for an unauthenticated request.
    const res = await request(app).get('/api/listings/mine');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/listings/:id', () => {
  it('returns a public listing without leaking createdBy', async () => {
    const token = await registerAndLogin();
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);
    const listingId = createRes.body.listing._id;

    const res = await request(app).get(`/api/listings/${listingId}`);

    expect(res.status).toBe(200);
    expect(res.body.listing._id).toBe(listingId);
    expect(res.body.listing.agentVerified).toBe(false);
    expect(res.body.listing.createdBy).toBeUndefined();
  });

  it('404s for a well-formed id that does not exist', async () => {
    const res = await request(app).get('/api/listings/64b7f9f9f9f9f9f9f9f9f9f9');
    expect(res.status).toBe(404);
  });

  it('404s for a malformed id instead of 500ing', async () => {
    const res = await request(app).get('/api/listings/not-a-valid-object-id');
    expect(res.status).toBe(404);
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

import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';
import { setAIProvider } from '../src/services/ai/extraction.service';
import { AIProvider, ListingDraft } from '../src/services/ai/AIProvider';
import { User } from '../src/models/User';
import * as emailService from '../src/services/email/email.service';

// tests/setup.ts already globally mocks this module (so every registration
// email across every test file is a harmless no-op) — this just gets a
// typed handle on that same mock to assert on calls in the tests below.
const mockedSendNewListingEmail = emailService.sendNewListingEmail as jest.MockedFunction<
  typeof emailService.sendNewListingEmail
>;

const app = createApp();

beforeAll(async () => {
  await startTestDB();
});

afterAll(async () => {
  await stopTestDB();
});

afterEach(async () => {
  await clearTestDB();
  mockedSendNewListingEmail.mockClear();
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
  // These tests are about pagination, not the listing-quota feature — bump
  // to Premium (unlimited) first so a Free plan's 2/month cap doesn't
  // silently make most of these creates fail.
  async function createNListings(token: string, n: number, email = 'agent@example.com') {
    await User.updateOne({ email }, { planTier: 'premium', planExpiresAt: new Date(Date.now() + 30 * 86_400_000) });
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

describe('New-listing email notification (Premium plan only)', () => {
  // createListing() fires this without awaiting it (fire-and-forget) so it
  // never blocks or fails the create response — give the microtask queue
  // one tick to let it actually run before asserting on the mock.
  const flush = () => new Promise((r) => setTimeout(r, 50));

  it('does not email anyone when a Free-plan agent publishes', async () => {
    const token = await registerAndLogin();
    await User.updateOne({ email: 'agent@example.com' }, { emailMarketingOptIn: false });
    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);
    await flush();

    expect(mockedSendNewListingEmail).not.toHaveBeenCalled();
  });

  it('emails opted-in users when a Premium-plan agent publishes', async () => {
    const posterToken = await registerAndLogin('premium-poster@example.com');
    await User.updateOne(
      { email: 'premium-poster@example.com' },
      { planTier: 'premium', planExpiresAt: new Date(Date.now() + 30 * 86_400_000) },
    );
    await registerAndLogin('opted-in@example.com');
    await User.updateOne({ email: 'opted-in@example.com' }, { emailMarketingOptIn: true });
    await registerAndLogin('opted-out@example.com'); // opted-in defaults false — deliberately left as-is

    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${posterToken}`)
      .send({ ...validListingPayload, title: 'A Premium Listing' });
    await flush();

    expect(mockedSendNewListingEmail).toHaveBeenCalledTimes(1);
    const [toEmail, , listingTitle] = mockedSendNewListingEmail.mock.calls[0];
    expect(toEmail).toBe('opted-in@example.com');
    expect(listingTitle).toBe('A Premium Listing');
  });

  it('never emails the poster themselves, even if they are opted in', async () => {
    const posterToken = await registerAndLogin('premium-poster2@example.com');
    await User.updateOne(
      { email: 'premium-poster2@example.com' },
      { planTier: 'premium', planExpiresAt: new Date(Date.now() + 30 * 86_400_000), emailMarketingOptIn: true },
    );

    await request(app).post('/api/listings').set('Authorization', `Bearer ${posterToken}`).send(validListingPayload);
    await flush();

    expect(mockedSendNewListingEmail).not.toHaveBeenCalled();
  });
});

describe('Listing quota (Free plan default)', () => {
  it('allows up to the Free plan\'s 2-per-month limit', async () => {
    const token = await registerAndLogin();
    const first = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);
    const second = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
  });

  it('blocks a 3rd listing in the same month with a clear upgrade message', async () => {
    const token = await registerAndLogin();
    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);

    const third = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);

    expect(third.status).toBe(403);
    expect(third.body.message).toMatch(/upgrade/i);
  });

  it('an active Premium plan is not capped', async () => {
    const token = await registerAndLogin();
    await User.updateOne(
      { email: 'agent@example.com' },
      { planTier: 'premium', planExpiresAt: new Date(Date.now() + 30 * 86_400_000) },
    );

    for (let i = 0; i < 4; i++) {
      const res = await request(app)
        .post('/api/listings')
        .set('Authorization', `Bearer ${token}`)
        .send({ ...validListingPayload, title: `${validListingPayload.title} #${i}` });
      expect(res.status).toBe(201);
    }
  });

  it('an expired Premium plan is lazily treated as Free — capped again', async () => {
    const token = await registerAndLogin();
    await User.updateOne(
      { email: 'agent@example.com' },
      { planTier: 'premium', planExpiresAt: new Date(Date.now() - 1000) }, // already lapsed
    );

    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);
    await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);
    const third = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send(validListingPayload);

    expect(third.status).toBe(403);
  });
});

describe('Search priority (paid plans rank first)', () => {
  it('ranks an active Premium listing above a Free listing, regardless of recency', async () => {
    const freeToken = await registerAndLogin('free-agent@example.com');
    const premiumToken = await registerAndLogin('premium-agent@example.com');
    await User.updateOne(
      { email: 'premium-agent@example.com' },
      { planTier: 'premium', planExpiresAt: new Date(Date.now() + 30 * 86_400_000) },
    );

    // Free listing created first (would normally sort first by recency).
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ ...validListingPayload, title: 'Free agent listing' });
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${premiumToken}`)
      .send({ ...validListingPayload, title: 'Premium agent listing' });

    const res = await request(app).get('/api/listings');

    expect(res.body.listings[0].title).toBe('Premium agent listing');
    expect(res.body.listings[0].featured).toBe(true);
    expect(res.body.listings[1].title).toBe('Free agent listing');
    expect(res.body.listings[1].featured).toBe(false);
  });

  it('does not let an expired paid plan jump the queue', async () => {
    const freeToken = await registerAndLogin('free-agent2@example.com');
    const lapsedToken = await registerAndLogin('lapsed-agent@example.com');
    await User.updateOne(
      { email: 'lapsed-agent@example.com' },
      { planTier: 'premium', planExpiresAt: new Date(Date.now() - 1000) },
    );

    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${lapsedToken}`)
      .send({ ...validListingPayload, title: 'Lapsed premium listing' });
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${freeToken}`)
      .send({ ...validListingPayload, title: 'Newer free listing' });

    const res = await request(app).get('/api/listings');

    // Both effectively Free now, so plain recency order applies.
    expect(res.body.listings[0].title).toBe('Newer free listing');
    expect(res.body.listings[0].featured).toBe(false);
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

  it('404s editing a listing that does not exist', async () => {
    const token = await registerAndLogin();
    const res = await request(app)
      .patch('/api/listings/64b7f9f9f9f9f9f9f9f9f9f9')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Does not matter' });

    expect(res.status).toBe(404);
  });

  it('lets the owner update their own listing, persisting the change', async () => {
    const token = await registerAndLogin();
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);
    const listingId = createRes.body.listing._id;

    const res = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ ...validListingPayload, title: 'Updated title', price: { ...validListingPayload.price, amount: 9_500_000 } });

    expect(res.status).toBe(200);
    expect(res.body.listing.title).toBe('Updated title');
    expect(res.body.listing.price.amount).toBe(9_500_000);

    const fetchRes = await request(app).get(`/api/listings/${listingId}`);
    expect(fetchRes.body.listing.title).toBe('Updated title');
  });

  it('rejects an edit that would make the price non-positive, even for the owner', async () => {
    const token = await registerAndLogin();
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send(validListingPayload);
    const listingId = createRes.body.listing._id;

    const res = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: { ...validListingPayload.price, amount: -1 } });

    expect(res.status).toBe(400);
  });
});

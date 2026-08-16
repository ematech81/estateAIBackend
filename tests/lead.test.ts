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

async function createListing(token: string) {
  const res = await request(app)
    .post('/api/listings')
    .set('Authorization', `Bearer ${token}`)
    .send(validListingPayload);
  return res.body.listing._id as string;
}

describe('POST /api/leads', () => {
  it('creates a lead against a real listing without auth', async () => {
    const agentToken = await registerAndLogin('agent@example.com');
    const listingId = await createListing(agentToken);

    const res = await request(app).post('/api/leads').send({
      propertyId: listingId,
      name: 'Interested Seeker',
      email: 'seeker@example.com',
      message: 'Is this still available?',
    });

    expect(res.status).toBe(201);
    expect(res.body.lead.status).toBe('new');
  });

  it('404s for a listing that does not exist', async () => {
    const res = await request(app).post('/api/leads').send({
      propertyId: '64b7f9f9f9f9f9f9f9f9f9f9',
      name: 'Interested Seeker',
      email: 'seeker@example.com',
    });

    expect(res.status).toBe(404);
  });

  it('rejects a malformed email', async () => {
    const agentToken = await registerAndLogin('agent@example.com');
    const listingId = await createListing(agentToken);

    const res = await request(app).post('/api/leads').send({
      propertyId: listingId,
      name: 'Interested Seeker',
      email: 'not-an-email',
    });

    expect(res.status).toBe(400);
  });
});

describe('GET /api/leads/mine', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/leads/mine');
    expect(res.status).toBe(401);
  });

  it("only returns leads for the requesting agent's own listings", async () => {
    const agentA = await registerAndLogin('agent-a@example.com');
    const agentB = await registerAndLogin('agent-b@example.com');
    const listingA = await createListing(agentA);
    const listingB = await createListing(agentB);

    await request(app)
      .post('/api/leads')
      .send({ propertyId: listingA, name: 'Seeker 1', email: 'seeker1@example.com' });
    await request(app)
      .post('/api/leads')
      .send({ propertyId: listingB, name: 'Seeker 2', email: 'seeker2@example.com' });

    const res = await request(app).get('/api/leads/mine').set('Authorization', `Bearer ${agentA}`);

    expect(res.status).toBe(200);
    expect(res.body.leads).toHaveLength(1);
    expect(res.body.leads[0].name).toBe('Seeker 1');
  });
});

describe('PATCH /api/leads/:id', () => {
  it('rejects a status update from an agent who does not own the lead', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const intruder = await registerAndLogin('intruder@example.com');
    const listingId = await createListing(owner);

    const leadRes = await request(app)
      .post('/api/leads')
      .send({ propertyId: listingId, name: 'Seeker', email: 'seeker@example.com' });
    const leadId = leadRes.body.lead._id;

    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${intruder}`)
      .send({ status: 'contacted' });

    expect(res.status).toBe(403);
  });

  it('updates status for the owning agent', async () => {
    const owner = await registerAndLogin('owner@example.com');
    const listingId = await createListing(owner);

    const leadRes = await request(app)
      .post('/api/leads')
      .send({ propertyId: listingId, name: 'Seeker', email: 'seeker@example.com' });
    const leadId = leadRes.body.lead._id;

    const res = await request(app)
      .patch(`/api/leads/${leadId}`)
      .set('Authorization', `Bearer ${owner}`)
      .send({ status: 'contacted' });

    expect(res.status).toBe(200);
    expect(res.body.lead.status).toBe('contacted');
  });
});

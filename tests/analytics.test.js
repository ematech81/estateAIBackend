"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const testDb_1 = require("./helpers/testDb");
const app = (0, app_1.createApp)();
beforeAll(async () => {
    await (0, testDb_1.startTestDB)();
});
afterAll(async () => {
    await (0, testDb_1.stopTestDB)();
});
afterEach(async () => {
    await (0, testDb_1.clearTestDB)();
});
async function registerAndLogin(email = 'agent@example.com') {
    const res = await (0, supertest_1.default)(app).post('/api/auth/register').send({
        email,
        password: 'supersecret123',
        name: 'Chinedu Okafor',
        role: 'agent',
    });
    return res.body.token;
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
        const res = await (0, supertest_1.default)(app).get('/api/analytics/mine');
        expect(res.status).toBe(401);
    });
    it('counts only the requesting agent’s own listings and leads', async () => {
        const tokenA = await registerAndLogin('agent-a@example.com');
        const tokenB = await registerAndLogin('agent-b@example.com');
        const listingA1 = await (0, supertest_1.default)(app)
            .post('/api/listings')
            .set('Authorization', `Bearer ${tokenA}`)
            .send(validListingPayload);
        await (0, supertest_1.default)(app).post('/api/listings').set('Authorization', `Bearer ${tokenA}`).send(validListingPayload);
        await (0, supertest_1.default)(app).post('/api/listings').set('Authorization', `Bearer ${tokenB}`).send(validListingPayload);
        await (0, supertest_1.default)(app)
            .post('/api/leads')
            .send({ propertyId: listingA1.body.listing._id, name: 'Seeker', email: 'seeker@example.com' });
        const res = await (0, supertest_1.default)(app).get('/api/analytics/mine').set('Authorization', `Bearer ${tokenA}`);
        expect(res.status).toBe(200);
        expect(res.body.listingsByStatus.active).toBe(2);
        expect(res.body.leadsByStatus.new).toBe(1);
        expect(Array.isArray(res.body.listingsByMonth)).toBe(true);
        expect(res.body.listingsByMonth.reduce((sum, m) => sum + m.count, 0)).toBe(2);
    });
    it('returns all-zero shapes for an agent with nothing yet, not an error', async () => {
        const token = await registerAndLogin();
        const res = await (0, supertest_1.default)(app).get('/api/analytics/mine').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.listingsByStatus).toEqual({});
        expect(res.body.leadsByStatus).toEqual({});
        expect(res.body.listingsByMonth).toEqual([]);
    });
});
//# sourceMappingURL=analytics.test.js.map
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const testDb_1 = require("./helpers/testDb");
// Deliberately its own file, and deliberately never calls setAIProvider()
// (unlike listing.test.ts) — extraction.service.ts's provider is
// module-level state that, once set, stays set for the rest of that
// module's lifetime. Jest gives each test file its own fresh module
// registry, so this is the one place the real (unconfigured, per
// tests/setup.ts blanking ANTHROPIC_API_KEY) AnthropicProvider
// construction path actually gets exercised.
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
describe('POST /api/listings/draft with no AI provider configured', () => {
    it('returns a clear, safe 500 instead of a generic or leaked internal error', async () => {
        const token = await registerAndLogin();
        const res = await (0, supertest_1.default)(app)
            .post('/api/listings/draft')
            .set('Authorization', `Bearer ${token}`)
            .send({ text: 'Newly built 3 bedroom duplex at Lekki Phase 1, ₦8 million per year...' });
        expect(res.status).toBe(500);
        expect(res.body.message).toMatch(/not configured/i);
    });
});
//# sourceMappingURL=aiProviderUnconfigured.test.js.map
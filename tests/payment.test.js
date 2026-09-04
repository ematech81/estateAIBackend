"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = __importDefault(require("crypto"));
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const testDb_1 = require("./helpers/testDb");
const User_1 = require("../src/models/User");
const Payment_1 = require("../src/models/Payment");
const payment_service_1 = require("../src/modules/payments/payment.service");
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
    return { token: res.body.token, userId: res.body.user.id };
}
describe('verifyKorapaySignature', () => {
    const secret = 'test-korapay-secret';
    const data = { reference: 'EST-abc123', status: 'success', amount: 5000 };
    it('accepts a correctly computed HMAC-SHA256 signature', () => {
        const validSignature = crypto_1.default.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
        expect((0, payment_service_1.verifyKorapaySignature)(data, validSignature, secret)).toBe(true);
    });
    it('rejects a forged/incorrect signature', () => {
        expect((0, payment_service_1.verifyKorapaySignature)(data, 'a'.repeat(64), secret)).toBe(false);
    });
    it('rejects a signature computed with the wrong secret', () => {
        const wrongSecretSignature = crypto_1.default.createHmac('sha256', 'someone-elses-secret').update(JSON.stringify(data)).digest('hex');
        expect((0, payment_service_1.verifyKorapaySignature)(data, wrongSecretSignature, secret)).toBe(false);
    });
    it('rejects when no secret is configured (secure-by-default)', () => {
        const validSignature = crypto_1.default.createHmac('sha256', secret).update(JSON.stringify(data)).digest('hex');
        expect((0, payment_service_1.verifyKorapaySignature)(data, validSignature, undefined)).toBe(false);
    });
    it('rejects when no signature header is present', () => {
        expect((0, payment_service_1.verifyKorapaySignature)(data, undefined, secret)).toBe(false);
    });
});
describe('handleChargeSuccess', () => {
    it('activates the purchased plan with the correct expiry, for the right user', async () => {
        const { userId } = await registerAndLogin();
        await Payment_1.Payment.create({
            user: userId,
            plan: 'premium',
            amount: 15000,
            currency: 'NGN',
            checkoutReference: 'EST-test-ref-1',
            status: 'pending',
        });
        const before = Date.now();
        await (0, payment_service_1.handleChargeSuccess)('EST-test-ref-1');
        const user = await User_1.User.findById(userId);
        expect(user.planTier).toBe('premium');
        expect(user.planExpiresAt.getTime()).toBeGreaterThan(before + 29 * 86_400_000);
        expect(user.planExpiresAt.getTime()).toBeLessThan(before + 31 * 86_400_000);
        const payment = await Payment_1.Payment.findOne({ checkoutReference: 'EST-test-ref-1' });
        expect(payment.status).toBe('success');
    });
    it('is idempotent — processing the same reference twice does not re-extend the expiry', async () => {
        const { userId } = await registerAndLogin();
        await Payment_1.Payment.create({
            user: userId,
            plan: 'basic',
            amount: 5000,
            currency: 'NGN',
            checkoutReference: 'EST-test-ref-2',
            status: 'pending',
        });
        await (0, payment_service_1.handleChargeSuccess)('EST-test-ref-2');
        const firstExpiry = (await User_1.User.findById(userId)).planExpiresAt.getTime();
        // Simulate the router's retry delivering the same webhook again.
        await (0, payment_service_1.handleChargeSuccess)('EST-test-ref-2');
        const secondExpiry = (await User_1.User.findById(userId)).planExpiresAt.getTime();
        expect(secondExpiry).toBe(firstExpiry);
    });
    it('is a silent no-op for a reference that does not exist', async () => {
        await expect((0, payment_service_1.handleChargeSuccess)('EST-does-not-exist')).resolves.toBeUndefined();
    });
});
describe('POST /api/payments/checkout', () => {
    it('requires auth', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/payments/checkout').send({ plan: 'basic' });
        expect(res.status).toBe(401);
    });
    it('rejects an invalid plan', async () => {
        const { token } = await registerAndLogin();
        const res = await (0, supertest_1.default)(app)
            .post('/api/payments/checkout')
            .set('Authorization', `Bearer ${token}`)
            .send({ plan: 'free' }); // not payable
        expect(res.status).toBe(400);
    });
    it('returns a clear 500 when KoraPay is not configured (the test-env default)', async () => {
        const { token } = await registerAndLogin();
        const res = await (0, supertest_1.default)(app)
            .post('/api/payments/checkout')
            .set('Authorization', `Bearer ${token}`)
            .send({ plan: 'basic' });
        expect(res.status).toBe(500);
        expect(res.body.message).toMatch(/not configured/i);
    });
});
describe('POST /api/webhooks/korapay', () => {
    it('rejects a request with a missing/invalid signature (secure-by-default when unconfigured)', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/webhooks/korapay')
            .send({ event: 'charge.success', data: { reference: 'EST-whatever', status: 'success' } });
        expect(res.status).toBe(401);
    });
    it('does not require auth (no 401 from requireAuth for a missing token — the signature check is the real gate)', async () => {
        // Distinguishes "rejected because no auth token" (would mean requireAuth
        // was wrongly applied) from "rejected because signature invalid" (the
        // correct, intended reason) — both currently 401, so assert the
        // message is the signature one, not requireAuth's.
        const res = await (0, supertest_1.default)(app).post('/api/webhooks/korapay').send({});
        expect(res.body.message).toMatch(/signature/i);
    });
});
//# sourceMappingURL=payment.test.js.map
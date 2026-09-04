"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const testDb_1 = require("./helpers/testDb");
const PasswordResetToken_1 = require("../src/models/PasswordResetToken");
const EmailVerificationToken_1 = require("../src/models/EmailVerificationToken");
const emailService = __importStar(require("../src/services/email/email.service"));
// Mocked so these tests never hit the real Brevo API (or depend on the
// real BREVO_API_KEY in a developer's .env, which tests/setup.ts blanks
// out anyway) — same idea as setAIProvider() for the Anthropic provider.
jest.mock('../src/services/email/email.service');
const mockedSendPasswordResetEmail = emailService.sendPasswordResetEmail;
const mockedSendEmailVerificationEmail = emailService.sendEmailVerificationEmail;
function extractTokenFromUrl(url) {
    return new URL(url).searchParams.get('token');
}
const app = (0, app_1.createApp)();
beforeAll(async () => {
    await (0, testDb_1.startTestDB)();
});
afterAll(async () => {
    await (0, testDb_1.stopTestDB)();
});
afterEach(async () => {
    await (0, testDb_1.clearTestDB)();
    mockedSendPasswordResetEmail.mockClear();
    mockedSendEmailVerificationEmail.mockClear();
});
const validAgent = {
    email: 'agent@example.com',
    password: 'supersecret123',
    name: 'Chinedu Okafor',
    role: 'agent',
    phone: '+2348012345678',
};
describe('POST /api/auth/register', () => {
    it('registers a new agent and returns a token + public user (no password hash)', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        expect(res.status).toBe(201);
        expect(res.body.token).toEqual(expect.any(String));
        expect(res.body.user.email).toBe(validAgent.email);
        expect(res.body.user.role).toBe('agent');
        expect(res.body.user).not.toHaveProperty('hashedPassword');
    });
    it('rejects a duplicate email', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        const res = await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        expect(res.status).toBe(409);
    });
    it('rejects an invalid role (admin is not self-registrable)', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/register')
            .send({ ...validAgent, role: 'admin' });
        expect(res.status).toBe(400);
    });
    it('rejects a short password', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/register')
            .send({ ...validAgent, password: '123' });
        expect(res.status).toBe(400);
    });
});
describe('POST /api/auth/login', () => {
    it('logs in with correct credentials', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({ email: validAgent.email, password: validAgent.password });
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
    });
    it('rejects a wrong password', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({ email: validAgent.email, password: 'wrong-password' });
        expect(res.status).toBe(401);
    });
    it('rejects an unknown email', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@example.com', password: 'whatever123' });
        expect(res.status).toBe(401);
    });
});
describe('POST /api/auth/forgot-password', () => {
    it('sends a reset email for a registered account', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        mockedSendPasswordResetEmail.mockResolvedValueOnce(undefined);
        const res = await (0, supertest_1.default)(app).post('/api/auth/forgot-password').send({ email: validAgent.email });
        expect(res.status).toBe(200);
        expect(mockedSendPasswordResetEmail).toHaveBeenCalledTimes(1);
        expect(mockedSendPasswordResetEmail.mock.calls[0][0]).toBe(validAgent.email);
    });
    it('returns the exact same response for an unregistered email — no account enumeration', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/if an account exists/i);
        expect(mockedSendPasswordResetEmail).not.toHaveBeenCalled();
    });
    it('still responds 200 even if the email provider throws — never leaks that to the client', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        mockedSendPasswordResetEmail.mockRejectedValueOnce(new Error('Brevo is down'));
        const res = await (0, supertest_1.default)(app).post('/api/auth/forgot-password').send({ email: validAgent.email });
        expect(res.status).toBe(200);
    });
    it('keeps only one live token per account — a new request replaces the earlier unused one', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        mockedSendPasswordResetEmail.mockResolvedValue(undefined);
        await (0, supertest_1.default)(app).post('/api/auth/forgot-password').send({ email: validAgent.email });
        await (0, supertest_1.default)(app).post('/api/auth/forgot-password').send({ email: validAgent.email });
        expect(await PasswordResetToken_1.PasswordResetToken.countDocuments({})).toBe(1);
    });
});
describe('POST /api/auth/reset-password', () => {
    async function requestResetAndGetToken(email) {
        mockedSendPasswordResetEmail.mockResolvedValueOnce(undefined);
        await (0, supertest_1.default)(app).post('/api/auth/forgot-password').send({ email });
        const resetUrl = mockedSendPasswordResetEmail.mock.calls[0][2];
        return extractTokenFromUrl(resetUrl);
    }
    it('resets the password with a valid token — new password works, old one no longer does', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        const token = await requestResetAndGetToken(validAgent.email);
        const resetRes = await (0, supertest_1.default)(app)
            .post('/api/auth/reset-password')
            .send({ token, newPassword: 'brandnewpassword456' });
        expect(resetRes.status).toBe(200);
        const oldLogin = await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({ email: validAgent.email, password: validAgent.password });
        expect(oldLogin.status).toBe(401);
        const newLogin = await (0, supertest_1.default)(app)
            .post('/api/auth/login')
            .send({ email: validAgent.email, password: 'brandnewpassword456' });
        expect(newLogin.status).toBe(200);
    });
    it('rejects an invalid/garbage token', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/reset-password')
            .send({ token: 'not-a-real-token', newPassword: 'brandnewpassword456' });
        expect(res.status).toBe(400);
    });
    it('rejects reusing an already-redeemed token (single-use)', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        const token = await requestResetAndGetToken(validAgent.email);
        await (0, supertest_1.default)(app).post('/api/auth/reset-password').send({ token, newPassword: 'firstnewpassword456' });
        const secondAttempt = await (0, supertest_1.default)(app)
            .post('/api/auth/reset-password')
            .send({ token, newPassword: 'secondnewpassword456' });
        expect(secondAttempt.status).toBe(400);
    });
    it('rejects an expired token', async () => {
        await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        const token = await requestResetAndGetToken(validAgent.email);
        // The service checks expiresAt explicitly rather than relying on
        // MongoDB's background TTL sweep, so forcing this directly is a valid
        // way to simulate "expired" without waiting on that sweep.
        await PasswordResetToken_1.PasswordResetToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/reset-password')
            .send({ token, newPassword: 'brandnewpassword456' });
        expect(res.status).toBe(400);
    });
    it('rejects a new password shorter than 8 characters', async () => {
        const res = await (0, supertest_1.default)(app)
            .post('/api/auth/reset-password')
            .send({ token: 'whatever-token', newPassword: 'short' });
        expect(res.status).toBe(400);
    });
});
describe('email verification', () => {
    async function registerAndGetVerificationToken(email = validAgent.email) {
        mockedSendEmailVerificationEmail.mockResolvedValueOnce(undefined);
        await (0, supertest_1.default)(app).post('/api/auth/register').send({ ...validAgent, email });
        const verifyUrl = mockedSendEmailVerificationEmail.mock.calls[0][2];
        return extractTokenFromUrl(verifyUrl);
    }
    it('sends a verification email on registration, and the new account starts unverified', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        expect(res.status).toBe(201);
        expect(res.body.user.emailVerified).toBe(false);
        expect(mockedSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
        expect(mockedSendEmailVerificationEmail.mock.calls[0][0]).toBe(validAgent.email);
    });
    it('registration still succeeds even if the verification email fails to send', async () => {
        mockedSendEmailVerificationEmail.mockRejectedValueOnce(new Error('Brevo is down'));
        const res = await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
        expect(res.status).toBe(201);
    });
    describe('POST /api/auth/verify-email', () => {
        it('marks the account verified with a valid token', async () => {
            const token = await registerAndGetVerificationToken();
            const res = await (0, supertest_1.default)(app).post('/api/auth/verify-email').send({ token });
            expect(res.status).toBe(200);
            const me = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ email: validAgent.email, password: validAgent.password });
            const profile = await (0, supertest_1.default)(app).get('/api/users/me').set('Authorization', `Bearer ${me.body.token}`);
            expect(profile.body.user.emailVerified).toBe(true);
        });
        it('rejects an invalid/garbage token', async () => {
            const res = await (0, supertest_1.default)(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
            expect(res.status).toBe(400);
        });
        it('rejects reusing an already-redeemed token', async () => {
            const token = await registerAndGetVerificationToken();
            await (0, supertest_1.default)(app).post('/api/auth/verify-email').send({ token });
            const secondAttempt = await (0, supertest_1.default)(app).post('/api/auth/verify-email').send({ token });
            expect(secondAttempt.status).toBe(400);
        });
        it('rejects an expired token', async () => {
            const token = await registerAndGetVerificationToken();
            await EmailVerificationToken_1.EmailVerificationToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
            const res = await (0, supertest_1.default)(app).post('/api/auth/verify-email').send({ token });
            expect(res.status).toBe(400);
        });
    });
    describe('POST /api/auth/resend-verification', () => {
        it('requires auth', async () => {
            const res = await (0, supertest_1.default)(app).post('/api/auth/resend-verification');
            expect(res.status).toBe(401);
        });
        it('resends to the signed-in user\'s own email for an unverified account', async () => {
            mockedSendEmailVerificationEmail.mockResolvedValue(undefined);
            const registerRes = await (0, supertest_1.default)(app).post('/api/auth/register').send(validAgent);
            mockedSendEmailVerificationEmail.mockClear(); // ignore the registration-time send
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/resend-verification')
                .set('Authorization', `Bearer ${registerRes.body.token}`);
            expect(res.status).toBe(200);
            expect(res.body.alreadyVerified).toBe(false);
            expect(mockedSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
            expect(mockedSendEmailVerificationEmail.mock.calls[0][0]).toBe(validAgent.email);
        });
        it('is a no-op that reports alreadyVerified for an already-verified account', async () => {
            const token = await registerAndGetVerificationToken();
            const loginRes = await (0, supertest_1.default)(app)
                .post('/api/auth/login')
                .send({ email: validAgent.email, password: validAgent.password });
            await (0, supertest_1.default)(app).post('/api/auth/verify-email').send({ token });
            mockedSendEmailVerificationEmail.mockClear();
            const res = await (0, supertest_1.default)(app)
                .post('/api/auth/resend-verification')
                .set('Authorization', `Bearer ${loginRes.body.token}`);
            expect(res.status).toBe(200);
            expect(res.body.alreadyVerified).toBe(true);
            expect(mockedSendEmailVerificationEmail).not.toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=auth.test.js.map
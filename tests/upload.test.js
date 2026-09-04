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
describe('POST /api/uploads/signature', () => {
    it('requires auth', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/uploads/signature');
        expect(res.status).toBe(401);
    });
    it('returns a clear 500 when Cloudinary is not configured (the test-env default)', async () => {
        const token = await registerAndLogin();
        const res = await (0, supertest_1.default)(app).post('/api/uploads/signature').set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(500);
        expect(res.body.message).toMatch(/not configured/i);
    });
});
//# sourceMappingURL=upload.test.js.map
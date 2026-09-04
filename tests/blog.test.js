"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const supertest_1 = __importDefault(require("supertest"));
const app_1 = require("../src/app");
const testDb_1 = require("./helpers/testDb");
const User_1 = require("../src/models/User");
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
async function registerAgent(email = 'agent@example.com') {
    const res = await (0, supertest_1.default)(app)
        .post('/api/auth/register')
        .send({ email, password: 'supersecret123', name: 'Chinedu Okafor', role: 'agent' });
    return res.body.token;
}
async function registerAdmin(email = 'admin@example.com') {
    const res = await (0, supertest_1.default)(app)
        .post('/api/auth/register')
        .send({ email, password: 'supersecret123', name: 'Site Admin', role: 'agent' });
    await User_1.User.findOneAndUpdate({ email }, { role: 'admin' });
    const login = await (0, supertest_1.default)(app).post('/api/auth/login').send({ email, password: 'supersecret123' });
    void res;
    return login.body.token;
}
const validPost = {
    title: 'The 5 Most Expensive Estates in Nigeria',
    excerpt: 'A look at the priciest properties changing hands across Lagos and Abuja this year.',
    bodyMarkdown: '# Intro\n\nSome real content about expensive estates, at least twenty characters long.',
    tags: ['market-insights'],
};
describe('POST /api/blog-admin', () => {
    it('requires auth', async () => {
        const res = await (0, supertest_1.default)(app).post('/api/blog-admin').send(validPost);
        expect(res.status).toBe(401);
    });
    it('rejects a non-admin agent', async () => {
        const token = await registerAgent();
        const res = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        expect(res.status).toBe(403);
    });
    it('creates a draft post with an auto-generated slug', async () => {
        const token = await registerAdmin();
        const res = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        expect(res.status).toBe(201);
        expect(res.body.post.status).toBe('draft');
        expect(res.body.post.slug).toBe('the-5-most-expensive-estates-in-nigeria');
        expect(res.body.post.publishedAt).toBeFalsy();
    });
    it('sets publishedAt when created directly as published', async () => {
        const token = await registerAdmin();
        const res = await (0, supertest_1.default)(app)
            .post('/api/blog-admin')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validPost, status: 'published' });
        expect(res.body.post.status).toBe('published');
        expect(res.body.post.publishedAt).toBeTruthy();
    });
    it('suffixes the slug on a title collision', async () => {
        const token = await registerAdmin();
        await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        const res = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        expect(res.body.post.slug).toBe('the-5-most-expensive-estates-in-nigeria-2');
    });
});
describe('PATCH /api/blog-admin/:id', () => {
    it("does not change the slug when only the title is edited", async () => {
        const token = await registerAdmin();
        const created = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        const id = created.body.post._id;
        const originalSlug = created.body.post.slug;
        const res = await (0, supertest_1.default)(app)
            .patch(`/api/blog-admin/${id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ title: 'A Completely Different Title' });
        expect(res.body.post.slug).toBe(originalSlug);
        expect(res.body.post.title).toBe('A Completely Different Title');
    });
    it('sets publishedAt exactly once across a publish/unpublish/republish cycle', async () => {
        const token = await registerAdmin();
        const created = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        const id = created.body.post._id;
        const published = await (0, supertest_1.default)(app)
            .patch(`/api/blog-admin/${id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'published' });
        const firstPublishedAt = published.body.post.publishedAt;
        expect(firstPublishedAt).toBeTruthy();
        await (0, supertest_1.default)(app).patch(`/api/blog-admin/${id}`).set('Authorization', `Bearer ${token}`).send({ status: 'draft' });
        const republished = await (0, supertest_1.default)(app)
            .patch(`/api/blog-admin/${id}`)
            .set('Authorization', `Bearer ${token}`)
            .send({ status: 'published' });
        expect(republished.body.post.publishedAt).toBe(firstPublishedAt);
    });
});
describe('GET /api/blog-admin', () => {
    it('lists every status, requires admin', async () => {
        const adminToken = await registerAdmin();
        const agentToken = await registerAgent();
        await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${adminToken}`).send(validPost);
        await (0, supertest_1.default)(app)
            .post('/api/blog-admin')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ ...validPost, title: 'Another Post', status: 'published' });
        const forbidden = await (0, supertest_1.default)(app).get('/api/blog-admin').set('Authorization', `Bearer ${agentToken}`);
        expect(forbidden.status).toBe(403);
        const res = await (0, supertest_1.default)(app).get('/api/blog-admin').set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.posts).toHaveLength(2);
    });
});
describe('DELETE /api/blog-admin/:id', () => {
    it('deletes a post', async () => {
        const token = await registerAdmin();
        const created = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        const res = await (0, supertest_1.default)(app).delete(`/api/blog-admin/${created.body.post._id}`).set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(204);
        const list = await (0, supertest_1.default)(app).get('/api/blog-admin').set('Authorization', `Bearer ${token}`);
        expect(list.body.posts).toHaveLength(0);
    });
});
describe('GET /api/blog (public)', () => {
    it('only returns published posts, never drafts', async () => {
        const token = await registerAdmin();
        await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost); // draft
        await (0, supertest_1.default)(app)
            .post('/api/blog-admin')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validPost, title: 'Published Post', status: 'published' });
        const res = await (0, supertest_1.default)(app).get('/api/blog');
        expect(res.status).toBe(200);
        expect(res.body.total).toBe(1);
        expect(res.body.posts[0].title).toBe('Published Post');
    });
});
describe('GET /api/blog/:slug (public)', () => {
    it('404s for a draft post', async () => {
        const token = await registerAdmin();
        const created = await (0, supertest_1.default)(app).post('/api/blog-admin').set('Authorization', `Bearer ${token}`).send(validPost);
        const res = await (0, supertest_1.default)(app).get(`/api/blog/${created.body.post.slug}`);
        expect(res.status).toBe(404);
    });
    it('404s for a missing slug instead of 500ing', async () => {
        const res = await (0, supertest_1.default)(app).get('/api/blog/does-not-exist');
        expect(res.status).toBe(404);
    });
    it('200s and returns the full post for a published slug', async () => {
        const token = await registerAdmin();
        const created = await (0, supertest_1.default)(app)
            .post('/api/blog-admin')
            .set('Authorization', `Bearer ${token}`)
            .send({ ...validPost, status: 'published' });
        const res = await (0, supertest_1.default)(app).get(`/api/blog/${created.body.post.slug}`);
        expect(res.status).toBe(200);
        expect(res.body.post.bodyMarkdown).toBe(validPost.bodyMarkdown);
        expect(res.body.post.author).toBeUndefined();
    });
});
//# sourceMappingURL=blog.test.js.map
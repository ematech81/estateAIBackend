import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';
import { PasswordResetToken } from '../src/models/PasswordResetToken';
import { EmailVerificationToken } from '../src/models/EmailVerificationToken';
import * as emailService from '../src/services/email/email.service';

// Mocked so these tests never hit the real Brevo API (or depend on the
// real BREVO_API_KEY in a developer's .env, which tests/setup.ts blanks
// out anyway) — same idea as setAIProvider() for the Anthropic provider.
jest.mock('../src/services/email/email.service');
const mockedSendPasswordResetEmail = emailService.sendPasswordResetEmail as jest.MockedFunction<
  typeof emailService.sendPasswordResetEmail
>;
const mockedSendEmailVerificationEmail = emailService.sendEmailVerificationEmail as jest.MockedFunction<
  typeof emailService.sendEmailVerificationEmail
>;

function extractTokenFromUrl(url: string): string {
  return new URL(url).searchParams.get('token') as string;
}

const app = createApp();

beforeAll(async () => {
  await startTestDB();
});

afterAll(async () => {
  await stopTestDB();
});

afterEach(async () => {
  await clearTestDB();
  mockedSendPasswordResetEmail.mockClear();
  mockedSendEmailVerificationEmail.mockClear();
});

const validAgent = {
  email: 'agent@example.com',
  password: 'supersecret123',
  name: 'Chinedu Okafor',
  role: 'agent' as const,
  phone: '+2348012345678',
};

describe('POST /api/auth/register', () => {
  it('registers a new agent and returns a token + public user (no password hash)', async () => {
    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(validAgent.email);
    expect(res.body.user.role).toBe('agent');
    expect(res.body.user).not.toHaveProperty('hashedPassword');
  });

  it('rejects a duplicate email', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(409);
  });

  it('rejects an invalid role (admin is not self-registrable)', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validAgent, role: 'admin' });

    expect(res.status).toBe(400);
  });

  it('rejects a short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...validAgent, password: '123' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/auth/login', () => {
  it('logs in with correct credentials', async () => {
    await request(app).post('/api/auth/register').send(validAgent);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validAgent.email, password: validAgent.password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });

  it('rejects a wrong password', async () => {
    await request(app).post('/api/auth/register').send(validAgent);

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: validAgent.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown email', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever123' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/forgot-password', () => {
  it('sends a reset email for a registered account', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    mockedSendPasswordResetEmail.mockResolvedValueOnce(undefined);

    const res = await request(app).post('/api/auth/forgot-password').send({ email: validAgent.email });

    expect(res.status).toBe(200);
    expect(mockedSendPasswordResetEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendPasswordResetEmail.mock.calls[0][0]).toBe(validAgent.email);
  });

  it('returns the exact same response for an unregistered email — no account enumeration', async () => {
    const res = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.message).toMatch(/if an account exists/i);
    expect(mockedSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('still responds 200 even if the email provider throws — never leaks that to the client', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    mockedSendPasswordResetEmail.mockRejectedValueOnce(new Error('Brevo is down'));

    const res = await request(app).post('/api/auth/forgot-password').send({ email: validAgent.email });

    expect(res.status).toBe(200);
  });

  it('keeps only one live token per account — a new request replaces the earlier unused one', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    mockedSendPasswordResetEmail.mockResolvedValue(undefined);

    await request(app).post('/api/auth/forgot-password').send({ email: validAgent.email });
    await request(app).post('/api/auth/forgot-password').send({ email: validAgent.email });

    expect(await PasswordResetToken.countDocuments({})).toBe(1);
  });
});

describe('POST /api/auth/reset-password', () => {
  async function requestResetAndGetToken(email: string): Promise<string> {
    mockedSendPasswordResetEmail.mockResolvedValueOnce(undefined);
    await request(app).post('/api/auth/forgot-password').send({ email });
    const resetUrl = mockedSendPasswordResetEmail.mock.calls[0][2];
    return extractTokenFromUrl(resetUrl);
  }

  it('resets the password with a valid token — new password works, old one no longer does', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    const token = await requestResetAndGetToken(validAgent.email);

    const resetRes = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brandnewpassword456' });
    expect(resetRes.status).toBe(200);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: validAgent.email, password: validAgent.password });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ email: validAgent.email, password: 'brandnewpassword456' });
    expect(newLogin.status).toBe(200);
  });

  it('rejects an invalid/garbage token', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'brandnewpassword456' });

    expect(res.status).toBe(400);
  });

  it('rejects reusing an already-redeemed token (single-use)', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    const token = await requestResetAndGetToken(validAgent.email);

    await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'firstnewpassword456' });
    const secondAttempt = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'secondnewpassword456' });

    expect(secondAttempt.status).toBe(400);
  });

  it('rejects an expired token', async () => {
    await request(app).post('/api/auth/register').send(validAgent);
    const token = await requestResetAndGetToken(validAgent.email);

    // The service checks expiresAt explicitly rather than relying on
    // MongoDB's background TTL sweep, so forcing this directly is a valid
    // way to simulate "expired" without waiting on that sweep.
    await PasswordResetToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token, newPassword: 'brandnewpassword456' });

    expect(res.status).toBe(400);
  });

  it('rejects a new password shorter than 8 characters', async () => {
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'whatever-token', newPassword: 'short' });

    expect(res.status).toBe(400);
  });
});

describe('email verification', () => {
  async function registerAndGetVerificationToken(email = validAgent.email): Promise<string> {
    mockedSendEmailVerificationEmail.mockResolvedValueOnce(undefined);
    await request(app).post('/api/auth/register').send({ ...validAgent, email });
    const verifyUrl = mockedSendEmailVerificationEmail.mock.calls[0][2];
    return extractTokenFromUrl(verifyUrl);
  }

  it('sends a verification email on registration, and the new account starts unverified', async () => {
    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(false);
    expect(mockedSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendEmailVerificationEmail.mock.calls[0][0]).toBe(validAgent.email);
  });

  it('registration still succeeds even if the verification email fails to send', async () => {
    mockedSendEmailVerificationEmail.mockRejectedValueOnce(new Error('Brevo is down'));

    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(201);
  });

  describe('POST /api/auth/verify-email', () => {
    it('marks the account verified with a valid token', async () => {
      const token = await registerAndGetVerificationToken();

      const res = await request(app).post('/api/auth/verify-email').send({ token });
      expect(res.status).toBe(200);

      const me = await request(app)
        .post('/api/auth/login')
        .send({ email: validAgent.email, password: validAgent.password });
      const profile = await request(app).get('/api/users/me').set('Authorization', `Bearer ${me.body.token}`);
      expect(profile.body.user.emailVerified).toBe(true);
    });

    it('rejects an invalid/garbage token', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({ token: 'not-a-real-token' });
      expect(res.status).toBe(400);
    });

    it('rejects reusing an already-redeemed token', async () => {
      const token = await registerAndGetVerificationToken();

      await request(app).post('/api/auth/verify-email').send({ token });
      const secondAttempt = await request(app).post('/api/auth/verify-email').send({ token });

      expect(secondAttempt.status).toBe(400);
    });

    it('rejects an expired token', async () => {
      const token = await registerAndGetVerificationToken();
      await EmailVerificationToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });

      const res = await request(app).post('/api/auth/verify-email').send({ token });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('requires auth', async () => {
      const res = await request(app).post('/api/auth/resend-verification');
      expect(res.status).toBe(401);
    });

    it('resends to the signed-in user\'s own email for an unverified account', async () => {
      mockedSendEmailVerificationEmail.mockResolvedValue(undefined);
      const registerRes = await request(app).post('/api/auth/register').send(validAgent);
      mockedSendEmailVerificationEmail.mockClear(); // ignore the registration-time send

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', `Bearer ${registerRes.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.alreadyVerified).toBe(false);
      expect(mockedSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mockedSendEmailVerificationEmail.mock.calls[0][0]).toBe(validAgent.email);
    });

    it('is a no-op that reports alreadyVerified for an already-verified account', async () => {
      const token = await registerAndGetVerificationToken();
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: validAgent.email, password: validAgent.password });
      await request(app).post('/api/auth/verify-email').send({ token });
      mockedSendEmailVerificationEmail.mockClear();

      const res = await request(app)
        .post('/api/auth/resend-verification')
        .set('Authorization', `Bearer ${loginRes.body.token}`);

      expect(res.status).toBe(200);
      expect(res.body.alreadyVerified).toBe(true);
      expect(mockedSendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });
});

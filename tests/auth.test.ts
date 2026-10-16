import request from 'supertest';
import { createApp } from '../src/app';
import { startTestDB, stopTestDB, clearTestDB } from './helpers/testDb';
import { PasswordResetToken } from '../src/models/PasswordResetToken';
import { EmailVerificationOtp } from '../src/models/EmailVerificationOtp';
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

describe('email verification (OTP)', () => {
  const authed = (token: string) => ({ Authorization: `Bearer ${token}` });

  // Registers an agent and returns their JWT plus the code "emailed" to them
  // (captured from the mocked email service).
  async function registerAndGetCode(email = validAgent.email) {
    const res = await request(app).post('/api/auth/register').send({ ...validAgent, email });
    const code = mockedSendEmailVerificationEmail.mock.calls[0][2];
    return { token: res.body.token as string, code };
  }
  const verify = (token: string, code: string) =>
    request(app).post('/api/auth/verify-email').set(authed(token)).send({ code });
  const isVerified = async (token: string) =>
    (await request(app).get('/api/users/me').set(authed(token))).body.user.emailVerified as boolean;

  it('emails an alphanumeric code on registration, and the new account starts unverified', async () => {
    const res = await request(app).post('/api/auth/register').send(validAgent);

    expect(res.status).toBe(201);
    expect(res.body.user.emailVerified).toBe(false);
    expect(mockedSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
    expect(mockedSendEmailVerificationEmail.mock.calls[0][0]).toBe(validAgent.email);
    const code = mockedSendEmailVerificationEmail.mock.calls[0][2];
    expect(code).toMatch(/^[A-Z2-9]{6}$/);
  });

  it('generates codes that always contain both letters and digits', async () => {
    for (let i = 0; i < 25; i++) {
      mockedSendEmailVerificationEmail.mockClear();
      await request(app).post('/api/auth/register').send({ ...validAgent, email: `agent${i}@example.com` });
      const code = mockedSendEmailVerificationEmail.mock.calls[0][2];
      expect(code).toMatch(/^(?=.*[A-Z])(?=.*[2-9])[A-Z2-9]{6}$/);
    }
  });

  it('registration still succeeds even if the verification email fails to send', async () => {
    mockedSendEmailVerificationEmail.mockRejectedValueOnce(new Error('Brevo is down'));
    const res = await request(app).post('/api/auth/register').send(validAgent);
    expect(res.status).toBe(201);
  });

  describe('POST /api/auth/verify-email', () => {
    it('requires auth', async () => {
      const res = await request(app).post('/api/auth/verify-email').send({ code: 'ABC234' });
      expect(res.status).toBe(401);
    });

    it('marks the account verified with the right code', async () => {
      const { token, code } = await registerAndGetCode();
      const res = await verify(token, code);
      expect(res.status).toBe(200);
      expect(await isVerified(token)).toBe(true);
    });

    it('accepts the code in lowercase and with spaces or dashes', async () => {
      const { token, code } = await registerAndGetCode();
      const res = await verify(token, `${code.slice(0, 3)} - ${code.slice(3)}`.toLowerCase());
      expect(res.status).toBe(200);
      expect(await isVerified(token)).toBe(true);
    });

    it('rejects a wrong code, says how many attempts are left, and stays unverified', async () => {
      const { token } = await registerAndGetCode();
      const res = await verify(token, 'ZZZZZ9');
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/4 attempts left/);
      expect(await isVerified(token)).toBe(false);
    });

    it('locks the code after 5 wrong attempts, even if the right code is then entered', async () => {
      const { token, code } = await registerAndGetCode();
      for (let i = 0; i < 4; i++) {
        expect((await verify(token, 'ZZZZZ9')).status).toBe(400);
      }
      expect((await verify(token, 'ZZZZZ9')).status).toBe(429);

      const afterLock = await verify(token, code);
      expect(afterLock.status).toBe(400);
      expect(await isVerified(token)).toBe(false);
    });

    it('rejects an expired code', async () => {
      const { token, code } = await registerAndGetCode();
      await EmailVerificationOtp.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
      expect((await verify(token, code)).status).toBe(400);
      expect(await isVerified(token)).toBe(false);
    });

    it('does not store the code in plain text', async () => {
      const { code } = await registerAndGetCode();
      const record = await EmailVerificationOtp.findOne({});
      expect(record?.codeHash).toBeDefined();
      expect(record?.codeHash).not.toContain(code);
    });

    it('cannot verify one account with another account code', async () => {
      const a = await registerAndGetCode('a@example.com');
      mockedSendEmailVerificationEmail.mockClear();
      const b = await registerAndGetCode('b@example.com');

      expect((await verify(b.token, a.code)).status).toBe(400);
      expect(await isVerified(b.token)).toBe(false);
    });

    it('rejects a missing code', async () => {
      const { token } = await registerAndGetCode();
      const res = await request(app).post('/api/auth/verify-email').set(authed(token)).send({});
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/resend-verification', () => {
    it('requires auth', async () => {
      expect((await request(app).post('/api/auth/resend-verification')).status).toBe(401);
    });

    it('enforces a cooldown right after the first code was sent', async () => {
      const { token } = await registerAndGetCode();
      mockedSendEmailVerificationEmail.mockClear();

      const res = await request(app).post('/api/auth/resend-verification').set(authed(token));
      expect(res.status).toBe(429);
      expect(res.body.message).toMatch(/wait/i);
      expect(mockedSendEmailVerificationEmail).not.toHaveBeenCalled();
    });

    it('sends a fresh code after the cooldown, which replaces the old one', async () => {
      const { token } = await registerAndGetCode();
      mockedSendEmailVerificationEmail.mockClear();
      await EmailVerificationOtp.updateMany({}, { lastSentAt: new Date(Date.now() - 61_000) });

      const res = await request(app).post('/api/auth/resend-verification').set(authed(token));
      expect(res.status).toBe(200);
      expect(res.body.alreadyVerified).toBe(false);
      expect(mockedSendEmailVerificationEmail).toHaveBeenCalledTimes(1);
      expect(mockedSendEmailVerificationEmail.mock.calls[0][0]).toBe(validAgent.email);
      const newCode = mockedSendEmailVerificationEmail.mock.calls[0][2];

      expect((await verify(token, newCode)).status).toBe(200);
      expect(await isVerified(token)).toBe(true);
    });

    it('is a no-op that reports alreadyVerified for an already-verified account', async () => {
      const { token, code } = await registerAndGetCode();
      await verify(token, code);
      mockedSendEmailVerificationEmail.mockClear();

      const res = await request(app).post('/api/auth/resend-verification').set(authed(token));
      expect(res.status).toBe(200);
      expect(res.body.alreadyVerified).toBe(true);
      expect(mockedSendEmailVerificationEmail).not.toHaveBeenCalled();
    });
  });
});

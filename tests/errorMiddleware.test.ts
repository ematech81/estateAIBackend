import { Response } from 'express';
import { ZodError, z } from 'zod';
import { errorHandler } from '../src/middleware/error.middleware';
import { ApiError } from '../src/utils/ApiError';

// Regression test for a real leak: an unhandled error's raw message (e.g.
// a MongoServerSelectionError's hostname/driver internals) used to be sent
// straight to the client whenever NODE_ENV wasn't 'production' — which is
// exactly the mode local dev (and this test suite) runs in. A user's flaky
// wifi turned into that raw Mongo error being displayed on the login page.
function mockResponse(): Response {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('errorHandler', () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('never leaks a raw unhandled error message to the client, in any environment', () => {
    const res = mockResponse();
    const rawError = new Error(
      'MongoServerSelectionError: getaddrinfo ENOTFOUND ac-hzvhnqk-shard-00-00.66inunu.mongodb.net',
    );

    errorHandler(rawError, {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.message).not.toMatch(/mongo|getaddrinfo|enotfound/i);
    expect(body.message).toBe('Something went wrong on our end. Please try again in a moment.');
    // The raw error is still available server-side, just never in the response.
    expect(consoleErrorSpy).toHaveBeenCalledWith('Unhandled error:', rawError);
  });

  it('still surfaces an ApiError\'s own message — those are curated to be safe to show', () => {
    const res = mockResponse();
    errorHandler(ApiError.badRequest('City is required'), {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].message).toBe('City is required');
  });

  it('still surfaces Zod validation details', () => {
    const res = mockResponse();
    const result = z.object({ email: z.string().email() }).safeParse({ email: 'not-an-email' });
    expect(result.success).toBe(false);

    errorHandler((result as { error: ZodError }).error, {} as never, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(400);
    expect((res.json as jest.Mock).mock.calls[0][0].error).toBe('ValidationError');
  });
});

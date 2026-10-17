import { OpenAIProvider } from '../src/services/ai/OpenAIProvider';

// fetch is faked — these tests must never call the real OpenAI API (or
// spend credit), regardless of what is in a developer's .env.
const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  fetchMock.mockReset();
  global.fetch = fetchMock as unknown as typeof fetch;
  jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  jest.restoreAllMocks();
});

afterAll(() => {
  global.fetch = originalFetch;
});

const draft = {
  title: 'Newly built 3 bedroom duplex',
  description: 'Newly built 3 bedroom duplex at Lekki Phase 1, 8 million per year.',
  listingType: 'rent',
  propertyType: 'duplex',
  price: { amount: 8_000_000, currency: 'NGN', period: 'yearly' },
  location: { country: 'Nigeria', state: 'Lagos', city: 'Lagos', district: 'Lekki Phase 1', address: null },
  specifications: { bedrooms: 3, bathrooms: null, sizeSqm: null, amenities: ['BQ'] },
};

function respondWith(content: string | null, init: { ok?: boolean; status?: number } = {}) {
  const ok = init.ok ?? true;
  fetchMock.mockResolvedValue({
    ok,
    status: init.status ?? (ok ? 200 : 500),
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => JSON.stringify({ error: { message: 'insufficient_quota' } }),
  });
}

describe('OpenAIProvider', () => {
  it('refuses to construct without an API key, with a safe message', () => {
    expect(() => new OpenAIProvider('')).toThrow(/not configured/i);
  });

  it('sends the key, model, JSON mode and the agent text, and returns the validated draft', async () => {
    respondWith(JSON.stringify(draft));
    const provider = new OpenAIProvider('sk-test', 'gpt-test');

    const result = await provider.extractListingDraft('3 bed duplex lekki 8m/yr');

    expect(result).toEqual(draft);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(options.headers.Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(options.body);
    expect(body.model).toBe('gpt-test');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1]).toEqual({ role: 'user', content: '3 bed duplex lekki 8m/yr' });
  });

  it('rejects output that does not match the draft schema, even if it is valid JSON', async () => {
    respondWith(JSON.stringify({ ...draft, listingType: 'castle' }));
    await expect(new OpenAIProvider('sk-test').extractListingDraft('x'.repeat(20))).rejects.toThrow();
  });

  it('rejects non-JSON output and empty output', async () => {
    respondWith('Sure! Here is your listing…');
    await expect(new OpenAIProvider('sk-test').extractListingDraft('x'.repeat(20))).rejects.toThrow(/invalid JSON/);

    respondWith(null);
    await expect(new OpenAIProvider('sk-test').extractListingDraft('x'.repeat(20))).rejects.toThrow(/no text/);
  });

  it('turns an OpenAI failure (e.g. no credit) into a safe 502 without leaking the details', async () => {
    respondWith(null, { ok: false, status: 429 });
    const error = await new OpenAIProvider('sk-test').extractListingDraft('x'.repeat(20)).catch((e) => e);

    expect(error.statusCode).toBe(502);
    expect(error.message).toMatch(/temporarily unavailable/i);
    expect(error.message).not.toMatch(/quota/i);
    // …but the detail is logged for the server owner.
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('429'));
  });

  it('turns a network failure into the same safe 502', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'));
    const error = await new OpenAIProvider('sk-test').extractListingDraft('x'.repeat(20)).catch((e) => e);
    expect(error.statusCode).toBe(502);
  });
});

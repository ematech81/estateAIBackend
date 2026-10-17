import { parseOrigins } from '../src/config/origins';

describe('parseOrigins', () => {
  it('returns a single address as a one-item list', () => {
    expect(parseOrigins('https://www.estateai.com.ng')).toEqual(['https://www.estateai.com.ng']);
  });

  it('splits a comma-separated list and keeps the order (first = main site)', () => {
    expect(
      parseOrigins('https://www.estateai.com.ng,https://estateai.com.ng,https://estate-ai-web-beta.vercel.app'),
    ).toEqual(['https://www.estateai.com.ng', 'https://estateai.com.ng', 'https://estate-ai-web-beta.vercel.app']);
  });

  it('trims spaces and strips trailing slashes, which would otherwise break exact CORS matching', () => {
    expect(parseOrigins(' https://www.estateai.com.ng/ , https://estateai.com.ng// ')).toEqual([
      'https://www.estateai.com.ng',
      'https://estateai.com.ng',
    ]);
  });

  it('merges several variables and ignores blanks and undefined', () => {
    expect(parseOrigins('https://www.estateai.com.ng', undefined, '', 'https://estateai-admin.vercel.app,')).toEqual([
      'https://www.estateai.com.ng',
      'https://estateai-admin.vercel.app',
    ]);
  });
});

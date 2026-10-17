// WEB_ORIGIN / ADMIN_ORIGIN may each hold one address or a comma-separated
// list (e.g. the main site plus a fallback). This normalises them into a
// clean list: split on commas, trim spaces, drop a trailing slash (browsers
// send origins without one, and CORS matching is exact), skip blanks.
export function parseOrigins(...values: (string | undefined)[]): string[] {
  return values
    .flatMap((value) => (value ?? '').split(','))
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Cloudflare Worker-compatible nanoid. Uses crypto.getRandomValues.
 * prefix is prepended to the ID. Default length 21.
 */
export function nanoid(prefix = '', length = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  const id = Array.from(bytes)
    .map((b) => CHARS[b % CHARS.length])
    .join('');
  return prefix ? `${prefix}_${id}` : id;
}

/** Alias for nanoid — allows repos to migrate without breaking during transition. */
export const genId = nanoid;

import { describe, it, expect, beforeEach } from 'vitest';
import { checkRateLimit, type RateLimitOptions } from './rate-limit.js';

function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  return {
    async get(key: string): Promise<string | null> {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
      const expiresAt = options?.expirationTtl
        ? Date.now() + options.expirationTtl * 1000
        : undefined;
      store.set(key, { value, expiresAt });
    },
    async delete(key: string): Promise<void> {
      store.delete(key);
    },
    async list(): Promise<any> {
      return { keys: [] };
    },
    async getWithMetadata(): Promise<any> {
      return { value: null, metadata: null };
    },
  } as unknown as KVNamespace;
}

describe('checkRateLimit()', () => {
  let kv: KVNamespace;

  beforeEach(() => {
    kv = createMockKV();
  });

  it('allows requests under the limit', async () => {
    const opts: RateLimitOptions = { kv, key: 'user:1', maxRequests: 5, windowSeconds: 60 };

    const result = await checkRateLimit(opts);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks requests once the limit is reached', async () => {
    const opts: RateLimitOptions = { kv, key: 'user:2', maxRequests: 3, windowSeconds: 60 };

    await checkRateLimit(opts);
    await checkRateLimit(opts);
    await checkRateLimit(opts);

    const blocked = await checkRateLimit(opts);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('counts remaining correctly as requests accumulate', async () => {
    const opts: RateLimitOptions = { kv, key: 'user:3', maxRequests: 5, windowSeconds: 60 };

    const r1 = await checkRateLimit(opts);
    expect(r1.remaining).toBe(4);

    const r2 = await checkRateLimit(opts);
    expect(r2.remaining).toBe(3);

    const r3 = await checkRateLimit(opts);
    expect(r3.remaining).toBe(2);
  });

  it('allows exactly maxRequests requests before blocking', async () => {
    const opts: RateLimitOptions = { kv, key: 'user:4', maxRequests: 2, windowSeconds: 60 };

    const r1 = await checkRateLimit(opts);
    expect(r1.allowed).toBe(true);

    const r2 = await checkRateLimit(opts);
    expect(r2.allowed).toBe(true);

    const r3 = await checkRateLimit(opts);
    expect(r3.allowed).toBe(false);
  });

  it('provides resetAt as epoch milliseconds in the future', async () => {
    const opts: RateLimitOptions = { kv, key: 'user:5', maxRequests: 5, windowSeconds: 60 };

    const before = Date.now();
    const result = await checkRateLimit(opts);

    expect(result.resetAt).toBeGreaterThan(before);
    expect(result.resetAt).toBeGreaterThan(Date.now() - 1000);
    expect(result.resetAt % 1000).toBe(0);
  });
});

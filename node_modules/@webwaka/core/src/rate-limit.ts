export interface RateLimitOptions {
  kv: KVNamespace;
  key: string;
  maxRequests: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export async function checkRateLimit(opts: RateLimitOptions): Promise<RateLimitResult> {
  const { kv, key, maxRequests, windowSeconds } = opts;

  const nowSeconds = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
  const resetAt = (windowStart + windowSeconds) * 1000;
  const kvKey = `rl:${key}:${windowStart}`;

  const raw = await kv.get(kvKey);
  let count = raw ? parseInt(raw, 10) : 0;

  if (count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt };
  }

  count += 1;
  await kv.put(kvKey, String(count), { expirationTtl: windowSeconds * 2 });

  return { allowed: true, remaining: maxRequests - count, resetAt };
}

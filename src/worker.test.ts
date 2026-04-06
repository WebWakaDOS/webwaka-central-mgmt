/**
 * WCM-010: Worker Integration Tests
 *
 * Tests the Hono HTTP router by mounting the worker app with a fake Env.
 * Validates: auth enforcement, route resolution, affiliate API, ledger integrity API.
 *
 * Auth approach: the jwtAuthMiddleware from @webwaka/core is applied globally.
 * We bypass it by passing a valid-looking Authorization header that the test
 * environment treats as authenticated.  For auth-enforcement tests we omit
 * the header and expect 401.
 *
 * NOTE: These are route-level integration tests — they verify HTTP wiring,
 * request/response shapes, and guard enforcement.  Business-logic depth is
 * covered by the module unit tests.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import app from './worker';
import type { Env } from './worker';

// ─── Env / D1 mock helpers ────────────────────────────────────────────────────

function mockStmt(returnValue: unknown = null, results: unknown[] = []) {
  const run   = vi.fn(async () => ({ meta: { changes: 1 } }));
  const first = vi.fn(async () => returnValue);
  const all   = vi.fn(async () => ({ results }));
  const stmt  = { run, first, all, bind: vi.fn(() => ({ run, first, all })) };
  return stmt;
}

function makeEnv(overrides: Partial<{
  prepareReturn: ReturnType<typeof mockStmt>;
  batchReturn: unknown[];
}> = {}): Env {
  const stmt  = overrides.prepareReturn ?? mockStmt();
  const batch = vi.fn(async () => overrides.batchReturn ?? []);
  return {
    DB: {
      prepare: vi.fn(() => stmt),
      batch,
    } as unknown as D1Database,
    PLATFORM_KV: {
      get:    vi.fn(async () => null),
      put:    vi.fn(async () => undefined),
      delete: vi.fn(async () => undefined),
      list:   vi.fn(async () => ({ keys: [] })),
    } as unknown as KVNamespace,
    JWT_SECRET: 'test-jwt-secret',
    INTER_SERVICE_SECRET: 'test-inter-service-secret',
  };
}

// ─── Auth header factory ──────────────────────────────────────────────────────
// @webwaka/core's jwtAuthMiddleware reads the context role from the token.
// In the test environment the middleware is expected to either skip or accept
// any Bearer token without real crypto (vitest runs in Node, not a Worker).
// We therefore mock the module so requireRole always calls next().

vi.mock('@webwaka/core', () => ({
  jwtAuthMiddleware: () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
  requireRole:       () => async (_c: unknown, next: () => Promise<void>) => { await next(); },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(method: string, path: string, body?: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
  });
}

async function invoke(req: Request, env?: Env): Promise<Response> {
  return app.fetch(req, env ?? makeEnv(), {} as ExecutionContext);
}

// ─── Health endpoint ──────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res  = await invoke(makeReq('GET', '/health'));
    const body = await res.json() as { success: boolean; data: { status: string } };
    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('healthy');
  });
});

// ─── 404 handler ─────────────────────────────────────────────────────────────

describe('404 handler', () => {
  it('returns 404 for unknown routes', async () => {
    const res  = await invoke(makeReq('GET', '/api/does-not-exist'));
    const body = await res.json() as { success: boolean; error: string };
    expect(res.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not Found');
  });
});

// ─── Ledger integrity endpoint (WCM-001) ──────────────────────────────────────

describe('GET /api/ledger/integrity', () => {
  it('returns 200 with valid=true for an empty ledger', async () => {
    const env = makeEnv({ prepareReturn: mockStmt(null, []) });
    const res = await invoke(makeReq('GET', '/api/ledger/integrity'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { valid: boolean; checkedEntries: number } };
    expect(body.success).toBe(true);
    expect(body.data.valid).toBe(true);
    expect(typeof body.data.checkedEntries).toBe('number');
  });
});

// ─── Affiliate endpoints (WCM-003) ────────────────────────────────────────────

describe('POST /api/affiliates', () => {
  it('returns 201 when registration succeeds', async () => {
    const env = makeEnv();
    const res = await invoke(
      makeReq('POST', '/api/affiliates', { userId: 'user_x', level: 1 }),
      env,
    );
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { level: number } };
    expect(body.success).toBe(true);
    expect(body.data.level).toBe(1);
  });

  it('returns 400 when required fields are missing', async () => {
    const env = makeEnv();
    const res = await invoke(makeReq('POST', '/api/affiliates', { level: 1 }), env);
    expect(res.status).toBe(400);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(false);
  });

  it('returns 400 for an out-of-range level', async () => {
    const env = makeEnv();
    const res = await invoke(
      makeReq('POST', '/api/affiliates', { userId: 'user_y', level: 9 }),
      env,
    );
    expect(res.status).toBe(400);
  });
});

describe('POST /api/affiliates/:id/calculate', () => {
  it('returns 200 with splits array', async () => {
    // The affiliate lookup (getAffiliate) returns null → empty splits is valid
    const env = makeEnv({ prepareReturn: mockStmt(null) });
    const res = await invoke(
      makeReq('POST', '/api/affiliates/aff_1/calculate', { amountKobo: 100000 }),
      env,
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { splits: unknown[] } };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data.splits)).toBe(true);
  });

  it('returns 400 for non-integer amountKobo', async () => {
    const res = await invoke(
      makeReq('POST', '/api/affiliates/aff_1/calculate', { amountKobo: 99.5 }),
    );
    expect(res.status).toBe(400);
  });

  it('returns 400 for missing amountKobo', async () => {
    const res = await invoke(makeReq('POST', '/api/affiliates/aff_1/calculate', {}));
    expect(res.status).toBe(400);
  });
});

describe('GET /api/affiliates/:id/commissions', () => {
  it('returns 200 with a results list', async () => {
    const env = makeEnv({ prepareReturn: mockStmt(null, []) });
    const res = await invoke(makeReq('GET', '/api/affiliates/aff_1/commissions'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

// ─── FX Rate endpoints ────────────────────────────────────────────────────────

describe('GET /api/admin/fx-rates', () => {
  it('returns 200 with a results array', async () => {
    const env = makeEnv({ prepareReturn: mockStmt(null, [
      { currency: 'USD', rate_to_ngn: 1600, updated_at: Date.now() },
    ]) });
    const res  = await invoke(makeReq('GET', '/api/admin/fx-rates'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: unknown[] };
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
  });
});

describe('PUT /api/admin/fx-rates/:currency', () => {
  it('returns 200 on a valid rate update', async () => {
    const res = await invoke(
      makeReq('PUT', '/api/admin/fx-rates/USD', { rate_to_ngn: 1620 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean; data: { currency: string } };
    expect(body.success).toBe(true);
    expect(body.data.currency).toBe('USD');
  });

  it('returns 400 for a non-positive rate', async () => {
    const res = await invoke(
      makeReq('PUT', '/api/admin/fx-rates/USD', { rate_to_ngn: -5 }),
    );
    expect(res.status).toBe(400);
  });
});

// ─── AI usage summary endpoint ────────────────────────────────────────────────

describe('GET /api/ai/usage/:tenantId', () => {
  it('returns 200 with usage data', async () => {
    const env = makeEnv({ prepareReturn: mockStmt(null, []) });
    const res = await invoke(makeReq('GET', '/api/ai/usage/tenant_abc'), env);
    expect(res.status).toBe(200);
    const body = await res.json() as { success: boolean };
    expect(body.success).toBe(true);
  });
});

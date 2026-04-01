/**
 * @webwaka/core — Auth Module Tests
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards)
 *
 * Tests cover:
 *  - signJWT / verifyJWT round-trip
 *  - Token expiry rejection
 *  - Tampered token rejection
 *  - jwtAuthMiddleware: public routes, missing header, invalid token, valid token
 *  - requireRole: correct role, wrong role, missing user
 *  - requirePermissions: SUPER_ADMIN bypass, missing permission, granted permission
 *  - getTenantId / getAuthUser: present and missing
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  signJWT,
  verifyJWT,
  jwtAuthMiddleware,
  requireRole,
  requirePermissions,
  getTenantId,
  getAuthUser,
  type JWTPayload,
  type AuthUser,
} from './index';

// ─── Test Helpers ─────────────────────────────────────────────────────────────

const TEST_SECRET = 'test-secret-key-for-unit-tests-only-32chars!!';

const TEST_PAYLOAD: Omit<JWTPayload, 'iat' | 'exp'> = {
  sub: 'user_001',
  email: 'test@webwaka.com',
  tenantId: 'tenant_abc',
  role: 'TENANT_ADMIN',
  permissions: ['read:products', 'write:products'],
};

function makeMockContext(overrides: {
  authHeader?: string | null;
  path?: string;
  method?: string;
  contextValues?: Record<string, unknown>;
  env?: Record<string, unknown>;
}) {
  const contextValues: Record<string, unknown> = { ...(overrides.contextValues ?? {}) };
  return {
    req: {
      method: overrides.method ?? 'GET',
      path: overrides.path ?? '/api/test',
      header: (name: string) => {
        if (name === 'Authorization') return overrides.authHeader ?? undefined;
        return undefined;
      },
    },
    env: overrides.env ?? { JWT_SECRET: TEST_SECRET, ENVIRONMENT: 'test' },
    json: (body: unknown, status?: number) => ({ body, status: status ?? 200 }),
    header: vi.fn(),
    get: (key: string) => contextValues[key],
    set: (key: string, value: unknown) => { contextValues[key] = value; },
  };
}

const mockNext = vi.fn(async () => {});

// ─── signJWT / verifyJWT ──────────────────────────────────────────────────────

describe('signJWT / verifyJWT', () => {
  it('signs and verifies a token round-trip', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET);
    expect(token.split('.')).toHaveLength(3);

    const decoded = await verifyJWT(token, TEST_SECRET);
    expect(decoded).not.toBeNull();
    expect(decoded!.sub).toBe('user_001');
    expect(decoded!.tenantId).toBe('tenant_abc');
    expect(decoded!.role).toBe('TENANT_ADMIN');
    expect(decoded!.email).toBe('test@webwaka.com');
    expect(decoded!.permissions).toEqual(['read:products', 'write:products']);
  });

  it('rejects a token signed with a different secret', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET);
    const decoded = await verifyJWT(token, 'wrong-secret');
    expect(decoded).toBeNull();
  });

  it('rejects an expired token', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET, -1); // expired 1 second ago
    const decoded = await verifyJWT(token, TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('rejects a tampered payload', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET);
    const parts = token.split('.');
    // Tamper with the payload
    const tamperedPayload = btoa(JSON.stringify({ ...TEST_PAYLOAD, role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 }))
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const decoded = await verifyJWT(tamperedToken, TEST_SECRET);
    expect(decoded).toBeNull();
  });

  it('rejects a malformed token', async () => {
    expect(await verifyJWT('not-a-jwt', TEST_SECRET)).toBeNull();
    expect(await verifyJWT('a.b', TEST_SECRET)).toBeNull();
    expect(await verifyJWT('', TEST_SECRET)).toBeNull();
  });
});

// ─── jwtAuthMiddleware ────────────────────────────────────────────────────────

describe('jwtAuthMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows public routes without a token', async () => {
    const middleware = jwtAuthMiddleware({ publicRoutes: [{ path: '/health' }] });
    const ctx = makeMockContext({ path: '/health', authHeader: null });
    await middleware(ctx as any, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('rejects requests with no Authorization header', async () => {
    const middleware = jwtAuthMiddleware();
    const ctx = makeMockContext({ authHeader: null });
    const result = await middleware(ctx as any, mockNext) as any;
    expect(result.status).toBe(401);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('rejects requests with malformed Authorization header', async () => {
    const middleware = jwtAuthMiddleware();
    const ctx = makeMockContext({ authHeader: 'Token abc123' });
    const result = await middleware(ctx as any, mockNext) as any;
    expect(result.status).toBe(401);
  });

  it('rejects requests with an invalid JWT', async () => {
    const middleware = jwtAuthMiddleware();
    const ctx = makeMockContext({ authHeader: 'Bearer invalid.token.here' });
    const result = await middleware(ctx as any, mockNext) as any;
    expect(result.status).toBe(401);
  });

  it('accepts a valid JWT and injects user and tenantId into context', async () => {
    const token = await signJWT(TEST_PAYLOAD, TEST_SECRET);
    const middleware = jwtAuthMiddleware();
    const contextValues: Record<string, unknown> = {};
    const ctx = {
      req: {
        method: 'GET',
        path: '/api/products',
        header: (name: string) => name === 'Authorization' ? `Bearer ${token}` : undefined,
      },
      env: { JWT_SECRET: TEST_SECRET, ENVIRONMENT: 'test' },
      json: vi.fn(),
      header: vi.fn(),
      get: (key: string) => contextValues[key],
      set: (key: string, value: unknown) => { contextValues[key] = value; },
    };

    await middleware(ctx as any, mockNext);
    expect(mockNext).toHaveBeenCalled();
    expect(contextValues['user']).toMatchObject({
      userId: 'user_001',
      tenantId: 'tenant_abc',
      role: 'TENANT_ADMIN',
    });
    expect(contextValues['tenantId']).toBe('tenant_abc');
  });
});

// ─── requireRole ─────────────────────────────────────────────────────────────

describe('requireRole', () => {
  beforeEach(() => vi.clearAllMocks());

  const makeCtxWithUser = (role: string) => {
    const user: AuthUser = { userId: 'u1', email: 'a@b.com', role, tenantId: 't1', permissions: [] };
    return {
      get: (key: string) => key === 'user' ? user : undefined,
      json: (body: unknown, status?: number) => ({ body, status: status ?? 200 }),
    };
  };

  it('allows a user with the correct role', async () => {
    const middleware = requireRole(['TENANT_ADMIN', 'SUPER_ADMIN']);
    await middleware(makeCtxWithUser('TENANT_ADMIN') as any, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('blocks a user with an incorrect role', async () => {
    const middleware = requireRole(['SUPER_ADMIN']);
    const result = await middleware(makeCtxWithUser('CUSTOMER') as any, mockNext) as any;
    expect(result.status).toBe(403);
    expect(mockNext).not.toHaveBeenCalled();
  });

  it('returns 401 if no user in context', async () => {
    const middleware = requireRole(['SUPER_ADMIN']);
    const ctx = { get: () => undefined, json: (body: unknown, status?: number) => ({ body, status }) };
    const result = await middleware(ctx as any, mockNext) as any;
    expect(result.status).toBe(401);
  });
});

// ─── requirePermissions ───────────────────────────────────────────────────────

describe('requirePermissions', () => {
  beforeEach(() => vi.clearAllMocks());

  const makeCtxWithPerms = (role: string, permissions: string[]) => {
    const user: AuthUser = { userId: 'u1', email: 'a@b.com', role, tenantId: 't1', permissions };
    return {
      get: (key: string) => key === 'user' ? user : undefined,
      json: (body: unknown, status?: number) => ({ body, status: status ?? 200 }),
    };
  };

  it('allows SUPER_ADMIN regardless of permissions', async () => {
    const middleware = requirePermissions(['delete:tenants']);
    await middleware(makeCtxWithPerms('SUPER_ADMIN', []) as any, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('allows a user with all required permissions', async () => {
    const middleware = requirePermissions(['read:products', 'write:products']);
    await middleware(makeCtxWithPerms('STAFF', ['read:products', 'write:products', 'read:orders']) as any, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  it('blocks a user missing a required permission', async () => {
    const middleware = requirePermissions(['delete:products']);
    const result = await middleware(makeCtxWithPerms('STAFF', ['read:products']) as any, mockNext) as any;
    expect(result.status).toBe(403);
  });
});

// ─── getTenantId / getAuthUser ────────────────────────────────────────────────

describe('getTenantId', () => {
  it('returns tenantId from context', () => {
    const ctx = { get: (key: string) => key === 'tenantId' ? 'tenant_xyz' : undefined };
    expect(getTenantId(ctx as any)).toBe('tenant_xyz');
  });

  it('throws if tenantId is not in context', () => {
    const ctx = { get: () => undefined };
    expect(() => getTenantId(ctx as any)).toThrow();
  });
});

describe('getAuthUser', () => {
  it('returns user from context', () => {
    const user: AuthUser = { userId: 'u1', email: 'a@b.com', role: 'STAFF', tenantId: 't1', permissions: [] };
    const ctx = { get: (key: string) => key === 'user' ? user : undefined };
    expect(getAuthUser(ctx as any)).toEqual(user);
  });

  it('throws if user is not in context', () => {
    const ctx = { get: () => undefined };
    expect(() => getAuthUser(ctx as any)).toThrow();
  });
});

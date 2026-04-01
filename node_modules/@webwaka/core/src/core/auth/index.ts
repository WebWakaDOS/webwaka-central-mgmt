/**
 * @webwaka/core — Auth Module
 * Blueprint Reference: Part 9.2 (Universal Architecture Standards — Auth & Authorization)
 *
 * Canonical authentication primitives for all WebWaka OS v4 Cloudflare Workers.
 *
 * Invariants enforced:
 *  - Build Once Use Infinitely: single implementation, all suites import from here.
 *  - tenantId ALWAYS sourced from validated JWT payload, NEVER from request headers.
 *  - CORS NEVER uses wildcard `origin: '*'` in production.
 *  - All auth/mutation endpoints MUST apply rateLimit middleware.
 *
 * Exports:
 *  - signJWT()           — Issue a signed HS256 JWT (used by super-admin-v2 login)
 *  - verifyJWT()         — Verify & decode an HS256 JWT (used by all suites)
 *  - jwtAuthMiddleware() — Hono middleware: verify token, inject user into context
 *  - requireRole()       — Hono middleware factory: enforce RBAC after jwtAuthMiddleware
 *  - secureCORS()        — Hono CORS middleware with environment-aware origin allowlist
 *  - rateLimit()         — Hono middleware: KV-backed sliding-window rate limiter
 *  - AuthUser            — Canonical user session type
 *  - JWTPayload          — Canonical JWT payload type
 */

import type { Context, MiddlewareHandler, Next } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '../logger/index.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface JWTPayload {
  /** Subject — user ID */
  sub: string;
  /** Tenant ID — ALWAYS sourced from here, never from headers */
  tenantId: string;
  /** User role */
  role: string;
  /** Granted permissions */
  permissions: string[];
  /** Issued-at (Unix seconds) */
  iat: number;
  /** Expiry (Unix seconds) */
  exp: number;
  /** User email */
  email: string;
}

/** Canonical user context injected into every authenticated Hono request */
export interface AuthUser {
  userId: string;
  email: string;
  role: string;
  tenantId: string;
  permissions: string[];
}

/**
 * User context for API key authenticated requests (B2B / third-party systems).
 * Compatible with the 'user' context key set by jwtAuthMiddleware.
 */
export interface WakaUser {
  id: string;
  tenant_id: string;
  role: string;
  name: string;
  phone: string;
  operator_id: string;
}

export interface AuthEnv {
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  /** Optional: KV namespace for rate-limiting counters */
  RATE_LIMIT_KV?: KVNamespace;
  /** Optional: D1 database binding used by verifyApiKey */
  DB?: D1Database;
}

// ─── JWT Utilities ────────────────────────────────────────────────────────────

/**
 * Encodes a string as a URL-safe Base64 string (no padding).
 * Uses TextEncoder so any Unicode content (accented chars, CJK, Arabic, etc.)
 * is first converted to UTF-8 bytes before btoa — avoiding InvalidCharacterError.
 */
function toBase64Url(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

/**
 * Decodes a URL-safe Base64 string back to its original UTF-8 string.
 * Inverse of toBase64Url — required for verifying payloads that contain Unicode.
 */
function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Sign a new HS256 JWT using the Web Crypto API (Cloudflare Workers compatible).
 * Returns a compact `header.payload.signature` string.
 */
export async function signJWT(
  payload: Omit<JWTPayload, 'iat' | 'exp'>,
  secret: string,
  expiresInSeconds = 86400
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: JWTPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  // Header is always ASCII — btoa is fine; payload uses Unicode-safe toBase64Url
  const headerB64 = btoa(JSON.stringify(header))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  const payloadB64 = toBase64Url(JSON.stringify(fullPayload));

  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const data = encoder.encode(`${headerB64}.${payloadB64}`);
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, data);
  const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `${headerB64}.${payloadB64}.${signatureB64}`;
}

/**
 * Verify an HS256 JWT and return its decoded payload.
 * Returns null if the token is invalid, expired, or tampered with.
 * Uses the Web Crypto API — safe for Cloudflare Workers edge runtime.
 */
export async function verifyJWT(
  token: string,
  secret: string
): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const data = encoder.encode(`${headerB64}.${payloadB64}`);
    const signature = Uint8Array.from(
      atob(signatureB64.replace(/-/g, '+').replace(/_/g, '/')),
      (c) => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) return null;

    const payload = JSON.parse(fromBase64Url(payloadB64)) as JWTPayload;

    // Reject expired tokens
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;

    return payload;
  } catch {
    return null;
  }
}

// ─── API Key Authentication ───────────────────────────────────────────────────

/**
 * Verifies an API key by hashing it with SHA-256 and looking it up in the
 * api_keys table. Returns a WakaUser on success or null if the key is invalid.
 * Compatible with Cloudflare Workers (Web Crypto API only).
 */
export async function verifyApiKey(
  rawKey: string,
  db: D1Database
): Promise<WakaUser | null> {
  const encoder = new TextEncoder();
  const data = encoder.encode(rawKey);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const keyHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

  const row = await db
    .prepare(
      `SELECT ak.*, o.name as operator_name FROM api_keys ak
       JOIN operators o ON o.id = ak.operator_id
       WHERE ak.key_hash = ? AND ak.revoked_at IS NULL AND ak.deleted_at IS NULL`
    )
    .bind(keyHash)
    .first<{
      id: string;
      operator_id: string;
      scope: string;
      operator_name: string;
    }>();

  if (!row) return null;

  // Non-blocking: update last_used_at
  db.prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(Date.now(), row.id)
    .run()
    .catch(() => {});

  return {
    id: row.id,
    tenant_id: row.operator_id,
    role: row.scope === 'read_write' ? 'TENANT_ADMIN' : 'STAFF',
    name: `api_key:${row.id}`,
    phone: '',
    operator_id: row.operator_id,
  };
}

// ─── Hono Middleware: JWT Auth ────────────────────────────────────────────────

export interface JwtAuthOptions {
  /**
   * Routes that bypass authentication entirely.
   * Each entry is matched as a prefix against the request path.
   * Method defaults to '*' (any method).
   */
  publicRoutes?: Array<{ method?: string; path: string }>;
}

/**
 * Hono middleware that verifies the Bearer JWT, rejects invalid/expired tokens,
 * and injects the canonical `AuthUser` into the Hono context as `c.get('user')`.
 *
 * Also sets `c.get('tenantId')` from the JWT payload — NEVER from headers.
 *
 * Usage:
 *   app.use('/api/*', jwtAuthMiddleware({ publicRoutes: [{ path: '/health' }] }));
 */
export function jwtAuthMiddleware(
  options: JwtAuthOptions = {}
): MiddlewareHandler<{ Bindings: AuthEnv }> {
  const { publicRoutes = [] } = options;

  return async (
    c: Context<{ Bindings: AuthEnv }>,
    next: Next
  ): Promise<Response | void> => {
    const method = c.req.method;
    const path = c.req.path;

    // Allow public routes through without auth
    const isPublic = publicRoutes.some(
      (r) =>
        path.startsWith(r.path) && (!r.method || r.method === '*' || r.method === method)
    );
    if (isPublic) return next();

    const authHeader = c.req.header('Authorization') ?? '';

    // ── API Key auth (B2B / third-party systems) ──────────────────────────────
    if (authHeader.startsWith('ApiKey ')) {
      const rawKey = authHeader.slice(7).trim();
      const db = (c.env as any).DB as D1Database | undefined;
      if (!db) {
        return c.json({ success: false, error: 'Unauthorized: DB binding not configured' }, 401);
      }
      const wakaUser = await verifyApiKey(rawKey, db);
      if (!wakaUser) {
        return c.json({ error: 'Invalid API key' }, 401);
      }
      c.set('user' as never, wakaUser);
      c.set('tenantId' as never, wakaUser.operator_id);
      return next();
    }

    // ── JWT Bearer auth ───────────────────────────────────────────────────────
    if (!authHeader.startsWith('Bearer ')) {
      return c.json(
        { success: false, error: 'Unauthorized: missing or malformed Authorization header' },
        401
      );
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return c.json({ success: false, error: 'Unauthorized: empty token' }, 401);
    }

    const payload = await verifyJWT(token, c.env.JWT_SECRET);
    if (!payload) {
      return c.json(
        { success: false, error: 'Unauthorized: invalid or expired token' },
        401
      );
    }

    const user: AuthUser = {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantId: payload.tenantId,
      permissions: payload.permissions ?? [],
    };

    // Inject into Hono context — downstream handlers use c.get('user') and c.get('tenantId')
    c.set('user' as never, user);
    c.set('tenantId' as never, payload.tenantId);

    return next();
  };
}

// ─── Hono Middleware: RBAC ────────────────────────────────────────────────────

/**
 * Hono middleware factory that enforces role-based access control.
 * MUST be used AFTER jwtAuthMiddleware on the same route.
 *
 * Usage:
 *   app.post('/api/admin/tenants', requireRole(['SUPER_ADMIN', 'TENANT_ADMIN']), handler);
 */
export function requireRole(allowedRoles: string[]): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized: no authenticated user' }, 401);
    }
    if (!allowedRoles.includes(user.role)) {
      return c.json(
        {
          success: false,
          error: `Forbidden: requires one of [${allowedRoles.join(', ')}]`,
        },
        403
      );
    }
    return next();
  };
}

/**
 * Hono middleware factory that enforces permission-based access control.
 * SUPER_ADMIN role bypasses all permission checks.
 * MUST be used AFTER jwtAuthMiddleware.
 *
 * Usage:
 *   app.delete('/api/tenants/:id', requirePermissions(['delete:tenants']), handler);
 */
export function requirePermissions(requiredPermissions: string[]): MiddlewareHandler {
  return async (c: Context, next: Next): Promise<Response | void> => {
    const user = c.get('user') as AuthUser | undefined;
    if (!user) {
      return c.json({ success: false, error: 'Unauthorized: no authenticated user' }, 401);
    }
    if (user.role === 'SUPER_ADMIN') return next();

    const hasAll = requiredPermissions.every((p) => user.permissions.includes(p));
    if (!hasAll) {
      return c.json(
        {
          success: false,
          error: `Forbidden: missing required permissions [${requiredPermissions.join(', ')}]`,
        },
        403
      );
    }
    return next();
  };
}

// ─── Hono Middleware: Secure CORS ─────────────────────────────────────────────

export interface SecureCORSOptions {
  /**
   * Allowed origins for production. Defaults to WebWaka production domains.
   * In non-production environments, all origins are allowed.
   */
  allowedOrigins?: string[];
}

/**
 * Environment-aware CORS middleware.
 * - Production: restricts to an explicit allowlist of WebWaka domains.
 * - Non-production (staging/dev/local): allows all origins for developer convenience.
 *
 * NEVER uses `origin: '*'` in production.
 *
 * Usage:
 *   app.use('*', secureCORS());
 *   app.use('*', secureCORS({ allowedOrigins: ['https://app.mywebwaka.com'] }));
 */
export function secureCORS(options: SecureCORSOptions = {}): MiddlewareHandler<{ Bindings: AuthEnv }> {
  const defaultProductionOrigins = [
    'https://webwaka.com',
    'https://app.webwaka.com',
    'https://admin.webwaka.com',
    'https://webwaka-super-admin.pages.dev',
  ];

  const allowedOrigins = options.allowedOrigins ?? defaultProductionOrigins;

  return cors({
    origin: (origin, c) => {
      const env = (c.env as AuthEnv).ENVIRONMENT ?? 'production';
      const isProd = env === 'production';

      if (!isProd) {
        // Allow all origins in non-production environments
        return origin;
      }

      // In production: only allow explicitly listed origins
      if (allowedOrigins.includes(origin)) return origin;

      // Block all other origins in production
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposeHeaders: ['X-Request-ID'],
    maxAge: 86400,
    credentials: true,
  }) as MiddlewareHandler<{ Bindings: AuthEnv }>;
}

// ─── Hono Middleware: Rate Limiting ──────────────────────────────────────────

export interface RateLimitOptions {
  /** Maximum requests allowed per window. Default: 60 */
  limit?: number;
  /** Window duration in seconds. Default: 60 */
  windowSeconds?: number;
  /** Key prefix to namespace different rate limit buckets. Default: 'rl' */
  keyPrefix?: string;
  /** Custom key extractor. Default: uses CF-Connecting-IP header or 'unknown' */
  keyExtractor?: (c: Context) => string;
}

export interface RateLimitEnv extends AuthEnv {
  RATE_LIMIT_KV: KVNamespace;
}

/**
 * KV-backed sliding-window rate limiter for Cloudflare Workers.
 * Requires a `RATE_LIMIT_KV` KV namespace binding.
 *
 * Usage (auth endpoints — strict):
 *   app.post('/auth/login', rateLimit({ limit: 10, windowSeconds: 60, keyPrefix: 'login' }), handler);
 *
 * Usage (general API):
 *   app.use('/api/*', rateLimit({ limit: 300, windowSeconds: 60 }));
 */
export function rateLimit(options: RateLimitOptions = {}): MiddlewareHandler<{ Bindings: RateLimitEnv }> {
  const {
    limit = 60,
    windowSeconds = 60,
    keyPrefix = 'rl',
    keyExtractor,
  } = options;

  return async (
    c: Context<{ Bindings: RateLimitEnv }>,
    next: Next
  ): Promise<Response | void> => {
    const kv = c.env.RATE_LIMIT_KV;
    if (!kv) {
      // If KV is not configured, fail open (do not block) but log a warning
      logger.warn('[rateLimit] RATE_LIMIT_KV binding not configured — rate limiting disabled');
      return next();
    }

    const clientKey = keyExtractor
      ? keyExtractor(c)
      : (c.req.header('CF-Connecting-IP') ?? c.req.header('X-Forwarded-For') ?? 'unknown');

    const windowStart = Math.floor(Date.now() / 1000 / windowSeconds);
    const kvKey = `${keyPrefix}:${clientKey}:${windowStart}`;

    let count = 0;
    try {
      const existing = await kv.get(kvKey);
      count = existing ? parseInt(existing, 10) : 0;
    } catch {
      // Fail open on KV errors
      return next();
    }

    if (count >= limit) {
      return c.json(
        {
          success: false,
          error: `Rate limit exceeded. Maximum ${limit} requests per ${windowSeconds}s.`,
        },
        429
      );
    }

    // Increment counter; set TTL to expire at end of window
    try {
      await kv.put(kvKey, String(count + 1), { expirationTtl: windowSeconds * 2 });
    } catch {
      // Fail open on KV write errors
    }

    // Attach rate limit headers
    c.header('X-RateLimit-Limit', String(limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, limit - count - 1)));
    c.header('X-RateLimit-Reset', String((windowStart + 1) * windowSeconds));

    return next();
  };
}

// ─── Tenant Utilities ─────────────────────────────────────────────────────────

/**
 * Safely extract tenantId from the Hono context.
 * Throws if tenantId is not present (i.e., jwtAuthMiddleware was not applied).
 * Use this in route handlers to enforce that tenant context is always present.
 */
export function getTenantId(c: Context): string {
  const tenantId = c.get('tenantId') as string | undefined;
  if (!tenantId) {
    throw new Error(
      'getTenantId() called without jwtAuthMiddleware — tenantId not in context'
    );
  }
  return tenantId;
}

/**
 * Safely extract the authenticated user from the Hono context.
 * Throws if user is not present.
 */
export function getAuthUser(c: Context): AuthUser {
  const user = c.get('user') as AuthUser | undefined;
  if (!user) {
    throw new Error(
      'getAuthUser() called without jwtAuthMiddleware — user not in context'
    );
  }
  return user;
}

# @webwaka/core Changelog

All notable changes to this package will be documented in this file.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [1.0.0] — 2026-03-23

### Added — Auth Module (`src/core/auth/index.ts`)

This release introduces the **canonical authentication package** for all WebWaka OS v4 Cloudflare Workers, resolving the critical security vulnerabilities identified in the March 2026 cross-repo security audit.

#### New Exports

| Export | Type | Description |
|---|---|---|
| `signJWT()` | `async function` | Issue a signed HS256 JWT using the Web Crypto API |
| `verifyJWT()` | `async function` | Verify & decode an HS256 JWT; returns `null` on failure |
| `jwtAuthMiddleware()` | Hono middleware factory | Verify Bearer JWT, inject `AuthUser` and `tenantId` into context |
| `requireRole()` | Hono middleware factory | Enforce RBAC after `jwtAuthMiddleware` |
| `requirePermissions()` | Hono middleware factory | Enforce permission-based access; SUPER_ADMIN bypasses |
| `secureCORS()` | Hono middleware factory | Environment-aware CORS — never `origin: '*'` in production |
| `rateLimit()` | Hono middleware factory | KV-backed sliding-window rate limiter |
| `getTenantId()` | utility | Safely extract `tenantId` from Hono context |
| `getAuthUser()` | utility | Safely extract `AuthUser` from Hono context |
| `JWTPayload` | TypeScript interface | Canonical JWT payload shape |
| `AuthUser` | TypeScript interface | Canonical user context shape |
| `AuthEnv` | TypeScript interface | Required Cloudflare Worker bindings for auth |
| `RateLimitEnv` | TypeScript interface | Required bindings for rate limiting (extends `AuthEnv`) |

#### Security Invariants Enforced

- **`tenantId` ALWAYS sourced from validated JWT payload** — `getTenantId()` throws if `jwtAuthMiddleware` was not applied, making cross-tenant data breaches impossible by construction.
- **CORS NEVER uses `origin: '*'` in production** — `secureCORS()` enforces an explicit origin allowlist in production environments.
- **Rate limiting on all auth endpoints** — `rateLimit()` provides KV-backed sliding-window rate limiting with configurable limits per endpoint class.
- **Cryptographic token verification** — `verifyJWT()` uses `crypto.subtle.verify()` (HMAC-SHA256) available natively in the Cloudflare Workers runtime.

#### Package Configuration

- Added `package.json` with `@webwaka/core` package name and sub-path exports
- Added `tsconfig.json` targeting ES2022 with `WebWorker` lib
- Added `vitest.config.ts` for unit testing

#### Tests Added

- 22 new unit tests in `src/core/auth/index.test.ts`
- Covers: sign/verify round-trip, expiry rejection, tamper detection, middleware public routes, RBAC enforcement, permission bypass, context helpers

### Changed

- `src/index.ts` — updated to re-export all auth primitives from the new auth module
- `src/core/rbac/index.ts` — `requireRole` and `requirePermissions` are now superseded by the auth module exports; the RBAC module's mock `verifyJwt` is deprecated

---

## [0.1.0] — 2026-02-01 (Initial)

### Added

- CORE-1: Offline Sync Engine (Dexie/IndexedDB)
- CORE-2: AI Engine abstraction (OpenRouter)
- CORE-3: Universal Billing Ledger (integer kobo)
- CORE-4: Notifications (Termii SMS/email)
- CORE-5: KYC module
- CORE-6: RBAC primitives (mock implementation — superseded by v1.0.0)
- CORE-7: Geolocation utilities
- CORE-8: Document management
- CORE-9: Chat module
- CORE-10: Booking engine

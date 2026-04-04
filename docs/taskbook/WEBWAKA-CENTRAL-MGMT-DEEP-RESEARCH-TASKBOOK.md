# WEBWAKA-CENTRAL-MGMT — DEEP RESEARCH + ENHANCEMENT TASKBOOK + QA PROMPT FACTORY

**Repo:** `webwaka-central-mgmt`
**Service:** WebWaka OS v4 — Central Management & Economics
**Document Version:** 1.0
**Date:** 2026-04-04
**Author:** Research & Enhancement Analysis Agent

---

## TABLE OF CONTENTS

1. [Repo Deep Understanding](#1-repo-deep-understanding)
2. [External Best-Practice Research](#2-external-best-practice-research)
3. [Synthesis and Gap Analysis](#3-synthesis-and-gap-analysis)
4. [Top 20 Enhancements](#4-top-20-enhancements)
5. [Bug Fix Recommendations](#5-bug-fix-recommendations)
6. [Task Breakdown (Tasks 1–25)](#6-task-breakdown)
7. [QA Plans (Per Task)](#7-qa-plans)
8. [Implementation Prompts](#8-implementation-prompts)
9. [QA Prompts](#9-qa-prompts)
10. [Priority Order](#10-priority-order)
11. [Dependencies](#11-dependencies)
12. [Phase 1 / Phase 2 Split](#12-phase-1--phase-2-split)
13. [Repo Context and Ecosystem Notes](#13-repo-context-and-ecosystem-notes)
14. [Governance and Reminder Block](#14-governance-and-reminder-block)
15. [Execution Readiness Notes](#15-execution-readiness-notes)

---

## 1. REPO DEEP UNDERSTANDING

### 1.1 Service Identity

`webwaka-central-mgmt` is the **Central Management & Economics** service of **WebWaka OS v4**, a multi-repo, multi-tenant, Cloudflare-first platform targeting Nigerian and African markets. This repo is specifically Blueprint Part 10.1 (Central Management & Economics) and is one of at least 10 vertical services in the ecosystem. It is **not standalone** — it receives events from `webwaka-transport` and `webwaka-commerce`, depends on `@webwaka/core` for JWT auth/RBAC middleware, and produces data consumed by the super-admin dashboard and operator analytics UIs in other repos.

### 1.2 Stack and Infrastructure

| Layer | Technology |
|-------|-----------|
| Runtime | Cloudflare Workers (Serverless Edge) |
| Framework | Hono v4.12.x (lightweight, Worker-native) |
| Language | TypeScript 5.9.x |
| Primary DB | Cloudflare D1 (SQLite-on-edge, `DB` binding) |
| Cache/Config | Cloudflare KV (`PLATFORM_KV` binding) |
| Auth | JWT via `@webwaka/core` (`jwtAuthMiddleware`, `requireRole`) |
| Inter-Service Auth | `INTER_SERVICE_SECRET` bearer token |
| Package Manager | npm |
| Build/Deploy | Wrangler v3 |
| Test Framework | Vitest v1.6 |
| CI/CD | GitHub Actions (`.github/workflows/deploy.yml`) |

### 1.3 Module Inventory

#### Module 1: `src/worker.ts` — HTTP Entry Point
The main Cloudflare Worker. Exposes:
- `GET /health` — public health endpoint
- `POST /events/ingest` — receives ledger events from transport/commerce; uses INTER_SERVICE_SECRET bearer auth
- `GET /api/ledger/entries` — paginated ledger entries; JWT + admin/super_admin role required
- `GET /api/ledger/summary` — account balance aggregation; JWT + admin/super_admin role required
- `GET /api/events` — inbound event log; JWT + admin/super_admin role required
- 404 catch-all

Event types handled inline in `worker.ts`:
- `transport.booking.confirmed` → platform fee 5% + operator remainder
- `transport.booking.refunded` → debit platform_revenue
- `commerce.order.paid` → platform commission (configurable bps, default 500 = 5%)
- `commerce.payout.processed` → debit vendor escrow

#### Module 2: `src/modules/ledger/core.ts` — `LedgerService`
Provides `recordTransaction()`, `holdInEscrow()`, `releaseFromEscrow()`. **Critical bug: DB writes are commented out.** The module never persists anything to D1. It creates in-memory `LedgerEntry` objects only.

#### Module 3: `src/modules/affiliate/core.ts` — `AffiliateSystem`
Provides `calculateSplits()` for 5-level MLM commission tree. **Critical bug: `getAffiliate()` uses hardcoded mock data** — it never queries D1. The affiliate commission calculation is entirely disconnected from the live database.

#### Module 4: `src/modules/super-admin/core.ts` — `SuperAdminService`
Provides `provisionTenant()`, `toggleModule()`, `toggleFeatureFlag()`. Uses KV via `PLATFORM_KV`. **No HTTP endpoints expose this in `worker.ts`** — the super-admin module is not reachable via the API.

### 1.4 Database Schema (`migrations/001_central_mgmt_schema.sql`)

**Table: `ledger_entries`**
- id (PK), transaction_id, account_id, account_type, type (credit/debit), amount_kobo, currency, status, metadata_json, created_at
- Indexes: account_id, transaction_id, account_type, created_at DESC
- Constraint: `amount_kobo > 0`
- No tenant_id column — **critical multi-tenancy gap**

**Table: `central_mgmt_events`**
- id (PK), event_type, source_event_id (UNIQUE), tenant_id, payload_json, processed (0/1), received_at, processed_at
- Indexes: event_type, tenant_id, processed, received_at DESC

### 1.5 Affiliate & Tenant Schema: Missing Tables
There is **no migration for affiliate nodes or tenant registry in D1**. The affiliate system has no backing table. The tenant system stores configs in KV only (no D1 record, no audit trail, no query capability).

### 1.6 Tests

| File | Tests | Coverage |
|------|-------|----------|
| `ledger/core.test.ts` | 3 tests | `LedgerService` in-memory only (mocked DB) |
| `affiliate/core.test.ts` | 3 tests | `AffiliateSystem` with hardcoded mock data |
| `super-admin/core.test.ts` | 4 tests | `SuperAdminService` with mocked KV |

**No integration tests.** No end-to-end worker tests. No `vitest.config.ts`. Tests pass but test nothing real because modules are mocked/stubbed throughout.

### 1.7 CI/CD Analysis (`.github/workflows/deploy.yml`)

**Critical CI/CD Issues:**
1. `npm run lint || true` — lint failures are silently ignored, will never block a bad PR
2. `npm run build || true` — TypeScript errors will never block deployment
3. `npm test || true` — test failures will never block deployment
4. No `lint` script defined in `package.json` — lint step always "succeeds" vacuously
5. D1 migrations use `continue-on-error: true` — a migration failure won't block a bad deploy
6. The "Verify Ledger KV connectivity" post-deploy step sends INTER_SERVICE_SECRET as a Bearer token to `/api/ledger/summary` — but that endpoint requires JWT auth, not INTER_SERVICE_SECRET. This step will always fail silently (401).
7. No staging `wrangler.toml` environment config (only production is defined for D1/KV bindings)
8. GitHub Release notes reference `/api/events/ingest` as the endpoint — but the actual path is `/events/ingest` (no `/api` prefix). This is documentation drift.

### 1.8 Security Analysis

- JWT authentication via `@webwaka/core` middleware (trusted, shared package)
- `INTER_SERVICE_SECRET` is a static shared secret with no rotation mechanism
- No rate limiting on any endpoint — `/events/ingest` can be flooded
- No request size limit validation
- No CORS configuration (could be an issue if a browser client ever hits this)
- `metadata_json` and `payload_json` fields store raw JSON strings without sanitization
- KV keys use `tenant:${tenantId}` — predictable, no namespacing protection

### 1.9 Missing Capabilities Summary

| Capability | Status |
|-----------|--------|
| `affiliates` DB table + migration | ❌ Missing |
| Affiliate HTTP endpoints | ❌ Missing |
| Super-admin HTTP endpoints | ❌ Missing |
| Tenant D1 registry table | ❌ Missing |
| `tenant_id` on `ledger_entries` | ❌ Missing |
| Rate limiting | ❌ Missing |
| LedgerService wired to D1 | ❌ Bug (commented out) |
| AffiliateSystem wired to D1 | ❌ Bug (mock data) |
| Affiliate commissions in event processing | ❌ Missing |
| Payout/withdrawal request endpoints | ❌ Missing |
| Multi-currency support | ❌ Missing |
| Operator financial report endpoint | ❌ Missing |
| Lint script | ❌ Missing |
| vitest.config.ts | ❌ Missing |
| Integration tests | ❌ Missing |
| KV TTL / cache invalidation | ❌ Missing |
| Secrets rotation mechanism | ❌ Missing |
| Observability (structured logs) | ❌ Missing |

---

## 2. EXTERNAL BEST-PRACTICE RESEARCH

### 2.1 Double-Entry Ledger Best Practices

World-class ledger systems (Stripe, Monzo, Flutterwave) enforce:

1. **Atomic batch writes**: Both sides of every double-entry must be written in a single D1 `.batch()` call — never two separate writes. A half-written transaction corrupts the ledger.
2. **Transaction ID uniqueness**: Use UUIDs + deterministic prefixes based on source event ID for idempotency.
3. **Balance computed from entries, never cached**: Real-time balance = `SUM(credits) - SUM(debits)` from the ledger, not a separate balance column.
4. **Pending → Cleared state flow**: Credits from events should start as `pending`, transition to `cleared` only after settlement confirmation.
5. **Reversal entries, not deletes**: Refunds/corrections create new reversing entries, never modify existing ones.
6. **Per-tenant, per-currency isolation**: `tenant_id` and `currency` must be part of every ledger query.
7. **Pagination on audit queries**: All ledger queries must support cursor-based pagination.

### 2.2 Multi-Level Affiliate System Best Practices

Industry standards (Post Affiliate Pro, TUNE, Impact) require:

1. **DB-backed hierarchy**: Affiliate trees must be stored in a database (adjacency list or materialized path) not hardcoded.
2. **Commission locks**: Commission amounts should be locked at event time, not recalculated later.
3. **Fraud guards**: Circular reference detection, self-referral prevention, maximum tree depth enforcement.
4. **Payout batching**: Commissions accumulate; payouts are batched (daily/weekly), not per-event.
5. **Audit trail per commission**: Each commission split must be a ledger entry, traceable to the source transaction.
6. **Configurable rates per tenant**: Commission rates should be tenant-configurable, not hardcoded.
7. **Chargeback/reversal cascade**: When a booking is refunded, commissions at all levels must be reversed.

### 2.3 Multi-Tenant Feature Flag / KV Best Practices

Cloudflare Workers KV patterns from official docs and production systems:

1. **KV as read-through cache, D1 as source of truth**: KV should be a cache layer over D1 for tenant configs — always write to D1 first, then update KV.
2. **TTL on KV cache entries**: Set TTL (e.g., 300s) on KV entries so stale configs auto-expire.
3. **Versioned keys**: Use `tenant:${tenantId}:v${version}` pattern or `metadata.version` for optimistic locking.
4. **Namespace prefixing**: Separate operational data from config with key prefixes (`cfg:`, `state:`, `lock:`).
5. **Audit log for config changes**: Every tenant config change should produce a D1 audit record.
6. **Bulk listing**: Use `PLATFORM_KV.list({ prefix: 'tenant:' })` for super-admin dashboards, not individual gets.

### 2.4 Event-Driven Idempotency Patterns

From Azure Architecture Center, financial systems engineering:

1. **Idempotency key = source_event_id**: Check for existence before processing (already implemented, but the check is non-atomic).
2. **Optimistic locking on event processing**: Use a `processing` state (0=pending, 1=processing, 2=processed) to prevent concurrent duplicate processing.
3. **Outbox pattern**: For critical events, write to an outbox table before processing, preventing loss on Worker crash.
4. **Dead letter storage**: Events that fail to process repeatedly should be marked `failed` with error details, not silently dropped.
5. **Replay capability**: System should be able to re-process unprocessed events from `central_mgmt_events`.

### 2.5 Cloudflare Workers Security Best Practices

From Cloudflare official documentation:

1. **Rate limiting via Cloudflare Rate Limiting API or Workers AI**: Apply rate limiting at the edge, not just in code.
2. **Request size limits**: Use `request.headers.get('content-length')` checks.
3. **Secret rotation**: Use `wrangler secret put` with zero-downtime rotation (add new secret, update workers, remove old).
4. **HMAC signatures for inter-service auth**: Better than shared secrets — use `INTER_SERVICE_SECRET` as an HMAC key to sign request payloads.
5. **Structured logging**: Use `console.log(JSON.stringify({level, msg, ...ctx}))` for searchable logs.
6. **Never log secrets**: Middleware must strip Authorization headers before logging.

### 2.6 Hono Framework Best Practices (2025)

1. **Zod + `@hono/zod-validator`**: Use Zod schemas for all request body/query validation.
2. **`app.use()` for global middleware**: Apply logging, CORS, rate limiting, and error handling globally.
3. **`HTTPException` for structured errors**: Use Hono's `HTTPException` rather than manual JSON error responses.
4. **Route grouping with `app.route()`**: Split routes into sub-routers per module.
5. **`c.env` typing**: Always use the `Env` interface for type-safe binding access.

### 2.7 Nigeria/Africa Fintech Architecture Patterns

1. **Kobo-integer enforcement**: Already implemented — world-class practice (Paystack, Flutterwave use kobo/cents).
2. **Bank transfer verification**: Nigerian NIBSS/NIP integration required for real payouts.
3. **WAT timezone defaults**: All timestamps should default to WAT (+1) for user-facing displays.
4. **BVN/NIN compliance**: KYC for affiliate payouts (needed at payout endpoint level).
5. **Naira volatility buffer**: Commission rates should be configurable per tenant to accommodate pricing changes.
6. **Offline-tolerant event queuing**: Events from mobile-first apps may arrive out of order or delayed.

### 2.8 D1 Migrations Best Practices

1. **Sequential numbered migrations**: `001_`, `002_`, etc. — already followed.
2. **Rollback scripts**: Every migration should have a companion `_rollback.sql`.
3. **CI applies migrations before deploy**: Already in the workflow but `continue-on-error: true` must be removed.
4. **Test migrations in local Miniflare first**: Add a CI step for local migration apply.
5. **Never alter existing columns**: Add new nullable columns only; use `ALTER TABLE ADD COLUMN`.

---

## 3. SYNTHESIS AND GAP ANALYSIS

### 3.1 Critical Gaps (Blocking Functionality)

| Gap | Impact | Location |
|-----|--------|---------|
| LedgerService never writes to D1 | Ledger module is non-functional; all data only lives in worker.ts inline SQL | `src/modules/ledger/core.ts` |
| AffiliateSystem uses mock data | Commission splits are never persisted or calculated from real data | `src/modules/affiliate/core.ts` |
| No affiliate DB schema | Cannot store or retrieve affiliates from D1 | `migrations/` |
| Super-admin has no HTTP routes | MGMT-1 is unreachable via API | `src/worker.ts` |
| No `tenant_id` on `ledger_entries` | All ledger data is cross-tenant; can't filter by operator | `migrations/001_` |
| Affiliate commissions not triggered from events | `transport.booking.confirmed` does NOT trigger affiliate splits | `src/worker.ts` |
| CI failures are silently ignored | Bad code can deploy to production undetected | `.github/workflows/deploy.yml` |

### 3.2 Architecture Gaps

| Gap | Impact |
|-----|--------|
| LedgerService and worker.ts are duplicated and disconnected | Two independent ledger write paths will diverge |
| No module integration in worker routes | Modules exist as orphaned classes, unused by the live API |
| No escrow tracking table | Escrow holds are not queryable; only referenced via ledger debit/credit |
| No payout workflow endpoint | Operators can't request withdrawals |
| No KV-backed balance cache | Every balance query hits D1 with a full aggregation scan |
| No tenant registry in D1 | Tenants only in KV; no audit trail, no list query |

### 3.3 Security Gaps

| Gap | Severity |
|-----|--------|
| No rate limiting on `/events/ingest` | High — this endpoint can be abused to flood the ledger |
| Static INTER_SERVICE_SECRET, no rotation | Medium — single secret compromise exposes all inter-service communication |
| No request body size limit | Medium — large JSON payloads can exhaust Worker memory |
| No HMAC signature verification | Medium — bearer token is less secure than HMAC-signed requests |
| Predictable KV key patterns | Low — insider threat: tenant keys are guessable |

### 3.4 Operational Gaps

| Gap | Impact |
|-----|--------|
| No structured logging | Can't search logs; debugging events is impossible |
| No dead-letter events | Failed event processing is lost silently |
| No replay endpoint | Unprocessed events can't be retried |
| No observability on commission splits | Can't audit which affiliates received what for a given event |
| No lint script | Code quality not enforced |
| No vitest.config.ts | Test configuration is implicit, may behave differently across environments |

---

## 4. TOP 20 ENHANCEMENTS

| # | Enhancement | Priority | Phase |
|---|------------|---------|-------|
| E-01 | Wire LedgerService to D1 (fix commented-out DB writes) | P0 Critical | Phase 1 |
| E-02 | Add `tenant_id` column to `ledger_entries` | P0 Critical | Phase 1 |
| E-03 | Scaffold `affiliates` D1 table + wire AffiliateSystem to D1 | P0 Critical | Phase 1 |
| E-04 | Expose super-admin HTTP routes (MGMT-1 endpoints) | P0 Critical | Phase 1 |
| E-05 | Fix CI/CD — remove `|| true` from critical steps | P0 Critical | Phase 1 |
| E-06 | Integrate modules into worker.ts routes (replace inline SQL) | P1 High | Phase 1 |
| E-07 | Trigger affiliate commission splits from `transport.booking.confirmed` | P1 High | Phase 1 |
| E-08 | Add Zod validation to all request bodies and query params | P1 High | Phase 1 |
| E-09 | Add rate limiting to `/events/ingest` and all public endpoints | P1 High | Phase 1 |
| E-10 | Add structured JSON logging middleware | P1 High | Phase 1 |
| E-11 | Add tenant registry table to D1 + sync from KV | P1 High | Phase 2 |
| E-12 | KV-backed balance cache with TTL (read-through pattern) | P1 High | Phase 2 |
| E-13 | Add dead-letter and replay mechanism for failed events | P2 Medium | Phase 2 |
| E-14 | Add payout request endpoint for operator withdrawals | P2 Medium | Phase 2 |
| E-15 | Add HMAC signature verification for inter-service requests | P2 Medium | Phase 2 |
| E-16 | Add vitest.config.ts + integration test setup with Miniflare | P2 Medium | Phase 2 |
| E-17 | Add lint (ESLint) script and enforce in CI | P2 Medium | Phase 2 |
| E-18 | Add per-tenant configurable commission rates | P2 Medium | Phase 2 |
| E-19 | Add commission reversal on `transport.booking.refunded` | P2 Medium | Phase 2 |
| E-20 | Add operator financial summary endpoint with date-range filters | P2 Medium | Phase 2 |

---

## 5. BUG FIX RECOMMENDATIONS

| Bug ID | Description | File | Severity |
|--------|------------|------|---------|
| BUG-01 | `LedgerService.recordTransaction()` never writes to D1 (commented-out batch) | `src/modules/ledger/core.ts:69-73` | Critical |
| BUG-02 | `AffiliateSystem.getAffiliate()` always returns mock data, never queries D1 | `src/modules/affiliate/core.ts:72-85` | Critical |
| BUG-03 | Ledger entries missing `tenant_id` — cross-tenant data leakage | `migrations/001_central_mgmt_schema.sql:14-25` | Critical |
| BUG-04 | `worker.ts` and `LedgerService`/`AffiliateSystem` are completely disconnected — two independent ledger write paths | `src/worker.ts`, `src/modules/ledger/core.ts` | Critical |
| BUG-05 | CI/CD: `|| true` on lint, test, build — failures never block deployment | `.github/workflows/deploy.yml:34,37,40,67,121` | Critical |
| BUG-06 | Post-deploy check uses INTER_SERVICE_SECRET as JWT bearer for `/api/ledger/summary` — always returns 401, silently ignored | `.github/workflows/deploy.yml:150-155` | High |
| BUG-07 | GitHub Release notes refer to `/api/events/ingest` but actual path is `/events/ingest` | `.github/workflows/deploy.yml:173` | Medium |
| BUG-08 | `GET /api/ledger/entries`: query parameter `eventType` maps to `account_type` column filter but variable is named `eventType` — misleading and inconsistent | `src/worker.ts:208-209` | Medium |
| BUG-09 | No staging D1/KV bindings in `wrangler.toml` — staging deploy would bind to production DB | `wrangler.toml` | High |
| BUG-10 | No `lint` script in `package.json` — CI lint step silently passes (command not found, exits 0 with `|| true`) | `package.json:6-12` | Medium |
| BUG-11 | `SuperAdminService.provisionTenant()` defaults `createdAt: new Date()` — but KV serializes Date as ISO string; on deserialization, `createdAt` is a string not a `Date` | `src/modules/super-admin/core.ts:37` | Medium |
| BUG-12 | Missing `vitest.config.ts` — tests rely on default Vitest config; Workers globals (`crypto.randomUUID`) may not be available in test environment | repo root | Medium |

---

## 6. TASK BREAKDOWN

---

### TASK-01: Fix LedgerService — Wire D1 Writes (BUG-01)

**Title:** Implement real D1 persistence in `LedgerService.recordTransaction()`

**Objective:** Replace the commented-out D1 batch writes in `LedgerService` with real, atomic D1 `.batch()` calls. The module must write both debit and credit entries atomically.

**Why It Matters:** The ledger module is the financial backbone of the platform. The current implementation is a no-op — nothing is persisted. All financial integrity guarantees are void until this is fixed.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:**
- D1 type definitions from `@cloudflare/workers-types`
- Migration `001_central_mgmt_schema.sql` must be applied

**Prerequisites:**
- TASK-02 (add tenant_id to ledger_entries) should be applied first, or run concurrently

**Impacted Modules:** `src/modules/ledger/core.ts`, `src/modules/ledger/core.test.ts`

**Likely Files to Change:**
- `src/modules/ledger/core.ts` — uncomment and implement `this.db.batch([...])` in `recordTransaction()`
- `src/modules/ledger/core.ts` — update `LedgerEntry` interface to use `D1Database` type properly
- `src/modules/ledger/core.test.ts` — update tests to mock D1 `batch()` and `prepare().bind().run()` and verify DB calls

**Expected Output:** `LedgerService.recordTransaction()` issues a `D1Database.batch([debitStmt, creditStmt])` call. `holdInEscrow()` and `releaseFromEscrow()` persist their entries. All existing tests pass with updated mocks.

**Acceptance Criteria:**
1. `recordTransaction()` calls `this.db.batch([stmt1, stmt2])` atomically
2. Each statement maps to the `ledger_entries` table schema (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
3. `holdInEscrow()` and `releaseFromEscrow()` delegate to `recordTransaction()` correctly
4. Unit tests mock D1's `batch()` and assert it was called with correct arguments
5. TypeScript compiles without errors

**Tests Required:**
- Unit: mock `D1Database` with `jest.fn()` / `vi.fn()`, assert `batch()` is called with correct SQL and bindings
- Unit: assert non-integer amounts throw
- Unit: assert zero/negative amounts throw

**Risks:** If TASK-02 is not done first, the `tenant_id` column will be missing and INSERT will fail. Coordinate ordering.

**Governance Docs:** Blueprint Part 10.1, Part 9.2 (Monetary Integrity)

**Important Reminders:**
- All amounts must remain integer kobo; never divide without `Math.round()`
- D1 batch = atomic; any failure rolls back both entries
- IDs must use `crypto.randomUUID()` — do not use `Date.now()` as primary key

---

### TASK-02: Add `tenant_id` to `ledger_entries` (BUG-03)

**Title:** Add `tenant_id` column to `ledger_entries` via D1 migration

**Objective:** Add a `tenant_id TEXT` column to `ledger_entries` and a covering index. Update `worker.ts` insert statements and `LedgerService` to include `tenant_id`. Update the ledger query endpoints to filter by tenant.

**Why It Matters:** Without `tenant_id`, all operators' financial data is commingled. A query for "operator A's balance" will return combined results for all tenants — a serious multi-tenancy and security violation.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** None (prerequisite for TASK-01, TASK-06)

**Impacted Modules:** `migrations/`, `src/worker.ts`, `src/modules/ledger/core.ts`

**Likely Files to Change:**
- `migrations/002_add_tenant_id_to_ledger.sql` — new migration file: `ALTER TABLE ledger_entries ADD COLUMN tenant_id TEXT;` + index
- `src/worker.ts` — update all `INSERT INTO ledger_entries` to include `tenant_id`
- `src/modules/ledger/core.ts` — add `tenantId` to `LedgerEntry` interface and `recordTransaction()` signature
- `src/worker.ts` — update `GET /api/ledger/entries` and `GET /api/ledger/summary` to accept and apply `tenant_id` filter

**Expected Output:** Every ledger entry has a `tenant_id`. All admin queries can filter by tenant. Migration applies cleanly to existing data (existing rows get NULL tenant_id, which is acceptable).

**Acceptance Criteria:**
1. Migration file `002_` exists and uses `ALTER TABLE ... ADD COLUMN tenant_id TEXT`
2. All INSERT statements in worker.ts include `tenant_id`
3. `GET /api/ledger/entries?tenant_id=X` filters by tenant
4. `GET /api/ledger/summary?tenant_id=X` groups by tenant
5. TypeScript compiles

**Tests Required:**
- Unit: assert LedgerEntry interface includes tenantId
- Integration: apply migration in local Miniflare and verify column exists

**Risks:** Existing production rows will have NULL tenant_id — this is acceptable (add NOT NULL constraint only in a future migration after backfill)

**Governance Docs:** Blueprint Part 9.3 (RBAC / Multi-Tenancy)

---

### TASK-03: Scaffold `affiliates` D1 Table and Wire AffiliateSystem to D1 (BUG-02 + E-03)

**Title:** Create `affiliates` migration and implement real D1 queries in `AffiliateSystem`

**Objective:** Create a D1 migration for the `affiliates` table, expose CRUD endpoints, and replace the hardcoded mock data in `AffiliateSystem.getAffiliate()` with a real D1 query.

**Why It Matters:** The affiliate module is the commission engine. It is entirely mocked — no real data can be stored or retrieved. The commission calculation loop reads from mock data every time, making the feature completely non-functional.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** `@cloudflare/workers-types` (D1Database), TASK-02 (for coordinated migration numbering)

**Impacted Modules:** `migrations/`, `src/modules/affiliate/core.ts`, `src/worker.ts`

**Likely Files to Change:**
- `migrations/003_affiliates_schema.sql` — new table: `affiliates(id, user_id, parent_id, tenant_id, level, commission_rate_bps, status, created_at)`
- `src/modules/affiliate/core.ts` — replace mock `getAffiliate()` with `this.db.prepare('SELECT * FROM affiliates WHERE id = ?').bind(id).first()`
- `src/modules/affiliate/core.ts` — add `createAffiliate()`, `getAffiliatesByTenant()`, `getAffiliateTree()` methods
- `src/worker.ts` — add `POST /api/affiliates`, `GET /api/affiliates`, `GET /api/affiliates/:id/tree` routes
- `src/modules/affiliate/core.test.ts` — update tests to mock D1 queries

**Expected Output:** The `affiliates` table exists in D1. `AffiliateSystem.getAffiliate()` queries D1. New HTTP endpoints allow creating and listing affiliates. Commission splits query real data.

**Acceptance Criteria:**
1. Migration creates `affiliates` table with columns: id, user_id, parent_id, tenant_id, level (1-5), commission_rate_bps (integer basis points), status, created_at
2. `getAffiliate()` issues `db.prepare(...).bind(id).first<AffiliateNode>()`
3. `calculateSplits()` works with real D1 data
4. `POST /api/affiliates` — create a new affiliate node (super_admin only)
5. `GET /api/affiliates` — list affiliates for a tenant (admin+)
6. TypeScript compiles
7. Circular reference guard: a node cannot be its own parent

**Tests Required:**
- Unit: mock D1 `prepare().bind().first()` and assert `getAffiliate()` calls it
- Unit: test `calculateSplits()` with mock D1 returning a 5-level tree
- Unit: test circular reference guard

**Risks:** Level numbering: the existing mock uses absolute level numbers (1-5), but `calculateSplits()` uses relative traversal depth. Clarify which model to use and document in code.

**Important Reminders:** Store `commission_rate_bps` as integer basis points (e.g., 500 = 5%) not float — consistent with kobo convention

**Governance Docs:** Blueprint Part 10.1 (MGMT-3), Part 9.2

---

### TASK-04: Expose Super-Admin HTTP Routes (E-04)

**Title:** Add MGMT-1 super-admin HTTP endpoints to `worker.ts`

**Objective:** Add a protected `/api/super-admin/` route group to `worker.ts` that exposes tenant provisioning, module toggling, and feature flag management via `SuperAdminService`.

**Why It Matters:** MGMT-1 is listed as implemented and passed QA in the Phase 2 QA Report, but there are zero HTTP endpoints for it in `worker.ts`. The super-admin functionality is completely inaccessible via the API.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** `@webwaka/core` `jwtAuthMiddleware`, `requireRole`; TASK-11 (tenant D1 registry) recommended but not required

**Impacted Modules:** `src/worker.ts`, `src/modules/super-admin/core.ts`

**Likely Files to Change:**
- `src/worker.ts` — add routes:
  - `POST /api/super-admin/tenants` — provision a new tenant (super_admin role only)
  - `GET /api/super-admin/tenants` — list all tenants (super_admin role only)
  - `GET /api/super-admin/tenants/:tenantId` — get tenant config (super_admin role only)
  - `PUT /api/super-admin/tenants/:tenantId/modules/:moduleName` — toggle module (super_admin role only)
  - `PUT /api/super-admin/tenants/:tenantId/flags/:flagName` — toggle feature flag (super_admin role only)
  - `DELETE /api/super-admin/tenants/:tenantId` — suspend tenant (super_admin role only)
- `src/modules/super-admin/core.ts` — add `suspendTenant()`, `listTenants()`, `getTenant()` methods
- Add Zod validation schemas for request bodies

**Expected Output:** All MGMT-1 operations are accessible via authenticated HTTP endpoints.

**Acceptance Criteria:**
1. All endpoints require JWT auth with `super_admin` role
2. Provisioning generates a unique `tenant_id` and writes to KV
3. Module toggle updates KV correctly
4. Feature flag toggle updates KV correctly
5. `GET /api/super-admin/tenants` uses `PLATFORM_KV.list()` to enumerate tenants
6. All responses follow `{ success: true, data: {...} }` envelope
7. TypeScript compiles

**Tests Required:**
- Unit: test each `SuperAdminService` method with mocked KV
- Integration: test HTTP routes return correct status codes and bodies

**Governance Docs:** Blueprint Part 10.1 (MGMT-1), Part 9.3 (RBAC)

---

### TASK-05: Fix CI/CD — Remove `|| true` from Critical Steps (BUG-05)

**Title:** Enforce hard failures on lint, test, and build in GitHub Actions

**Objective:** Remove `|| true` from all critical CI steps so that TypeScript errors, test failures, and lint errors block deployment.

**Why It Matters:** The current CI pipeline will deploy broken code to production. A worker with TypeScript type errors, failing tests, or lint violations can pass through all gates. This defeats the entire purpose of CI/CD.

**Repo Scope:** `webwaka-central-mgmt` only (CI/CD config)

**Dependencies:** TASK-17 (add lint script) must be done concurrently, otherwise the lint step will fail on a missing script

**Impacted Modules:** `.github/workflows/deploy.yml`

**Likely Files to Change:**
- `.github/workflows/deploy.yml`:
  - Line 34: `npx tsc --noEmit || true` → `npx tsc --noEmit`
  - Line 37: `npm run lint || true` → `npm run lint`
  - Line 40: `npm test || true` → `npm test`
  - Line 67: `npm run build || true` → `npm run build`
  - Line 121: `npm run build || true` → `npm run build`
  - Lines 74-77, 127-131: Remove `continue-on-error: true` from D1 migration steps
  - Lines 150-155: Fix post-deploy check — use valid JWT or separate health check endpoint
- `package.json` — add `lint` script (see TASK-17)

**Expected Output:** A commit with a failing test or TypeScript error will fail CI and block deployment.

**Acceptance Criteria:**
1. Removing `|| true` from tsc, lint, test, build steps
2. D1 migration step does not have `continue-on-error: true`
3. Post-deploy check uses the correct `/health` endpoint or a valid auth mechanism
4. A forced test failure (add one bad test temporarily) causes CI to fail
5. Lint step has a real command to execute

**Tests Required:** Manually or via a test PR, verify that a broken TypeScript file fails CI

**Risks:** Short-term: if existing codebase has lint or type errors, CI will fail. All existing errors must be fixed before enabling hard fails.

**Governance Docs:** CI/CD Native Development invariant

---

### TASK-06: Integrate Modules into `worker.ts` Routes (E-06)

**Title:** Replace inline SQL in `worker.ts` with calls to `LedgerService` and `AffiliateSystem`

**Objective:** Refactor `worker.ts` to instantiate `LedgerService(c.env.DB)` and `AffiliateSystem(c.env.DB)` and delegate all ledger write operations to those modules. Remove the duplicate inline SQL in the event ingestion handler.

**Why It Matters:** Currently there are two independent ledger write paths: `worker.ts` inline SQL and `LedgerService`. These will diverge over time. Module integration ensures all business logic is testable, reusable, and consistent.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-01 (LedgerService must write to D1 first), TASK-02 (tenant_id migration)

**Impacted Modules:** `src/worker.ts`, `src/modules/ledger/core.ts`

**Likely Files to Change:**
- `src/worker.ts` — replace inline SQL in `/events/ingest` handler with `LedgerService` method calls
- `src/modules/ledger/core.ts` — add event-specific methods: `recordBookingConfirmed()`, `recordBookingRefunded()`, `recordOrderPaid()`, `recordPayoutProcessed()` as higher-level wrappers
- `src/modules/ledger/core.test.ts` — add tests for new event-specific methods

**Expected Output:** `worker.ts` is clean of direct SQL. All ledger operations go through `LedgerService`.

**Acceptance Criteria:**
1. `/events/ingest` calls `LedgerService` methods, no raw SQL
2. `LedgerService` has named methods for each event type
3. Tests cover each event-type method
4. Behavior is identical to the current inline SQL

---

### TASK-07: Trigger Affiliate Commission Splits from Event Processing (E-07)

**Title:** Compute and persist affiliate commission splits when processing `transport.booking.confirmed`

**Objective:** When a `transport.booking.confirmed` event is ingested, after recording the platform fee ledger entry, call `AffiliateSystem.calculateSplits()` to compute commission splits and persist each split as a ledger entry.

**Why It Matters:** Affiliate commissions are a core revenue-sharing feature. They are never calculated or persisted for real events — the commission system exists only in unit tests.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-01, TASK-03, TASK-06

**Impacted Modules:** `src/worker.ts`, `src/modules/affiliate/core.ts`, `src/modules/ledger/core.ts`

**Likely Files to Change:**
- `src/worker.ts` — in `transport.booking.confirmed` handler: extract `affiliate_id` from payload, call `affiliateSystem.calculateSplits(amountKobo, affiliateId)`, then call `ledgerService.recordAffiliateCommission(split)` for each split
- `src/modules/ledger/core.ts` — add `recordAffiliateCommission(split, tenantId, sourceTransactionId)` method
- `migrations/003_affiliates_schema.sql` — ensure affiliate commission ledger entries are identifiable by `account_type = 'affiliate'`

**Expected Output:** For every `transport.booking.confirmed` event with an `affiliate_id` in the payload, the system creates commission ledger entries for all upstream affiliates.

**Acceptance Criteria:**
1. `transport.booking.confirmed` handler checks for `payload.affiliate_id`
2. If present, calls `calculateSplits()` with the booking amount
3. Each split result creates a ledger entry with `account_type='affiliate'`, `account_id=split.affiliateId`
4. Split entries share the same `transaction_id` as the booking entries
5. If `affiliate_id` is absent, no error — silently skips affiliate processing

---

### TASK-08: Add Zod Validation to All Request Bodies (E-08)

**Title:** Add `@hono/zod-validator` to all POST/PUT request handlers and query param parsing

**Objective:** Install `zod` and `@hono/zod-validator`, define schemas for all request bodies and query parameters, and replace all manual `body.field` accesses with schema-validated, typed values.

**Why It Matters:** Currently, `worker.ts` has minimal validation. The `/events/ingest` handler only checks `event_type` and `aggregate_id` presence. Any malformed payload (e.g., `amount_kobo: "abc"`) will cause a downstream SQL error instead of a clean 400.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** None

**Impacted Modules:** `src/worker.ts`, `package.json`

**Likely Files to Change:**
- `package.json` — add `zod`, `@hono/zod-validator` to dependencies
- `src/worker.ts` — define Zod schemas for each endpoint, use `zValidator()` middleware
- Create `src/schemas/events.ts`, `src/schemas/ledger.ts`, `src/schemas/affiliate.ts` for schema definitions

**Expected Output:** All endpoints return `400 { success: false, error: "..." }` with a descriptive validation error message when given invalid input.

**Acceptance Criteria:**
1. `zod` and `@hono/zod-validator` installed and in `package.json`
2. `/events/ingest` validates: event_type (enum), aggregate_id (string), timestamp (number), payload (object), tenant_id (string, optional)
3. `GET /api/ledger/entries` validates: limit (1-200), offset (>=0), account_id (string optional), tenant_id (string optional)
4. All Zod schemas in dedicated `src/schemas/` files
5. TypeScript compiles

---

### TASK-09: Add Rate Limiting to Public and Ingest Endpoints (E-09)

**Title:** Implement rate limiting on `/events/ingest` and health endpoints

**Objective:** Add Cloudflare Workers rate limiting using the Cloudflare Rate Limiting API or a KV-based token bucket to prevent abuse of the event ingestion endpoint.

**Why It Matters:** `/events/ingest` accepts unauthenticated (or weakly authenticated) requests in bulk. Without rate limiting, a compromised INTER_SERVICE_SECRET or misconfigured upstream service could flood the ledger with thousands of events per second, exhausting D1 write capacity.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** Cloudflare KV (already available), or Cloudflare Rate Limiting API (requires Cloudflare account setup)

**Impacted Modules:** `src/worker.ts`, `wrangler.toml`

**Likely Files to Change:**
- `wrangler.toml` — add `[[unsafe.bindings]]` for rate limiting, or add a new KV namespace for rate tracking
- `src/worker.ts` — add rate limiting middleware using `c.env.PLATFORM_KV` as a counter store, or use the Cloudflare `RateLimit` binding
- Create `src/middleware/rateLimit.ts` with a token bucket or sliding window implementation

**Expected Output:** `/events/ingest` returns `429 Too Many Requests` when called more than N times per minute from the same IP or with the same INTER_SERVICE_SECRET.

**Acceptance Criteria:**
1. Rate limiter applies to `/events/ingest` at minimum
2. Configurable limit (e.g., 100 requests/minute per IP)
3. Returns standard `429` with `Retry-After` header
4. Rate limit state uses KV or Cloudflare built-in
5. TypeScript compiles

---

### TASK-10: Add Structured JSON Logging Middleware (E-10)

**Title:** Implement structured JSON logging for all requests and errors

**Objective:** Add a Hono middleware that emits a structured JSON log line for every request (method, path, status, duration, tenant_id) and for every error (message, stack, event_id).

**Why It Matters:** Currently there are scattered `console.error` calls with unstructured strings. In a production Cloudflare Worker, logs go to Workers Logpush or tail. Without structure, searching logs for a specific tenant's event is impossible.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** None

**Impacted Modules:** `src/worker.ts`

**Likely Files to Change:**
- `src/middleware/logger.ts` — new file: structured request logger
- `src/middleware/errorHandler.ts` — new file: global error handler
- `src/worker.ts` — `app.use('*', logger())` and `app.use('*', errorHandler())`

**Expected Output:** Every request emits `{"level":"info","method":"POST","path":"/events/ingest","status":200,"duration_ms":45,"tenant_id":"...","ts":1234567890}`. Every error emits `{"level":"error","msg":"...","stack":"...","event_id":"..."}`.

**Acceptance Criteria:**
1. Logger middleware applied globally before routes
2. Log format is valid JSON on a single line
3. Authorization headers are never logged
4. Error handler catches unhandled exceptions and emits structured error log
5. TypeScript compiles

---

### TASK-11: Add Tenant Registry to D1 (E-11)

**Title:** Create `tenants` D1 table as source of truth; sync KV from D1

**Objective:** Add a `tenants` table migration. Update `SuperAdminService` to write to D1 first, then update KV as a cache. Add a `GET /api/super-admin/tenants` endpoint that queries D1 for a full, paginated tenant list.

**Why It Matters:** KV cannot be queried efficiently. `PLATFORM_KV.list()` only returns keys, not values, and cannot filter or paginate. As the platform grows to hundreds of tenants, listing/searching tenants from KV becomes intractable.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-04 (super-admin endpoints), TASK-02 (migration numbering)

**Impacted Modules:** `migrations/`, `src/modules/super-admin/core.ts`

**Likely Files to Change:**
- `migrations/004_tenants_schema.sql` — table: `tenants(id, name, status, enabled_modules_json, feature_flags_json, created_at, updated_at)`
- `src/modules/super-admin/core.ts` — update `provisionTenant()` to write D1 then KV; add `listTenants()` querying D1
- `src/modules/super-admin/core.test.ts` — update tests to mock both DB and KV

**Acceptance Criteria:**
1. Migration creates `tenants` table
2. `provisionTenant()` writes to D1 first, then KV
3. `toggleModule()` and `toggleFeatureFlag()` update both D1 and KV
4. `listTenants()` queries D1 with pagination
5. KV is treated as a read-through cache with 300s TTL
6. TypeScript compiles

---

### TASK-12: KV Balance Cache with TTL (E-12)

**Title:** Cache ledger balance summaries in KV with TTL for fast reads

**Objective:** After every successful ledger write, update a KV key `balance:${tenantId}:${accountId}` with the current balance and a 60-second TTL. The `GET /api/ledger/summary` endpoint reads from KV first, falling back to D1.

**Why It Matters:** The current `GET /api/ledger/summary` aggregates over the entire `ledger_entries` table on every request. As the ledger grows to millions of rows, this D1 full-scan will become too slow.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-01, TASK-06

**Impacted Modules:** `src/modules/ledger/core.ts`, `src/worker.ts`

**Likely Files to Change:**
- `src/modules/ledger/core.ts` — add `updateBalanceCache(kv, tenantId, accountId, deltaCreditKobo, deltaDebitKobo)` method
- `src/worker.ts` — add `PLATFORM_KV` to `LedgerService` constructor; call `updateBalanceCache` after writes
- `src/worker.ts` — update `GET /api/ledger/summary` to check KV first

**Acceptance Criteria:**
1. After a ledger write, KV key `balance:${tenantId}:${accountId}` is updated
2. KV entry has 60s TTL
3. Summary endpoint reads from KV when available, D1 when not
4. Cache invalidation on refund/reversal

---

### TASK-13: Dead-Letter and Event Replay Mechanism (E-13)

**Title:** Add dead-letter state and admin replay endpoint for failed event processing

**Objective:** When event processing fails (DB error, invalid payload), update `central_mgmt_events.processed = 2` (failed) and store the error message. Add an admin endpoint `POST /api/events/replay` to retry failed events.

**Why It Matters:** Currently, if a ledger INSERT fails mid-processing, the event is marked as `processed = 1` (or partially processed), and the error is logged to console but not stored. There is no way to recover failed events.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-10 (structured logging), TASK-06

**Impacted Modules:** `src/worker.ts`, `migrations/`, `src/modules/ledger/core.ts`

**Likely Files to Change:**
- `migrations/005_event_dead_letter.sql` — alter `central_mgmt_events` to add `error_message TEXT`, update `processed` check constraint to allow value `2`
- `src/worker.ts` — in the catch block of event processing: update event to `processed=2`, store `error_message`
- `src/worker.ts` — add `POST /api/events/replay` — re-queues `processed=2` events; admin only

**Acceptance Criteria:**
1. Failed events set `processed=2` and store error_message
2. `GET /api/events?status=failed` returns failed events
3. `POST /api/events/replay` re-processes failed events
4. Replay is idempotent — re-checking `source_event_id` unique constraint prevents double-processing

---

### TASK-14: Payout Request Endpoint (E-14)

**Title:** Add `POST /api/payouts/request` endpoint for operator withdrawal requests

**Objective:** Add an endpoint allowing authenticated operators to request a payout from their ledger balance. Create a `payout_requests` table, validate the requested amount against the operator's cleared balance, and emit an event for processing by the finance team.

**Why It Matters:** The platform collects operator revenue but has no mechanism for operators to withdraw it. Without this, the platform cannot complete the money-out flow.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-01, TASK-02, TASK-12

**Impacted Modules:** `migrations/`, `src/worker.ts`, `src/modules/ledger/core.ts`

**Likely Files to Change:**
- `migrations/006_payout_requests.sql` — table: `payout_requests(id, operator_id, tenant_id, amount_kobo, currency, status, bank_details_json, requested_at, processed_at)`
- `src/worker.ts` — `POST /api/payouts/request` — validate balance, create payout request, create `pending` ledger entry
- `src/worker.ts` — `GET /api/payouts` — list payout requests for a tenant (admin+)
- `src/worker.ts` — `PUT /api/payouts/:id/approve` — super_admin approves; transitions to cleared (Phase 2)

**Acceptance Criteria:**
1. Request validates that requested amount ≤ operator's cleared balance
2. Creates a `payout_request` record
3. Creates a `pending` ledger debit entry for the operator account
4. Returns `202 Accepted` with the payout_request_id
5. If insufficient balance, returns `422 Unprocessable Entity`

---

### TASK-15: HMAC Signature Verification for Inter-Service Requests (E-15)

**Title:** Replace plain-bearer INTER_SERVICE_SECRET with HMAC-signed request verification

**Objective:** Upgrade inter-service authentication from a static bearer token to HMAC-SHA256 request signing. The sender hashes the request body with the shared secret; the receiver verifies the signature.

**Why It Matters:** A static bearer token in transit is vulnerable to replay attacks. HMAC signatures tie authentication to the specific payload — replaying an intercepted request with a modified payload will fail verification.

**Repo Scope:** `webwaka-central-mgmt` only (receive side)

**Dependencies:** Coordinate with `webwaka-transport` and `webwaka-commerce` (they must implement the signing side)

**Impacted Modules:** `src/worker.ts`, `src/middleware/`

**Likely Files to Change:**
- `src/middleware/hmacAuth.ts` — new file: `verifyHmacSignature(secret, body, signature)` using `SubtleCrypto`
- `src/worker.ts` — update `/events/ingest` to use HMAC verification instead of plain bearer check
- Add `X-WebWaka-Signature` header convention to docs

**Acceptance Criteria:**
1. `verifyHmacSignature()` uses Web Crypto API (`SubtleCrypto.sign`) — no external dependencies
2. Request must include `X-WebWaka-Signature: sha256=<hex>` header
3. Signature computed as HMAC-SHA256 of raw request body with `INTER_SERVICE_SECRET`
4. Invalid signature returns `401`
5. Backward-compatible mode: also accept plain bearer token during transition (controlled by feature flag)

---

### TASK-16: Add vitest.config.ts and Integration Test Infrastructure (E-16)

**Title:** Add `vitest.config.ts` with Cloudflare Workers test environment

**Objective:** Add `vitest.config.ts` using `@cloudflare/vitest-pool-workers` to run tests in a real Miniflare environment, enabling integration tests that use real D1 and KV bindings.

**Why It Matters:** All current tests mock everything. There is no test that actually writes to D1 and reads back. A real integration test would have caught BUG-01 (LedgerService never writing to D1) immediately.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** `@cloudflare/vitest-pool-workers` package

**Impacted Modules:** `vitest.config.ts`, `src/modules/ledger/core.test.ts`, `src/modules/affiliate/core.test.ts`

**Likely Files to Change:**
- `vitest.config.ts` — configure `@cloudflare/vitest-pool-workers` with a test `wrangler.toml`
- `wrangler.test.toml` — local D1/KV bindings for test environment
- `src/modules/ledger/integration.test.ts` — write-then-read integration test
- `src/modules/affiliate/integration.test.ts` — create affiliate, calculate splits integration test
- `package.json` — add `@cloudflare/vitest-pool-workers` to devDependencies

**Acceptance Criteria:**
1. `vitest.config.ts` exists and configures Workers test pool
2. `npm test` runs both unit and integration tests
3. Integration tests spin up real D1 in Miniflare
4. At least one integration test verifies ledger write + read
5. At least one integration test verifies affiliate create + split calculation

---

### TASK-17: Add ESLint Configuration and Lint Script (E-17)

**Title:** Add ESLint with TypeScript support and enforce in CI

**Objective:** Install ESLint with `@typescript-eslint/parser` and `@typescript-eslint/eslint-plugin`. Add `"lint": "eslint src/**/*.ts"` to `package.json`. Fix all existing lint errors.

**Why It Matters:** There is no `lint` script in `package.json`. The CI step `npm run lint || true` runs a non-existent script and silently passes. ESLint would have caught several issues in the codebase (e.g., `any` types on DB bindings, unused imports).

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** Must be done before TASK-05 (CI hardening) removes `|| true`

**Impacted Modules:** `package.json`, `.eslintrc.cjs`, all `src/**/*.ts`

**Likely Files to Change:**
- `package.json` — add ESLint devDependencies and `"lint"` script
- `.eslintrc.cjs` — TypeScript ESLint config with Workers-appropriate rules
- `src/**/*.ts` — fix all resulting lint errors (primarily `any` types)

**Acceptance Criteria:**
1. `npm run lint` exits 0 on clean code
2. `npm run lint` exits 1 on a file with a linting error
3. `@typescript-eslint/no-explicit-any` is a warning (not error — `any` is used for D1 types intentionally)
4. ESLint config checked into the repo

---

### TASK-18: Per-Tenant Configurable Commission Rates (E-18)

**Title:** Make affiliate commission rates tenant-configurable via `PLATFORM_KV`

**Objective:** Instead of hardcoded commission rates (5%, 3%, 2%, 1%, 0.5%) on the `affiliates.commission_rate_bps` column, allow tenants to configure per-level default rates in their KV config. Individual affiliates can override.

**Why It Matters:** Different WebWaka verticals and operators will have different commission structures. Hardcoding rates in the database for each affiliate makes rate changes operationally expensive.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-03, TASK-04

**Impacted Modules:** `src/modules/affiliate/core.ts`, `src/modules/super-admin/core.ts`

**Likely Files to Change:**
- `src/modules/super-admin/core.ts` — add `commission_rates` to `TenantConfig` interface: `{ level1Bps: number, level2Bps: number, ... }`
- `src/modules/affiliate/core.ts` — update `calculateSplits()` to accept `tenantConfig` and use default level rates when affiliate `commission_rate_bps` is null
- `src/modules/super-admin/core.ts` — add `setCommissionRates(tenantId, rates)` method
- `src/worker.ts` — fetch tenant config from KV before calling `calculateSplits()`

**Acceptance Criteria:**
1. `TenantConfig` includes `commissionRates: { [level: number]: number }` in basis points
2. `calculateSplits()` falls back to tenant-level rates when affiliate rate is null
3. `PUT /api/super-admin/tenants/:id/commission-rates` updates KV config
4. Commission rates stored as integers (bps)

---

### TASK-19: Commission Reversal on `transport.booking.refunded` (E-19)

**Title:** Cascade commission reversals when a booking is refunded

**Objective:** When a `transport.booking.refunded` event is received, look up all affiliate commission ledger entries for the original `booking_id` and create reversal debit entries for each affiliate.

**Why It Matters:** Currently, refunds only reverse the platform revenue entry. Affiliate commissions for the refunded booking are never reversed. This means affiliates retain commissions for transactions that were voided — a financial integrity violation.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-07, TASK-06

**Impacted Modules:** `src/worker.ts`, `src/modules/ledger/core.ts`

**Likely Files to Change:**
- `src/worker.ts` — in `transport.booking.refunded` handler: query `ledger_entries WHERE transaction_id = txn_trn_${bookingId} AND account_type = 'affiliate'`, create reversal entries
- `src/modules/ledger/core.ts` — add `reverseCommissions(transactionId, reversalTransactionId)` method
- `migrations/` — may need index on `(transaction_id, account_type)` for fast lookup

**Acceptance Criteria:**
1. Refund handler looks up original booking's affiliate ledger entries
2. Creates reversal debit entries for each affiliate commission
3. Reversal entries reference original transaction_id in metadata
4. If no affiliate commissions found, refund proceeds without error

---

### TASK-20: Operator Financial Summary with Date-Range Filters (E-20)

**Title:** Add `GET /api/operators/:operatorId/summary` with date-range and currency filters

**Objective:** Add a financial summary endpoint that returns an operator's total credits, debits, balance, and transaction count for a specified date range. Support `from`, `to`, `currency`, and `tenant_id` query parameters.

**Why It Matters:** Operators need to see their revenue for reporting periods (daily, weekly, monthly). The current `GET /api/ledger/summary` returns all-time totals with no date filtering and no per-operator scoping.

**Repo Scope:** `webwaka-central-mgmt` only

**Dependencies:** TASK-02 (tenant_id on ledger), TASK-01

**Impacted Modules:** `src/worker.ts`

**Likely Files to Change:**
- `src/worker.ts` — add `GET /api/operators/:operatorId/summary?from=&to=&currency=NGN` (admin+)
- `src/modules/ledger/core.ts` — add `getOperatorSummary(operatorId, tenantId, from, to, currency)` method
- Add index on `ledger_entries(account_id, account_type, created_at)` in a new migration if not present

**Acceptance Criteria:**
1. Endpoint accepts `from`, `to` as Unix timestamps (ms)
2. Returns: `total_credits_kobo`, `total_debits_kobo`, `balance_kobo`, `transaction_count`, `currency`
3. Validates `from < to`
4. Requires admin or super_admin role
5. Scoped by `tenant_id` from JWT claims

---

### TASK-21: Fix BUG-09 — Add Staging Bindings to `wrangler.toml`

**Title:** Add D1 and KV bindings for staging environment in `wrangler.toml`

**Objective:** Add `[env.staging]` section to `wrangler.toml` with dedicated staging D1 database ID and KV namespace ID so that staging deployments do not share production resources.

**Why It Matters:** Currently, if a staging deployment runs, it will bind to the production D1 database (using the top-level `[[d1_databases]]` binding) because there is no `[env.staging]` section. This is a catastrophic data risk.

**Repo Scope:** `webwaka-central-mgmt` only

**Impacted Files:** `wrangler.toml`

**Expected Output:** A complete `[env.staging]` block with separate `database_id` and KV `id` values. These IDs need to be provisioned via `wrangler d1 create` and `wrangler kv:namespace create` on Cloudflare.

---

### TASK-22: Fix BUG-11 — `TenantConfig.createdAt` Date Serialization

**Title:** Fix `TenantConfig.createdAt` type — store/parse as ISO string, not `Date`

**Objective:** Change `TenantConfig.createdAt` from `Date` to `string` (ISO-8601). Update `provisionTenant()` to store `new Date().toISOString()` and update all consumers to parse it correctly.

**Why It Matters:** `new Date()` is serialized as an ISO string in `JSON.stringify()`. On deserialization with `JSON.parse()`, it comes back as a string, not a `Date`. Code that calls `.getTime()` or `.toLocaleDateString()` on `TenantConfig.createdAt` will throw at runtime.

**Repo Scope:** `webwaka-central-mgmt` only

**Impacted Files:** `src/modules/super-admin/core.ts`, `src/modules/super-admin/core.test.ts`

---

### TASK-23: Fix BUG-08 — Rename Misleading `eventType` Variable in Ledger Query

**Title:** Fix misleading `eventType` query parameter mapped to `account_type` column

**Objective:** In `GET /api/ledger/entries`, rename the `eventType` query parameter to `account_type` to match the database column it actually filters. Update the API documentation accordingly.

**Repo Scope:** `webwaka-central-mgmt` only

**Impacted Files:** `src/worker.ts`

---

### TASK-24: Fix BUG-07 — Correct GitHub Release Notes Endpoint Path

**Title:** Fix documentation error in CI: `/api/events/ingest` → `/events/ingest`

**Objective:** Update the GitHub Release body in `deploy.yml` to reference the correct event ingestion endpoint path `/events/ingest` (not `/api/events/ingest`).

**Repo Scope:** `.github/workflows/deploy.yml`

---

### TASK-25: Fix BUG-12 — Add `vitest.config.ts` for Workers Globals

**Title:** Add minimal `vitest.config.ts` to configure test environment globals

**Objective:** Create `vitest.config.ts` that configures `globals: true` and sets the `environment` to `node` with polyfills for `crypto.randomUUID()`. This ensures tests don't fail due to missing Workers globals in a plain Node.js test environment.

**Repo Scope:** `webwaka-central-mgmt` only

**Impacted Files:** `vitest.config.ts`

---

## 7. QA PLANS

---

### QA-01: LedgerService D1 Integration

**What to Verify:**
- `recordTransaction()` issues exactly one `D1.batch([stmt1, stmt2])` call
- Debit entry has correct: accountId=fromAccountId, type='debit', amountKobo, transactionId
- Credit entry has correct: accountId=toAccountId, type='credit', amountKobo, transactionId (same as debit)
- Both entries have matching `transactionId`
- `holdInEscrow()` creates debit from `fromAccount` and credit to `escrowAccount`
- `releaseFromEscrow()` creates debit from `escrowAccount` and credit to `toAccount`
- Non-integer `amountKobo` throws
- Zero `amountKobo` throws
- Negative `amountKobo` throws

**Bugs to Look For:**
- Atomic writes: if the second insert fails, does the first get rolled back? (D1 `.batch()` is atomic — verify this)
- ID uniqueness: are two concurrent calls guaranteed to produce unique entry IDs?
- createdAt precision: millisecond timestamp vs second?

**Edge Cases:**
- Very large amounts (e.g., 10,000,000,000 kobo — ₦100M) — must stay within SQLite INTEGER range
- `fromAccountId === toAccountId` (same account debit/credit) — should this be allowed?
- `currency` values other than NGN — verify stored correctly

**Regression to Detect:**
- Existing unit tests still pass
- No change to `holdInEscrow` or `releaseFromEscrow` behavior

**Done Means:** 100% of unit tests pass. D1 batch is mocked and asserted. TypeScript compiles clean.

---

### QA-02: `tenant_id` Column Migration

**What to Verify:**
- Migration SQL uses `ALTER TABLE ledger_entries ADD COLUMN tenant_id TEXT;`
- Index is created: `CREATE INDEX IF NOT EXISTS idx_ledger_tenant_id ON ledger_entries(tenant_id);`
- Existing rows tolerate NULL `tenant_id` without error
- `GET /api/ledger/entries?tenant_id=X` returns only entries for tenant X
- `GET /api/ledger/summary?tenant_id=X` aggregates only for tenant X
- New ledger entries created by `/events/ingest` include `tenant_id` from event payload

**Edge Cases:**
- `tenant_id` is NULL for events that don't include it
- Query without `tenant_id` filter returns all records (super_admin only)

**Done Means:** Migration applies without error in local and staging. All ledger endpoints respect `tenant_id` filter.

---

### QA-03: Affiliates Table and D1-Wired AffiliateSystem

**What to Verify:**
- Migration creates `affiliates` table with all required columns
- `getAffiliate()` issues a real SQL query (verify mock calls `prepare().bind().first()`)
- `calculateSplits()` traverses the affiliate tree correctly when D1 returns real data
- 5-level hierarchy resolves correctly
- Tree termination works at the root node (parent_id IS NULL)
- Circular reference guard rejects a node with itself as parent

**Bugs to Look For:**
- Off-by-one: does level counting start at 1 or 0?
- Does the system correctly stop if an intermediate node is missing from D1?

**Edge Cases:**
- Empty affiliate tree (no parent for given ID) — returns single-element splits array
- Zero commission rate — split should be excluded (amount = 0)
- Very large tree depth (>5) — must cap at 5 levels

**Done Means:** Affiliate unit tests pass with D1 mocks. New CRUD endpoints return correct data. `calculateSplits()` produces verified commission amounts.

---

### QA-04: Super-Admin HTTP Routes

**What to Verify:**
- `POST /api/super-admin/tenants` requires `super_admin` JWT role
- Returns 403 with `admin` role
- Returns 401 with no JWT
- Returns 201 with valid payload, including the new tenant ID in response
- `GET /api/super-admin/tenants` lists all tenants
- `PUT /api/super-admin/tenants/:id/modules/:name` correctly enables/disables a module
- `PUT /api/super-admin/tenants/:id/flags/:name` correctly sets a feature flag
- Invalid tenant ID returns 404

**Edge Cases:**
- Duplicate tenant name — should it be allowed?
- `enabledModules` with unknown module names — validation or pass-through?
- Very long tenant names — what is the max length?

**Done Means:** All 5 super-admin endpoints return correct status codes and data. Auth enforcement verified at each route.

---

### QA-05: CI/CD Hardening

**What to Verify:**
- Add a TypeScript error intentionally, push to a branch, verify CI fails
- Add a failing test intentionally, push, verify CI fails
- Remove the intentional errors, verify CI passes
- Verify D1 migration step does not have `continue-on-error: true`
- Verify post-deploy health check hits the correct `/health` endpoint
- Verify GitHub Release notes contain correct endpoint paths

**Edge Cases:**
- What if wrangler is not authenticated in CI? Should fail loudly.
- What if migration was already applied? Should be idempotent (no error).

**Done Means:** CI fails on bad code; passes on clean code. No `|| true` suppressors present on critical steps.

---

### QA-06: Module Integration in worker.ts

**What to Verify:**
- `/events/ingest` with `transport.booking.confirmed` calls `LedgerService.recordTransaction()` (verify via mock)
- Inline SQL is removed from worker.ts event handler
- All existing event type handling is preserved with identical behavior
- Error handling in module methods propagates correctly to the HTTP response

**Regression:**
- Health check still returns 200
- All existing unit tests for worker.ts still pass
- No duplicate SQL execution paths

**Done Means:** `worker.ts` contains no raw `db.prepare(...)` calls except those delegated to module methods.

---

### QA-07: Affiliate Commission Splits from Events

**What to Verify:**
- `transport.booking.confirmed` with `payload.affiliate_id = 'aff_1'` creates commission ledger entries for all 5 levels
- `transport.booking.confirmed` without `affiliate_id` creates no affiliate entries (no error)
- Commission amounts are correct (5%, 3%, 2%, 1%, 0.5% of booking amount)
- All commission entries share `transaction_id` with the platform fee entry
- Commission entries have `account_type = 'affiliate'`

**Edge Cases:**
- Invalid `affiliate_id` (not in DB) — must log warning, not crash
- Affiliate tree with missing intermediate nodes — must handle gracefully

**Done Means:** Integration test creates a booking confirmed event and verifies 5 affiliate ledger entries are created.

---

### QA-08: Zod Validation

**What to Verify:**
- `/events/ingest` with `event_type: 12345` returns 400
- `/events/ingest` with `amount_kobo: "not-a-number"` in payload returns 400 (or is caught in processing)
- `/api/ledger/entries?limit=500` returns 400 (exceeds max 200)
- `/api/ledger/entries?offset=-1` returns 400
- Valid requests continue to return 200/201/etc.

**Edge Cases:**
- Missing required field vs. explicitly null — Zod distinguishes these
- `timestamp` field — too old, too far in future?

**Done Means:** All invalid inputs return 400 with a descriptive error. All valid inputs pass through.

---

### QA-09: Rate Limiting

**What to Verify:**
- Send 101 requests/minute to `/events/ingest` — request 101 returns 429
- After waiting 1 minute, requests succeed again
- Rate limit does not affect `/health`
- `Retry-After` header is present in 429 response

**Edge Cases:**
- Distributed requests from different IPs — are they rate-limited separately or together?
- Rate limit state accuracy in KV (eventual consistency may cause brief over-limit)

**Done Means:** 429 is returned after threshold. Service recovers after window expires.

---

### QA-10: Structured Logging

**What to Verify:**
- Every request logs a JSON line with: method, path, status, duration_ms, ts
- No Authorization header values appear in logs
- Error handler catches unhandled exceptions and logs structured error with stack

**Edge Cases:**
- 404 routes are logged
- Very large request bodies — duration is still measured correctly

**Done Means:** All log output is valid JSON. No secrets in logs.

---

### QA-11: Tenant Registry in D1

**What to Verify:**
- `provisionTenant()` writes to D1 first, then KV
- `listTenants()` queries D1 with pagination
- KV update happens after D1 commit
- Failure in KV update does not roll back D1 write
- `updatedAt` is refreshed on `toggleModule()` / `toggleFeatureFlag()`

**Done Means:** D1 is source of truth. KV is a cache. List endpoint returns paginated results from D1.

---

### QA-12: KV Balance Cache

**What to Verify:**
- After a ledger write, KV key `balance:${tenantId}:${accountId}` exists
- Key expires after 60 seconds (test with short TTL in test environment)
- Summary endpoint reads from KV when cache is warm
- Summary endpoint reads from D1 when cache is cold (key expired)
- Refund correctly invalidates/updates cache

**Done Means:** Cache hit verified. Cache miss falls back to D1. TTL confirmed.

---

### QA-13: Dead-Letter and Replay

**What to Verify:**
- Inject a DB error during event processing — event is marked `processed=2` with error message
- `GET /api/events?status=failed` returns the failed event
- `POST /api/events/replay` re-processes the failed event successfully
- Replayed event is not double-processed (idempotency check)

**Done Means:** Failed events are observable and recoverable.

---

### QA-14: Payout Request Endpoint

**What to Verify:**
- `POST /api/payouts/request` with amount > balance returns 422
- `POST /api/payouts/request` with valid amount creates payout_request and pending ledger entry
- `GET /api/payouts` returns the new request
- Only the requesting operator's own balance is used (no cross-tenant access)

**Done Means:** Payout requests are created, validated, and observable.

---

### QA-15: HMAC Signature Verification

**What to Verify:**
- Request with valid HMAC signature is accepted
- Request with invalid signature returns 401
- Request with tampered body (signature mismatch) returns 401
- Request with no signature header returns 401
- During transition: plain bearer token still accepted if flag enabled

**Done Means:** HMAC verification rejects replayed and tampered requests.

---

### QA-16: vitest.config.ts + Integration Tests

**What to Verify:**
- `npm test` runs without errors
- Integration tests use real D1 in Miniflare (not mocked)
- `LedgerService.recordTransaction()` integration test: write to D1, read back, verify data
- `AffiliateSystem` integration test: create affiliate in D1, call calculateSplits, verify result

**Done Means:** Integration tests pass in both `npm test` and CI.

---

### QA-17: ESLint

**What to Verify:**
- `npm run lint` exits 0 on clean codebase
- `npm run lint` exits 1 when a lint rule is violated (e.g., add `var x = 1` to a file)
- CI pipeline calls `npm run lint` and fails if it exits non-zero

**Done Means:** Lint is enforced in CI with hard failure.

---

### QA-18: Per-Tenant Commission Rates

**What to Verify:**
- Tenant provisioned with custom commission rates — splits use those rates
- Affiliate with explicit `commission_rate_bps` overrides the tenant default
- Commission rates stored as integers (bps)
- Changing commission rates via API takes effect for new events (not retroactively)

**Done Means:** Commission rates are tenant-configurable and correctly applied.

---

### QA-19: Commission Reversals

**What to Verify:**
- `transport.booking.refunded` for a booking that had affiliate commissions reverses all splits
- Reversal entries are debits on the affiliate account
- `transport.booking.refunded` for a booking with no affiliate commissions proceeds without error
- Reversal amount exactly matches original commission amount

**Done Means:** All affiliate commissions for refunded bookings are reversed in the ledger.

---

### QA-20: Operator Financial Summary

**What to Verify:**
- `GET /api/operators/:id/summary?from=X&to=Y` returns correct totals
- Date range filter correctly excludes entries outside the range
- `balance_kobo = total_credits_kobo - total_debits_kobo`
- Cross-tenant queries are blocked (tenant_id scoping)
- `from >= to` returns 400

**Done Means:** Summary endpoint returns accurate, scoped, date-filtered financial data.

---

### QA-21 through QA-25: Bug Fix QA

**QA-21 (BUG-09 Staging Bindings):** Verify staging deploy uses staging D1 ID, not production. Manual: deploy to staging branch, verify no production data is present.

**QA-22 (BUG-11 Date Serialization):** Verify `tenant.createdAt` is a string after KV round-trip. Unit test: provision tenant, serialize, deserialize, assert `typeof tenant.createdAt === 'string'`.

**QA-23 (BUG-08 Misleading Variable):** Verify `GET /api/ledger/entries?account_type=platform` correctly filters. Old `?eventType=` parameter should return 400 or be ignored.

**QA-24 (BUG-07 Release Notes):** Verify GitHub Release body contains `/events/ingest` not `/api/events/ingest`.

**QA-25 (BUG-12 vitest.config.ts):** Verify `npm test` runs in a new environment without Workers globals errors.

---

## 8. IMPLEMENTATION PROMPTS

---

### IMPL-PROMPT-01: Wire LedgerService to D1

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: This repo is ONE component of the WebWaka OS v4 multi-repo platform.
It depends on @webwaka/core for auth middleware. It is NOT standalone.
Before acting, read: src/modules/ledger/core.ts, migrations/001_central_mgmt_schema.sql,
src/worker.ts, docs/qa/PHASE_2_QA_REPORT.md, docs/SHARED_PRIMITIVES_ANALYSIS.md.
Also read the governance docs in this repo's docs/ directory.

OBJECTIVE:
Implement real D1 persistence in LedgerService.recordTransaction() in src/modules/ledger/core.ts.
Currently, the D1 batch write is commented out. This is BUG-01. Fix it.

CONTEXT:
- The ledger_entries table schema is in migrations/001_central_mgmt_schema.sql
- All monetary values must remain integer kobo (NGN × 100) — no floats, no division without Math.round()
- Both the debit and credit entries must be written in a single D1.batch([stmt1, stmt2]) call
- If the batch fails, neither entry should be persisted (atomicity)
- The LedgerEntry interface must be typed against the real D1Database, not `any`
- The LedgerService constructor takes `db: D1Database` from @cloudflare/workers-types

DEPENDENCIES:
- TASK-02 (tenant_id migration) must be completed first or concurrently
- If tenant_id is not yet in the schema, include it as a nullable column in INSERT statements

REQUIRED DELIVERABLES:
1. src/modules/ledger/core.ts — uncomment and complete the D1 batch write in recordTransaction()
2. Update LedgerEntry interface with all fields from the DB schema including tenant_id
3. Update recordTransaction() signature to accept optional tenantId: string
4. Update holdInEscrow() and releaseFromEscrow() to pass tenantId through
5. src/modules/ledger/core.test.ts — update tests to mock D1 batch() and assert it is called with correct SQL and bindings

ACCEPTANCE CRITERIA:
- recordTransaction() calls this.db.batch([debitStmt, creditStmt])
- debit entry: id, transaction_id, account_id=fromAccountId, account_type, type='debit', amount_kobo, currency, status='cleared', metadata_json, created_at
- credit entry: same transaction_id, account_id=toAccountId, type='credit'
- Non-integer or zero/negative amountKobo throws
- Unit tests mock D1 batch and assert it was called
- TypeScript compiles without errors

IMPORTANT REMINDERS:
- Build Once Use Infinitely: this LedgerService must be the single ledger write path — not duplicated in worker.ts
- Nigeria-First: currency defaults to 'NGN', amounts in kobo
- Event-Driven: do not access other services' databases directly
- No shortcuts: do not leave DB writes mocked or commented out
- Multi-Tenant: always include tenant_id in every INSERT
- Do not skip tests
- Consult repo docs and governance docs before acting
```

---

### IMPL-PROMPT-02: Add tenant_id to ledger_entries

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: This repo is ONE component of WebWaka OS v4. It is NOT standalone.

OBJECTIVE:
Add tenant_id column to ledger_entries via a new D1 migration and update all write paths.

CONTEXT:
- Without tenant_id, operator ledger data is commingled — a critical multi-tenancy violation
- Migration must use ALTER TABLE ... ADD COLUMN (never recreate the table)
- Existing rows will have NULL tenant_id — this is acceptable
- All new INSERT statements must include tenant_id
- All GET /api/ledger/entries and GET /api/ledger/summary endpoints must support ?tenant_id= filter

REQUIRED DELIVERABLES:
1. migrations/002_add_tenant_id_to_ledger.sql — ALTER TABLE ledger_entries ADD COLUMN tenant_id TEXT; + index
2. src/worker.ts — update all INSERT INTO ledger_entries statements to bind tenant_id
3. src/modules/ledger/core.ts — add tenantId to LedgerEntry interface and recordTransaction() signature
4. src/worker.ts — update GET /api/ledger/entries and GET /api/ledger/summary to accept tenant_id query param

ACCEPTANCE CRITERIA:
- Migration applies with no errors in local wrangler dev
- All insert paths bind tenant_id
- GET /api/ledger/entries?tenant_id=X only returns rows for that tenant
- TypeScript compiles

IMPORTANT REMINDERS:
- Multi-Tenant Tenant-as-Code: tenant_id isolation is mandatory
- Never use DROP TABLE or column modification — additive only
- Consult migrations/001_central_mgmt_schema.sql for reference
- Do not skip tests or validation
```

---

### IMPL-PROMPT-03: Affiliates Table + Wire AffiliateSystem to D1

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: This repo is ONE component of WebWaka OS v4.

OBJECTIVE:
Create the affiliates D1 table migration and replace the hardcoded mock data in
AffiliateSystem.getAffiliate() with real D1 queries. This is BUG-02 + Enhancement E-03.

CONTEXT:
- src/modules/affiliate/core.ts has getAffiliate() returning hardcoded mock data (lines 72-85)
- There is no affiliates table in any migration — this must be created
- commission_rate_bps must be stored as integer basis points (e.g. 500 = 5%), never as a float
- Circular reference guard: a node cannot be its own parent_id
- The 5-level cap in calculateSplits() must be enforced

REQUIRED DELIVERABLES:
1. migrations/003_affiliates_schema.sql — table: affiliates(id TEXT PK, user_id TEXT, parent_id TEXT, tenant_id TEXT, level INTEGER, commission_rate_bps INTEGER, status TEXT, created_at INTEGER)
2. src/modules/affiliate/core.ts — replace mock getAffiliate() with db.prepare('SELECT * FROM affiliates WHERE id = ?').bind(id).first<AffiliateNode>()
3. src/modules/affiliate/core.ts — add createAffiliate(), getAffiliatesByTenant() methods
4. src/modules/affiliate/core.ts — add circular reference guard in createAffiliate()
5. src/worker.ts — add POST /api/affiliates (super_admin only), GET /api/affiliates (admin+)
6. src/modules/affiliate/core.test.ts — update all tests to mock D1 queries

ACCEPTANCE CRITERIA:
- Migration creates affiliates table
- getAffiliate() queries D1 (verified by mocked D1 call assertion in tests)
- calculateSplits() works with mocked D1 data returning a 5-level tree
- POST /api/affiliates returns 201 with the new affiliate ID
- Circular reference returns 422
- TypeScript compiles

IMPORTANT REMINDERS:
- Build Once Use Infinitely: AffiliateSystem is used by multiple verticals eventually
- commission_rate_bps = integer basis points — never float percentages
- Multi-Tenant: every affiliate record must have tenant_id
- No hardcoded mock data in production code paths
- Do not skip the circular reference guard
```

---

### IMPL-PROMPT-04: Expose Super-Admin HTTP Routes

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: This repo is ONE component of WebWaka OS v4. Not standalone.

OBJECTIVE:
Add MGMT-1 super-admin HTTP endpoints to src/worker.ts for tenant provisioning,
module toggling, and feature flag management. These routes must be in the SuperAdminService
already in src/modules/super-admin/core.ts.

CONTEXT:
- MGMT-1 is documented as PASSED in docs/qa/PHASE_2_QA_REPORT.md but has ZERO HTTP routes
- Routes must require JWT auth with super_admin role (use requireRole(['super_admin']))
- KV binding PLATFORM_KV is already available in c.env
- Use the Hono app.route() pattern for clean route grouping
- SuperAdminService needs additional methods: listTenants(), getTenant(), suspendTenant()

REQUIRED DELIVERABLES:
1. src/worker.ts — add route group /api/super-admin/ with:
   - POST /api/super-admin/tenants (provision tenant, super_admin only)
   - GET /api/super-admin/tenants (list tenants, super_admin only)
   - GET /api/super-admin/tenants/:tenantId (get tenant, super_admin only)
   - PUT /api/super-admin/tenants/:tenantId/modules/:moduleName (toggle module, super_admin only)
   - PUT /api/super-admin/tenants/:tenantId/flags/:flagName (toggle flag, super_admin only)
2. src/modules/super-admin/core.ts — add listTenants(), getTenant(), suspendTenant()
3. Zod validation schemas for all request bodies
4. All responses use { success: true, data: {...} } envelope

ACCEPTANCE CRITERIA:
- All endpoints require JWT super_admin role — return 403 for admin, 401 for unauthenticated
- POST /api/super-admin/tenants returns 201 with { success: true, data: { tenantId, ... } }
- GET /api/super-admin/tenants returns array of tenant configs
- PUT module/flag toggle returns updated config
- TypeScript compiles

IMPORTANT REMINDERS:
- Governance-Driven: super_admin role from @webwaka/core RBAC
- Multi-Tenant: do not expose one tenant's config to another tenant's admin
- Do not bypass jwtAuthMiddleware for any route in this group
```

---

### IMPL-PROMPT-05: Fix CI/CD — Remove || true

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: This repo is part of WebWaka OS v4. CI/CD is critical — broken
code must not reach production.

OBJECTIVE:
Remove all "|| true" suppressors from critical CI steps in .github/workflows/deploy.yml.
Ensure TASK-17 (lint script) is completed first.

CONTEXT:
- Lines 34, 37, 40, 67, 121 contain "|| true" preventing CI from failing
- D1 migration steps have continue-on-error: true which must be removed
- The post-deploy "Verify Ledger KV connectivity" step sends INTER_SERVICE_SECRET
  as a JWT bearer to /api/ledger/summary — this always returns 401. Fix it to use
  the /health endpoint instead, which is public.
- The GitHub Release body references /api/events/ingest — the correct path is /events/ingest

REQUIRED DELIVERABLES:
1. .github/workflows/deploy.yml — remove all || true from tsc, lint, test, build steps
2. Remove continue-on-error: true from D1 migration steps
3. Fix post-deploy check: change /api/ledger/summary to /health
4. Fix GitHub Release endpoint reference to /events/ingest
5. package.json must have a working "lint" script (coordinate with TASK-17)

ACCEPTANCE CRITERIA:
- A commit with a TS error will fail CI
- A commit with a failing test will fail CI
- D1 migration failure will fail CI
- Post-deploy health check hits /health and expects HTTP 200

IMPORTANT REMINDERS:
- CI/CD Native Development invariant
- Do not introduce new || true anywhere
- Coordinate: TASK-17 must add the lint script before this task removes || true from lint step
```

---

### IMPL-PROMPT-06: Integrate Modules into worker.ts

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: Part of WebWaka OS v4.

OBJECTIVE:
Refactor worker.ts to replace all inline SQL in the /events/ingest handler with calls
to LedgerService and AffiliateSystem. There must be exactly ONE ledger write path.

CONTEXT:
- Currently worker.ts has inline db.prepare(...).bind(...) calls duplicating LedgerService logic
- LedgerService must be the single ledger write path (Build Once Use Infinitely)
- After this task, worker.ts should contain no raw D1 SQL for ledger writes
- Instantiate LedgerService(c.env.DB, c.env.PLATFORM_KV) at the start of each handler

REQUIRED DELIVERABLES:
1. src/modules/ledger/core.ts — add higher-level event methods:
   recordBookingConfirmed(bookingId, amountKobo, tenantId), recordBookingRefunded(...),
   recordOrderPaid(...), recordPayoutProcessed(...)
2. src/worker.ts — replace all inline SQL in /events/ingest with calls to LedgerService
3. src/modules/ledger/core.test.ts — tests for each new event method

ACCEPTANCE CRITERIA:
- No raw db.prepare() in worker.ts /events/ingest handler after this change
- Behavior is identical to previous inline SQL
- All tests pass
- TypeScript compiles

IMPORTANT REMINDERS:
- Do not change the HTTP response shapes
- Do not break idempotency logic in /events/ingest
- Preserve the existing event processing error handling
```

---

### IMPL-PROMPT-07: Affiliate Commission Splits from Events

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: Part of WebWaka OS v4. Affiliate splits are cross-module (ledger + affiliate).

OBJECTIVE:
Wire affiliate commission split calculation into the transport.booking.confirmed
event processing pipeline. Commission splits must be persisted as ledger entries.

DEPENDENCIES: TASK-01 (LedgerService wired), TASK-03 (affiliates table and real D1 queries),
TASK-06 (modules integrated into worker.ts)

REQUIRED DELIVERABLES:
1. src/worker.ts — in transport.booking.confirmed handler: extract payload.affiliate_id,
   call affiliateSystem.calculateSplits(amountKobo, affiliateId), then call
   ledgerService.recordAffiliateCommission(split, tenantId, transactionId) for each split
2. src/modules/ledger/core.ts — add recordAffiliateCommission(split, tenantId, sourceTransactionId)
3. Affiliate commission entries: account_type='affiliate', account_id=split.affiliateId,
   type='credit', metadata includes source transaction_id and level

ACCEPTANCE CRITERIA:
- transport.booking.confirmed with affiliate_id creates 1-5 commission ledger entries
- Entries share transaction_id with the booking entries
- transport.booking.confirmed without affiliate_id has no error and creates no commission entries
- All commission amounts are integer kobo

IMPORTANT REMINDERS:
- Build Once: use AffiliateSystem, not inline SQL
- Africa-Ready: use Math.floor for commission amounts to avoid overpayment
```

---

### IMPL-PROMPT-08: Zod Validation

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Add Zod and @hono/zod-validator to all POST/PUT request handlers and query parameter
parsing in src/worker.ts.

REQUIRED DELIVERABLES:
1. npm install zod @hono/zod-validator
2. src/schemas/events.ts — Zod schema for /events/ingest body
3. src/schemas/ledger.ts — Zod schema for ledger query params
4. src/schemas/affiliate.ts — Zod schema for affiliate CRUD
5. src/worker.ts — apply zValidator() middleware to all endpoints with request bodies

ACCEPTANCE CRITERIA:
- Invalid event_type returns 400 with descriptive error
- Invalid limit (>200) returns 400
- All schemas in src/schemas/ directory
- TypeScript compiles

IMPORTANT REMINDERS:
- Use Zod enums for event_type values (explicitly list all supported event types)
- amount_kobo validation: .int().positive() in Zod
```

---

### IMPL-PROMPT-09: Rate Limiting

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Implement rate limiting on /events/ingest and optionally on admin API endpoints
using Cloudflare Workers KV as a sliding window counter.

REQUIRED DELIVERABLES:
1. src/middleware/rateLimit.ts — sliding window rate limiter using PLATFORM_KV
2. wrangler.toml — document the rate limit KV namespace usage
3. src/worker.ts — apply rate limiting middleware to /events/ingest
4. Rate limit: 100 requests per minute per IP (configurable)

ACCEPTANCE CRITERIA:
- 429 returned after threshold with Retry-After header
- Uses CF-Connecting-IP header for IP identification
- TypeScript compiles

IMPORTANT REMINDERS:
- KV is eventually consistent — brief over-limit is acceptable
- Do not rate-limit /health
```

---

### IMPL-PROMPT-10: Structured JSON Logging

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Add a structured JSON logging middleware and global error handler to worker.ts.

REQUIRED DELIVERABLES:
1. src/middleware/logger.ts — logs every request as JSON: {level, method, path, status, duration_ms, tenant_id, ts}
2. src/middleware/errorHandler.ts — catches unhandled errors, logs structured JSON, returns 500
3. src/worker.ts — apply both middleware globally

ACCEPTANCE CRITERIA:
- Every request produces a valid JSON log line
- Authorization header values never appear in logs
- Errors produce structured JSON with level='error', msg, stack, ts
- TypeScript compiles

IMPORTANT REMINDERS:
- Never log secrets (Authorization, X-WebWaka-Signature values)
- Duration in milliseconds using Date.now()
```

---

### IMPL-PROMPT-11: Tenant Registry in D1

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Create a tenants D1 table as source of truth for tenant data and sync KV from D1.

REQUIRED DELIVERABLES:
1. migrations/004_tenants_schema.sql — CREATE TABLE tenants(...)
2. src/modules/super-admin/core.ts — update provisionTenant() to write D1 first, then KV
3. src/modules/super-admin/core.ts — update toggleModule(), toggleFeatureFlag() to update both
4. src/modules/super-admin/core.ts — add listTenants(db, limit, offset) querying D1
5. KV write uses TTL of 300 seconds (5 minutes)

ACCEPTANCE CRITERIA:
- D1 write happens before KV write
- KV has 300s TTL
- listTenants() queries D1 (not KV.list())
- TypeScript compiles
```

---

### IMPL-PROMPT-12: KV Balance Cache

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Cache ledger account balances in PLATFORM_KV after each ledger write.
GET /api/ledger/summary reads from KV first, falling back to D1.

REQUIRED DELIVERABLES:
1. src/modules/ledger/core.ts — add updateBalanceCache(kv, tenantId, accountId, amountKobo, type)
2. src/worker.ts — call updateBalanceCache() after each successful ledger write in /events/ingest
3. GET /api/ledger/summary — check KV for each account, fall back to D1 for cache misses
4. KV key: balance:${tenantId}:${accountId}, TTL: 60 seconds

ACCEPTANCE CRITERIA:
- KV cache is updated after every ledger write
- Summary endpoint uses cache when available
- TypeScript compiles
```

---

### IMPL-PROMPT-13 through IMPL-PROMPT-25:

These follow the same format as above. For brevity, the essential fields per task:

**IMPL-PROMPT-13 (Dead-Letter + Replay):**
Objective: Add `processed=2` (failed) state to events, store error_message, add `POST /api/events/replay`.
Files: `migrations/005_event_dead_letter.sql`, `src/worker.ts`.

**IMPL-PROMPT-14 (Payout Request):**
Objective: Add `POST /api/payouts/request` with balance validation, create `payout_requests` table.
Files: `migrations/006_payout_requests.sql`, `src/worker.ts`, `src/modules/ledger/core.ts`.

**IMPL-PROMPT-15 (HMAC Signatures):**
Objective: Replace plain bearer check in `/events/ingest` with HMAC-SHA256 verification.
Files: `src/middleware/hmacAuth.ts`, `src/worker.ts`.

**IMPL-PROMPT-16 (vitest.config.ts + Integration Tests):**
Objective: Add `vitest.config.ts` with `@cloudflare/vitest-pool-workers`, add integration tests.
Files: `vitest.config.ts`, `wrangler.test.toml`, `src/modules/ledger/integration.test.ts`.

**IMPL-PROMPT-17 (ESLint):**
Objective: Add ESLint with TypeScript config, add `"lint"` script to package.json.
Files: `package.json`, `.eslintrc.cjs`, all `src/**/*.ts`.

**IMPL-PROMPT-18 (Per-Tenant Commission Rates):**
Objective: Add `commissionRates` to `TenantConfig`, update `calculateSplits()` to use tenant-level defaults.
Files: `src/modules/super-admin/core.ts`, `src/modules/affiliate/core.ts`.

**IMPL-PROMPT-19 (Commission Reversals):**
Objective: Cascade affiliate commission reversals on `transport.booking.refunded`.
Files: `src/worker.ts`, `src/modules/ledger/core.ts`.

**IMPL-PROMPT-20 (Operator Financial Summary):**
Objective: Add `GET /api/operators/:id/summary?from=&to=&currency=` endpoint.
Files: `src/worker.ts`, `src/modules/ledger/core.ts`.

**IMPL-PROMPT-21 (Staging Bindings):**
Objective: Add `[env.staging]` block with dedicated staging D1 and KV IDs to `wrangler.toml`.
Files: `wrangler.toml`.

**IMPL-PROMPT-22 (Date Serialization Fix):**
Objective: Fix `TenantConfig.createdAt` from `Date` to `string` throughout.
Files: `src/modules/super-admin/core.ts`, `src/modules/super-admin/core.test.ts`.

**IMPL-PROMPT-23 (Rename eventType variable):**
Objective: Rename query parameter `eventType` → `account_type` in `GET /api/ledger/entries`.
Files: `src/worker.ts`.

**IMPL-PROMPT-24 (Fix Release Notes Path):**
Objective: Fix `/api/events/ingest` → `/events/ingest` in `deploy.yml` release notes.
Files: `.github/workflows/deploy.yml`.

**IMPL-PROMPT-25 (vitest.config.ts Globals):**
Objective: Add `vitest.config.ts` with `globals: true` and appropriate Workers environment.
Files: `vitest.config.ts`.

---

## 9. QA PROMPTS

---

### QA-PROMPT-01: Verify LedgerService D1 Integration

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: This repo is part of WebWaka OS v4. It is NOT standalone.
Before acting, read: src/modules/ledger/core.ts, src/modules/ledger/core.test.ts,
migrations/001_central_mgmt_schema.sql, migrations/002_add_tenant_id_to_ledger.sql.

OBJECTIVE:
Verify that TASK-01 (LedgerService D1 integration) is correctly and completely implemented.
You are the QA agent. Do not implement. Only verify, test, and report.

VERIFICATION CHECKLIST:
1. Does recordTransaction() call this.db.batch([debitStmt, creditStmt])?
2. Are both entries written atomically (single batch call)?
3. Does the debit entry have account_id=fromAccountId, type='debit'?
4. Does the credit entry have account_id=toAccountId, type='credit'?
5. Do both entries share the same transaction_id?
6. Does passing a non-integer amountKobo throw?
7. Does passing 0 or negative amountKobo throw?
8. Does the test mock D1.batch() and assert it was called with correct arguments?
9. Does TypeScript compile with no errors (npm run build)?
10. Do all unit tests pass (npm test)?

BUGS TO LOOK FOR:
- Is the batch call actually atomic? (D1 .batch() is atomic — verify the code uses .batch() not two separate .run() calls)
- Are there any silent failures (try/catch that swallows errors)?
- Is tenant_id included in the INSERT?
- Are any ledger writes still happening via inline SQL in worker.ts?

EDGE CASES TO TEST:
- amountKobo = 100_000_000_000 (₦1B) — valid integer, should succeed
- fromAccountId === toAccountId — test what happens
- currency = 'USD' — verify stored correctly

CROSS-MODULE CHECKS:
- Verify worker.ts no longer has inline SQL for ledger writes (if TASK-06 is also done)
- Verify LedgerEntry interface includes all fields from migrations/001_central_mgmt_schema.sql

DONE MEANS:
- All unit tests pass
- D1.batch() is called (not two separate .run() calls)
- TypeScript compiles
- No inline SQL in worker.ts for ledger writes
- No hardcoded values in INSERT statements

REPORT FORMAT:
Provide a structured pass/fail report for each checklist item.
Include any bugs found with file name and line number.
Include recommendations for fixes if bugs are found.
```

---

### QA-PROMPT-02: Verify tenant_id Migration and Query Filtering

```
REPOSITORY: webwaka-central-mgmt
ECOSYSTEM NOTE: Part of WebWaka OS v4.

OBJECTIVE:
Verify that TASK-02 (tenant_id on ledger_entries) is correctly implemented.

VERIFICATION CHECKLIST:
1. Does migrations/002_add_tenant_id_to_ledger.sql exist?
2. Does it use ALTER TABLE ... ADD COLUMN (not DROP/CREATE)?
3. Is there an index on tenant_id?
4. Do all INSERT INTO ledger_entries in worker.ts include tenant_id?
5. Does GET /api/ledger/entries?tenant_id=X filter by tenant?
6. Does GET /api/ledger/summary?tenant_id=X aggregate per tenant?
7. Does TypeScript compile?

EDGE CASES:
- tenant_id = null in query — returns all (super_admin only) or 400?
- tenant_id in event payload is optional — verify NULL handling in INSERT

DONE MEANS: Migration applied, all writes include tenant_id, all queries support filtering.
```

---

### QA-PROMPT-03: Verify Affiliates Table and D1-Wired AffiliateSystem

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Verify TASK-03 (affiliates D1 table + real queries in AffiliateSystem).

VERIFICATION CHECKLIST:
1. Does migrations/003_affiliates_schema.sql exist with all required columns?
2. Does getAffiliate() make a real D1 query (not return mock data)?
3. Are tests updated to mock D1 and assert the query was made?
4. Does calculateSplits() work correctly with mocked D1 data?
5. Is there a circular reference guard in createAffiliate()?
6. Do POST /api/affiliates and GET /api/affiliates exist and require auth?
7. Does TypeScript compile?

BUGS TO LOOK FOR:
- Is there still mock data in getAffiliate()? Search for the hardcoded mockData const
- Does calculateSplits() use Math.floor() (not Math.round) for conservative commission amounts?
- Is commission_rate_bps stored as integer (not float)?

DONE MEANS: No mock data in production paths. D1 queries mocked and asserted in tests.
```

---

### QA-PROMPT-04: Verify Super-Admin HTTP Routes

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Verify TASK-04 (super-admin HTTP endpoints) implementation.

VERIFICATION CHECKLIST:
1. Does POST /api/super-admin/tenants exist and require super_admin role?
2. Does GET /api/super-admin/tenants exist and return tenant list?
3. Does PUT /api/super-admin/tenants/:id/modules/:name toggle correctly?
4. Does PUT /api/super-admin/tenants/:id/flags/:name toggle correctly?
5. Does each route return { success: true, data: {...} } envelope?
6. Does a request with admin role return 403?
7. Does a request with no JWT return 401?
8. Is Zod validation applied to POST body?

DONE MEANS: All 5 routes accessible, all return correct status codes, auth enforced.
```

---

### QA-PROMPT-05: Verify CI/CD Hardening

```
REPOSITORY: webwaka-central-mgmt

OBJECTIVE:
Verify TASK-05 (CI/CD || true removal) implementation.

VERIFICATION CHECKLIST:
1. Does .github/workflows/deploy.yml contain any "|| true"? (Should be zero)
2. Does the lint step call a real script (npm run lint)?
3. Does package.json have a "lint" script?
4. Is continue-on-error: true removed from D1 migration steps?
5. Does the post-deploy check use /health (not /api/ledger/summary)?
6. Does the GitHub Release body reference /events/ingest (not /api/events/ingest)?

MANUAL TEST:
- Temporarily add a TypeScript error, trigger CI, verify it fails
- Temporarily add a failing test, trigger CI, verify it fails
- Revert and verify CI passes

DONE MEANS: Zero || true in critical CI steps. CI fails on broken code.
```

---

### QA-PROMPT-06 through QA-PROMPT-25:

Each QA prompt follows the same structure as above with repo name, ecosystem note, objective, verification checklist, bugs to look for, edge cases, cross-module checks, and done means for each corresponding task. Specific QA prompts for tasks 06-25 are structured as follows:

**QA-PROMPT-06 (Module Integration):** Verify no raw SQL in worker.ts /events/ingest. Verify LedgerService is instantiated and called. Verify identical behavior.

**QA-PROMPT-07 (Affiliate Splits from Events):** Verify 5 commission entries created for booking.confirmed with affiliate_id. Verify no error when affiliate_id absent. Verify amounts correct.

**QA-PROMPT-08 (Zod Validation):** Test invalid inputs to each endpoint, verify 400 with descriptive errors. Test valid inputs still pass.

**QA-PROMPT-09 (Rate Limiting):** Send 101 requests in 60s, verify 101st returns 429 with Retry-After. Verify /health is not rate-limited.

**QA-PROMPT-10 (Structured Logging):** Verify every request produces a JSON log line. Verify no auth headers in logs.

**QA-PROMPT-11 (Tenant Registry D1):** Verify D1 write before KV write. Verify listTenants queries D1. Verify KV has 300s TTL.

**QA-PROMPT-12 (KV Balance Cache):** Verify cache is populated after ledger write. Verify TTL. Verify D1 fallback on cache miss.

**QA-PROMPT-13 (Dead-Letter/Replay):** Inject a DB error, verify processed=2 and error_message stored. Verify replay endpoint re-processes.

**QA-PROMPT-14 (Payout Request):** Verify balance validation. Verify 422 on insufficient balance. Verify pending ledger entry created.

**QA-PROMPT-15 (HMAC):** Test invalid signature returns 401. Test tampered body returns 401. Test valid signature passes.

**QA-PROMPT-16 (Integration Tests):** Run npm test, verify integration tests run in Miniflare, verify D1 write-read test passes.

**QA-PROMPT-17 (ESLint):** Run npm run lint, verify exits 0 on clean code, exits 1 on violation.

**QA-PROMPT-18 (Per-Tenant Rates):** Verify tenant custom rates used in splits. Verify affiliate override takes precedence.

**QA-PROMPT-19 (Commission Reversals):** Verify refund event reverses all affiliate commission entries. Verify correct amounts.

**QA-PROMPT-20 (Operator Summary):** Verify date-range filtering works. Verify balance_kobo = credits - debits.

**QA-PROMPT-21 (Staging Bindings):** Verify staging deploy uses staging D1 ID, not production.

**QA-PROMPT-22 (Date Fix):** Verify createdAt is string after KV round-trip.

**QA-PROMPT-23 (Variable Rename):** Verify GET /api/ledger/entries?account_type= works correctly.

**QA-PROMPT-24 (Release Notes Fix):** Verify /events/ingest path in deploy.yml release body.

**QA-PROMPT-25 (vitest.config.ts):** Verify npm test runs without Workers globals errors.

---

## 10. PRIORITY ORDER

### Phase 1 — Critical / Must-Fix First (Blocking Production Correctness)

| Priority | Task | Reason |
|----------|------|--------|
| 1 | TASK-22 | Fix Date serialization bug (quick fix, enables correct tenant config reads) |
| 2 | TASK-25 | Add vitest.config.ts (enables reliable test runs for all subsequent tasks) |
| 3 | TASK-17 | Add ESLint (must exist before TASK-05 removes CI suppressors) |
| 4 | TASK-02 | Add tenant_id to ledger_entries (prerequisite for TASK-01) |
| 5 | TASK-01 | Wire LedgerService to D1 (core financial functionality is currently a no-op) |
| 6 | TASK-23 | Fix misleading eventType variable (quick fix) |
| 7 | TASK-24 | Fix release notes path (quick fix) |
| 8 | TASK-21 | Add staging bindings to wrangler.toml (prevents staging→production contamination) |
| 9 | TASK-05 | Harden CI/CD (requires TASK-17 first) |
| 10 | TASK-03 | Wire AffiliateSystem to D1 + create affiliates table |
| 11 | TASK-04 | Expose super-admin HTTP routes |
| 12 | TASK-06 | Integrate modules into worker.ts (clean up dual write paths) |
| 13 | TASK-08 | Add Zod validation |
| 14 | TASK-09 | Add rate limiting |
| 15 | TASK-10 | Add structured logging |

### Phase 2 — High Value / Platform Completion

| Priority | Task | Reason |
|----------|------|--------|
| 16 | TASK-07 | Affiliate splits from events |
| 17 | TASK-11 | Tenant registry in D1 |
| 18 | TASK-12 | KV balance cache |
| 19 | TASK-15 | HMAC auth upgrade |
| 20 | TASK-16 | Integration test infrastructure |
| 21 | TASK-18 | Per-tenant commission rates |
| 22 | TASK-19 | Commission reversals on refund |
| 23 | TASK-20 | Operator financial summary endpoint |
| 24 | TASK-13 | Dead-letter and replay |
| 25 | TASK-14 | Payout request endpoint |

---

## 11. DEPENDENCIES

```
TASK-25 (vitest.config.ts) → prerequisite for → all test tasks
TASK-17 (ESLint)           → prerequisite for → TASK-05 (CI hardening)
TASK-02 (tenant_id)        → prerequisite for → TASK-01 (LedgerService D1)
TASK-02                    → prerequisite for → TASK-06 (module integration)
TASK-01 (LedgerService D1) → prerequisite for → TASK-06 (module integration)
TASK-01                    → prerequisite for → TASK-12 (KV balance cache)
TASK-01                    → prerequisite for → TASK-14 (payout requests)
TASK-03 (affiliates table) → prerequisite for → TASK-07 (affiliate splits from events)
TASK-03                    → prerequisite for → TASK-18 (per-tenant commission rates)
TASK-06 (module integration) → prerequisite for → TASK-07 (affiliate splits)
TASK-06                    → prerequisite for → TASK-13 (dead-letter)
TASK-07 (affiliate splits) → prerequisite for → TASK-19 (commission reversals)
TASK-04 (super-admin routes) → prerequisite for → TASK-11 (tenant D1 registry)
TASK-04                    → prerequisite for → TASK-18 (per-tenant commission rates)
TASK-10 (structured logging) → recommended before → TASK-13 (dead-letter)
TASK-17 (ESLint) + TASK-05 (CI hardening) → must be done together
```

---

## 12. PHASE 1 / PHASE 2 SPLIT

### Phase 1 — Core Correctness and Production Safety

**Goal:** Make the service actually functional and safe to deploy.

**Includes:**
- All bug fixes (TASK-01 through BUG-12)
- CI/CD hardening (TASK-05)
- Tenant isolation (TASK-02)
- Module wiring (TASK-06)
- Input validation (TASK-08)
- Rate limiting (TASK-09)
- Structured logging (TASK-10)
- Super-admin routes (TASK-04)
- Affiliate table scaffolding (TASK-03)
- Staging bindings (TASK-21)

**Phase 1 Exit Criteria:**
- LedgerService writes to D1
- All ledger entries have tenant_id
- AffiliateSystem queries D1 (not mock data)
- Super-admin endpoints are accessible
- CI/CD fails on broken code
- No inline SQL in worker.ts
- Input validation on all endpoints
- Rate limiting on /events/ingest

### Phase 2 — Platform Completion and Operational Excellence

**Goal:** Complete the economics platform with full affiliate, payout, and analytics capabilities.

**Includes:**
- Affiliate commission splits from events (TASK-07)
- Tenant registry in D1 (TASK-11)
- KV balance cache (TASK-12)
- HMAC auth upgrade (TASK-15)
- Integration tests (TASK-16)
- Per-tenant commission rates (TASK-18)
- Commission reversals (TASK-19)
- Operator financial summary (TASK-20)
- Dead-letter and replay (TASK-13)
- Payout request endpoint (TASK-14)

**Phase 2 Exit Criteria:**
- Affiliate commissions calculated and persisted for all events
- Operators can request withdrawals
- Admin can view filtered financial summaries
- HMAC authentication in use
- Integration tests covering full write-read flows
- Dead-letter mechanism for failed events

---

## 13. REPO CONTEXT AND ECOSYSTEM NOTES

### 13.1 Multi-Repo Context

`webwaka-central-mgmt` is one of at least these repos in the WebWaka OS v4 ecosystem:

| Repo | Role |
|------|------|
| `webwaka-core` | Shared primitives: JWT, RBAC, types, utilities (`@webwaka/core`) |
| `webwaka-transport` | Transport vertical — emits `transport.booking.*` events |
| `webwaka-commerce` | Commerce vertical — emits `commerce.order.*`, `commerce.payout.*` events |
| `webwaka-central-mgmt` | **This repo** — ledger, affiliate, super-admin |
| Other verticals | Real Estate, Health, Logistics, Finance (planned per Blueprint Part 10) |

### 13.2 What Lives in Other Repos

| Capability | Where It Lives |
|-----------|---------------|
| JWT issuance and verification | `webwaka-core` → `jwtAuthMiddleware` |
| RBAC role definitions | `webwaka-core` → `requireRole` |
| Booking event emission | `webwaka-transport` |
| Order/payout event emission | `webwaka-commerce` |
| Geolocation primitives | `webwaka-core` (CORE-9, planned) |
| KYC/BVN verification | `webwaka-core` (CORE-12, planned) |
| Real-time chat | `webwaka-core` (CORE-13, planned) |

### 13.3 What Stays in This Repo

| Capability | Should Be Here |
|-----------|---------------|
| Ledger writes and reads | ✅ Here |
| Affiliate hierarchy and commission splits | ✅ Here |
| Tenant provisioning and feature flags | ✅ Here |
| Platform revenue accounting | ✅ Here |
| Operator balance and payout workflow | ✅ Here |
| Inter-service event ingestion endpoint | ✅ Here |

### 13.4 Cross-Repo Contracts

**Event schema from webwaka-transport:**
```json
{
  "event_type": "transport.booking.confirmed",
  "aggregate_id": "<booking_id>",
  "tenant_id": "<tenant_id>",
  "timestamp": 1234567890000,
  "payload": {
    "booking_id": "<booking_id>",
    "total_amount": 50000,
    "affiliate_id": "<affiliate_id>"
  }
}
```

Any changes to the event ingestion schema (new required fields, renamed fields) must be coordinated with `webwaka-transport` and `webwaka-commerce`.

---

## 14. GOVERNANCE AND REMINDER BLOCK

All implementation work on this repo must adhere to the following WebWaka OS v4 invariants:

| Invariant | Applied In This Repo As |
|-----------|------------------------|
| **Build Once Use Infinitely** | LedgerService and AffiliateSystem are reusable modules; never duplicate logic in worker.ts |
| **Mobile/PWA/Offline First** | N/A for this backend service, but event ingestion must handle delayed/out-of-order events gracefully |
| **Nigeria-First, Africa-Ready** | All monetary values in kobo (integer); NGN default; WAT-aware timestamps in responses |
| **Vendor Neutral AI** | The `ai_assistant` feature flag hooks into `@webwaka/core` CORE-5 AI/BYOK engine — never hardcode an AI provider |
| **Multi-Tenant Tenant-as-Code** | Every table must have `tenant_id`; every query must be scoped; no cross-tenant data leakage |
| **Event-Driven, No Direct Inter-DB** | This service must NEVER read from webwaka-transport or webwaka-commerce databases directly |
| **Thoroughness Over Speed** | Do not leave commented-out code, TODOs, or mock data in production paths |
| **Zero Skipping Policy** | Do not skip migrations, tests, validation, or error handling |
| **Multi-Repo Platform Architecture** | Changes to inter-service contracts must be coordinated across repos |
| **Governance-Driven Execution** | Consult Blueprint Part 10.1, 9.2, 9.3 before implementing financial or RBAC changes |
| **CI/CD Native Development** | All changes must pass CI before merging; no || true suppressors |
| **Cloudflare-First Deployment** | Use D1, KV, Workers bindings; do not introduce non-Cloudflare infrastructure |

---

## 15. EXECUTION READINESS NOTES

### Before Starting Any Task

1. Run `npm test` to establish a baseline — all current tests should pass
2. Run `npm run build` to confirm TypeScript compiles
3. Run `npx wrangler dev --local --port 5000 --ip 0.0.0.0 --show-interactive-dev-session false` and confirm `/health` returns 200
4. Read the relevant migration files before creating new ones (check numbering)
5. Read `docs/qa/PHASE_2_QA_REPORT.md` and `docs/SHARED_PRIMITIVES_ANALYSIS.md` for ecosystem context

### After Each Task

1. Run `npm test` — all tests must pass
2. Run `npm run build` — TypeScript must compile clean
3. Run the wrangler dev server and test affected endpoints with curl
4. Commit only after all checks pass
5. Update `replit.md` if major architectural changes were made

### Task Ordering for a Single-Pass Execution Sprint

If executing all Phase 1 tasks in a single sprint, the recommended order is:

```
TASK-25 → TASK-22 → TASK-17 → TASK-24 → TASK-23 → TASK-21
→ TASK-02 → TASK-01 → TASK-03 → TASK-04 → TASK-06
→ TASK-08 → TASK-09 → TASK-10 → TASK-05
```

This ordering respects all dependencies and ensures CI hardening happens after the linting infrastructure is in place.

### Known Risks to Monitor

1. **D1 Write Limits**: D1 free tier has write limits; monitor during heavy event ingestion tests
2. **KV Eventual Consistency**: Balance cache may briefly reflect stale data during high-concurrency periods
3. **Worker CPU Limits**: Complex affiliate tree traversal (5 levels × N affiliates) + D1 queries must stay under Workers' 50ms CPU time limit; consider caching the affiliate tree in KV
4. **@webwaka/core Version Pinning**: The package is installed from GitHub main branch — pin to a tag/commit hash to prevent breaking changes from `@webwaka/core` PRs
5. **D1 Batch Atomicity**: D1 `.batch()` is atomic within a single Worker request but does not span multiple Workers. Commission splits must complete in the same request as the booking entry.

---

*End of WEBWAKA-CENTRAL-MGMT Deep Research Taskbook*
*Document Version: 1.0 | Date: 2026-04-04*
*Next review: after Phase 1 completion*

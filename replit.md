# WebWaka Central Management

## Overview
Core microservice of the WebWaka OS v4 ecosystem. Serves as the central management API for financial operations, tenant management, and platform reliability. Built on Cloudflare Workers with Hono framework.

## Key Features
- Double-entry ledger for platform revenue, operator earnings, and vendor balances — with cryptographic SHA-256 hash chaining (WCM-001)
- Idempotency enforcement (24-hour window)
- Automated tax splitting (VAT 7.5%, WHT 5%)
- Multi-currency support (NGN, GHS, KES — all normalized to NGN kobo internally)
- 5-level multi-tier affiliate commission engine backed by real D1 queries (WCM-003)
- Real-time fraud scoring engine
- Tenant suspension mechanisms
- Webhook Dead Letter Queue (DLQ) with exponential backoff
- 90-day data retention pruner
- FX rate management (admin API)

## Monetary Invariant
All monetary amounts are stored as **integer kobo** (NGN × 100). Never floats. Math.floor() applied at every commission and tax calculation boundary.

## Ledger Immutability
Ledger entries are **never updated or deleted**. Each entry carries `previous_hash` and `entry_hash` (SHA-256 chain). The `GET /api/ledger/integrity` endpoint verifies the entire chain.

## Project Structure
- `src/worker.ts` — Main Hono app entry point; all routes and middleware
- `src/modules/ledger/` — Double-entry accounting logic with SHA-256 hash chaining
- `src/modules/affiliate/` — 5-level affiliate hierarchy and commission splits (real D1)
- `src/modules/billing/` — Tax calculation and currency conversion
- `src/modules/fraud/` — Fraud scoring engine
- `src/modules/super-admin/` — Tenant lifecycle and suspension
- `src/modules/webhooks/` — Dead Letter Queue management
- `src/modules/ai-billing/` — AI quota and usage tracking
- `src/modules/retention/` — Data pruning logic
- `migrations/` — SQL schema files for Cloudflare D1 (003 adds affiliates + hash chain columns + compound indexes)

## Dependencies
- `hono` — HTTP routing framework
- `@webwaka/core` — Shared platform primitives (JWT auth, RBAC)
- `dexie` — Required by @webwaka/core for offline queue support
- `wrangler` — Cloudflare Workers CLI (dev server and deployment)

## Running Locally on Replit
The app runs via Wrangler's local dev mode which simulates Cloudflare D1 (SQLite) and KV bindings locally.

**Start command:** `node_modules/.bin/wrangler dev --local --ip 0.0.0.0 --port 5000`

D1 migrations must be applied before first use:
```
node_modules/.bin/wrangler d1 migrations apply webwaka-central-mgmt-db-prod --local
```

## API Endpoints

### Public
- `GET /health` — Health check with module list

### Event Ingestion
- `POST /events/ingest` — Ingest events from other services (Bearer INTER_SERVICE_SECRET)

### Ledger (admin JWT)
- `GET /api/ledger/entries` — Ledger entries
- `GET /api/ledger/summary` — Account balance summary
- `GET /api/ledger/integrity` — Verify SHA-256 hash chain (super_admin only)

### Events & Fraud (admin JWT)
- `GET /api/events` — Event log
- `GET /api/fraud/scores` — Fraud score records

### Affiliate Commission Engine (admin JWT) — WCM-003
- `POST /api/affiliates` — Register a new affiliate node
- `POST /api/affiliates/:affiliateId/calculate` — Calculate commission splits for a transaction
- `GET /api/affiliates/:affiliateId/commissions` — List commission records for an affiliate

### FX Rates (admin JWT)
- `GET /api/admin/fx-rates` — Current exchange rates
- `PUT /api/admin/fx-rates/:currency` — Update a rate (super_admin only)

### AI Usage (admin JWT)
- `GET /api/ai/usage/:tenantId` — AI usage summary for a tenant

### Admin Operations (super_admin JWT)
- `GET /api/admin/dlq` — Webhook DLQ entries
- `POST /api/admin/dlq/retry` — Trigger DLQ retry pass
- `POST /api/admin/retention/prune` — Trigger data pruner
- `PUT /api/admin/tenants/:tenantId/suspend` — Suspend tenant
- `PUT /api/admin/tenants/:tenantId/unsuspend` — Unsuspend tenant
- `GET /api/admin/tenants/:tenantId/suspension-log` — Suspension audit log
- `GET /api/admin/tenants/:tenantId/status` — Suspension status

## Environment Variables / Secrets
- `JWT_SECRET` — Secret for signing/verifying JWT tokens
- `INTER_SERVICE_SECRET` — Bearer token for inter-service event ingestion

## Test Suite
115 tests across 9 test files. Run with `npm test`.
Baseline on project import: 78. After WCM taskbook implementation: 115.

## Deployment
Deploys to Cloudflare Workers via Wrangler:
- Production: `npm run deploy`
- Staging: `npm run deploy:staging`

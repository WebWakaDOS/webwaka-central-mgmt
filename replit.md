# WebWaka Central Management

## Overview
Core microservice of the WebWaka OS v4 ecosystem. Serves as the central management API for financial operations, tenant management, and platform reliability. Built on Cloudflare Workers with Hono framework.

## Key Features
- Double-entry ledger for platform revenue, operator earnings, and vendor balances
- Idempotency enforcement (24-hour window)
- Automated tax splitting (VAT 7.5%, WHT 5%)
- Multi-currency support (NGN, GHS, KES — all normalized to NGN kobo internally)
- Real-time fraud scoring engine
- Tenant suspension mechanisms
- Webhook Dead Letter Queue (DLQ) with exponential backoff
- 90-day data retention pruner

## Project Structure
- `src/worker.ts` — Main Hono app entry point; all routes and middleware
- `src/modules/ledger/` — Double-entry accounting logic
- `src/modules/billing/` — Tax calculation and currency conversion
- `src/modules/fraud/` — Fraud scoring engine
- `src/modules/super-admin/` — Tenant lifecycle and suspension
- `src/modules/webhooks/` — Dead Letter Queue management
- `src/modules/ai-billing/` — AI quota and usage tracking
- `src/modules/retention/` — Data pruning logic
- `migrations/` — SQL schema files for Cloudflare D1

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
- `GET /health` — Health check (public)
- `POST /events/ingest` — Ingest events from other services (Bearer INTER_SERVICE_SECRET)
- `GET /api/ledger/entries` — Ledger entries (admin JWT)
- `GET /api/ledger/summary` — Account balance summary (admin JWT)
- `GET /api/events` — Event log (admin JWT)
- `GET /api/fraud/scores` — Fraud score records (admin JWT)
- `GET /api/admin/dlq` — Webhook DLQ entries (admin JWT)
- `POST /api/admin/dlq/retry` — Trigger DLQ retry pass (admin JWT)
- `POST /api/admin/retention/prune` — Trigger data pruner (super_admin JWT)
- `POST /api/super-admin/tenants/:tenantId/suspend` — Suspend tenant (super_admin JWT)
- `POST /api/super-admin/tenants/:tenantId/unsuspend` — Unsuspend tenant (super_admin JWT)
- `GET /api/super-admin/tenants/:tenantId/suspension` — Suspension status (admin JWT)

## Environment Variables / Secrets
- `JWT_SECRET` — Secret for signing/verifying JWT tokens
- `INTER_SERVICE_SECRET` — Bearer token for inter-service event ingestion

## Deployment
Deploys to Cloudflare Workers via Wrangler:
- Production: `npm run deploy`
- Staging: `npm run deploy:staging`

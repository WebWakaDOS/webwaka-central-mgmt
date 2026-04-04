# WebWaka Central Management

## Overview
A Cloudflare Workers API service for WebWaka OS v4. Handles the Ledger, Affiliate, and Super Admin modules. Part of the WebWaka Central Management system.

## Architecture
- **Runtime**: Cloudflare Workers (via Wrangler)
- **Framework**: Hono (lightweight HTTP framework for Workers)
- **Database**: Cloudflare D1 (SQLite, simulated locally via Miniflare)
- **KV Store**: Cloudflare KV (simulated locally via Miniflare)
- **Language**: TypeScript

## Project Structure
```
src/
  worker.ts                        # Main entry point — all Hono routes
  modules/
    ai-billing/core.ts             # AI usage billing and quota management
    affiliate/core.ts              # Multi-level affiliate commission splits
    billing/tax.ts                 # VAT (7.5%) + WHT (5%) tax splitting; multi-currency
    fraud/core.ts                  # Real-time fraud scoring rules engine
    ledger/core.ts                 # Double-entry ledger service
    retention/pruner.ts            # Data retention pruner (90-day window)
    super-admin/core.ts            # Tenant provisioning, feature flags
    super-admin/suspension.ts      # Tenant suspension hook + audit log
    webhooks/dlq.ts                # Webhook dead-letter queue + exponential backoff retry
migrations/
  001_central_mgmt_schema.sql      # Core ledger + events schema
  002_enhancements_schema.sql      # Idempotency, AI ledger, DLQ, fraud, suspension, FX rates
wrangler.toml                      # Cloudflare Workers configuration
.dev.vars                          # Local dev environment variables (not committed)
```

## API Endpoints

### Public
- `GET /health` — Health check with enhancement list

### Inter-service (Bearer INTER_SERVICE_SECRET)
- `POST /events/ingest` — Accept events from other services with:
  - Idempotency key enforcement (24-hour window)
  - Tenant suspension check (403 if suspended)
  - Real-time fraud scoring (block if score ≥ 70)
  - Multi-currency ledger entries (NGN, GHS, KES via fx_rates)
  - Automated tax splitting on `commerce.payout.processed` (VAT 7.5%, WHT 5%)

### Admin API (JWT required — admin or super_admin role)
- `GET /api/ledger/entries` — Paginated ledger entries (filterable by account, type, currency)
- `GET /api/ledger/summary` — Account balance summary (per currency)
- `GET /api/events` — Inbound event log
- `GET /api/fraud/scores` — Fraud evaluation records (filterable by risk level, tenant)
- `GET /api/admin/dlq` — Webhook dead-letter queue entries
- `POST /api/admin/dlq/retry` — Trigger DLQ retry pass
- `GET /api/admin/fx-rates` — Current FX exchange rates
- `GET /api/admin/tenants/:tenantId/status` — Tenant suspension status
- `GET /api/admin/tenants/:tenantId/suspension-log` — Tenant suspension audit log

### Super Admin API (JWT required — super_admin role only)
- `POST /api/admin/retention/prune` — Manually trigger data retention pruner
- `PUT /api/admin/tenants/:tenantId/suspend` — Suspend a tenant
- `PUT /api/admin/tenants/:tenantId/unsuspend` — Reinstate a tenant
- `PUT /api/admin/fx-rates/:currency` — Update exchange rate

## Implemented Enhancements (All 3 Phases)

### Phase 1 — Financial Integrity
1. **Idempotency Key Enforcement** — `idempotency_keys` D1 table; 24-hour dedup window
2. **Automated Tax Splitting** — VAT (7.5%) + WHT (5%) split on commerce payouts; separate ledger entries for net, VAT, WHT
3. **Multi-Currency Ledger** — NGN (base), GHS (×90), KES (×5.5) via `fx_rates` D1 table; all stored as NGN kobo

### Phase 2 — Security & Fraud
4. **Real-Time Fraud Scoring** — Rules: critical amount (₦2M+, 70 pts), high amount (₦500k+, 25 pts), velocity (10 events/min, 40 pts), anonymous high-value (30 pts), round amount (15 pts). Block ≥ 70, Flag ≥ 40, Allow < 40
5. **Tenant Suspension Hook** — `suspendTenant()` / `unsuspendTenant()`; updates KV config + immutable `tenant_suspension_log`

### Phase 3 — Reliability
6. **Webhook DLQ** — `webhook_dlq` table; exponential backoff (30s, 1m, 2m, 4m, 8m); max 5 attempts → exhausted
7. **Data Retention Pruner** — Deletes processed events, fraud scores, delivered DLQ entries, expired idempotency keys older than 90 days; ledger tables never touched

## Test Coverage
78 unit tests across 8 test files — 100% pass rate.

| Test File | Tests | Coverage |
|---|---|---|
| `billing/tax.test.ts` | 24 | calculateTaxes, convertToNGNKobo, isSupportedCurrency |
| `fraud/core.test.ts` | 11 | All 5 fraud rules, score capping, risk levels, D1 persistence |
| `webhooks/dlq.test.ts` | 11 | enqueueDLQ, retryDueDLQItems, listDLQEntries |
| `retention/pruner.test.ts` | 6 | pruneOldData, ledger immutability guard |
| `super-admin/suspension.test.ts` | 16 | suspend, unsuspend, isTenantSuspended, round-trip, audit log |
| `ledger/core.test.ts` | 3 | LedgerService (regression) |
| `affiliate/core.test.ts` | 3 | AffiliateSystem (regression) |
| `super-admin/core.test.ts` | 4 | SuperAdminService (regression) |

```bash
npm run test   # 78/78 pass
npm run build  # 0 TypeScript errors
```

## Local Development
```bash
# Apply D1 migrations locally
npx wrangler d1 migrations apply webwaka-central-mgmt-db-prod --local

# Start dev server
npx wrangler dev --local --ip 0.0.0.0 --port 5000
```

## Workflow
- **Start application**: `npx wrangler dev --local --ip 0.0.0.0 --port 5000`
- Runs on port 5000

## Environment Variables / Secrets
Required (set via `wrangler secret put` for production, `.dev.vars` for local):
- `JWT_SECRET` — Verify JWT tokens for admin API
- `INTER_SERVICE_SECRET` — Authenticate inter-service events
- `ENVIRONMENT` — Environment label (development/staging/production)

## Deployment
```bash
npm run deploy          # Deploy to production
npm run deploy:staging  # Deploy to staging
```

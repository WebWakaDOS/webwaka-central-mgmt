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
  worker.ts              # Main entry point — Hono app with all routes
  modules/
    ai-billing/core.ts  # AI usage billing logic
    affiliate/          # Affiliate module
    ledger/             # Ledger module
    super-admin/        # Super admin module
migrations/
  001_central_mgmt_schema.sql  # D1 schema migrations
wrangler.toml            # Cloudflare Workers configuration
```

## Key Endpoints
- `GET /health` — Health check (no auth)
- `POST /events/ingest` — Inter-service event ingestion (Bearer INTER_SERVICE_SECRET)
- `GET /api/ledger/entries` — Paginated ledger entries (admin only, JWT)
- `GET /api/ledger/summary` — Account balance summary (admin only, JWT)
- `GET /api/events` — Inbound event log (admin only, JWT)

## Local Development
The app runs via `wrangler dev --local` which uses Miniflare to simulate D1 and KV locally (no Cloudflare account needed for dev).

## Workflow
- **Start application**: `npx wrangler dev --local --ip 0.0.0.0 --port 5000`
- Runs on port 5000

## Environment Variables / Secrets
Required for production (set via `wrangler secret put`):
- `JWT_SECRET` — Used to verify JWT tokens
- `INTER_SERVICE_SECRET` — Used to authenticate inter-service calls

## Deployment
Deploys to Cloudflare Workers via `npm run deploy` (requires Cloudflare API token).

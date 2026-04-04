# WebWaka Central Management (`webwaka-central-mgmt`) QA Certification

**Prepared by:** Manus AI
**Date:** April 2026
**Target Repository:** `webwaka-central-mgmt`

## 1. Audit Scope

This QA certification covers the implementation of idempotency key enforcement, automated tax splitting, and the multi-currency ledger in `webwaka-central-mgmt`.

## 2. Acceptance Criteria

| ID | Feature | Acceptance Criteria | Status |
| :--- | :--- | :--- | :--- |
| QA-CEN-1 | Idempotency | `POST /events/ingest` successfully rejects duplicate events with the same `eventId` within a 24-hour window. | PENDING |
| QA-CEN-2 | Tax Splitting | `commerce.payout.processed` events correctly generate separate ledger entries for the net amount, VAT (7.5%), and WHT (5%). | PENDING |
| QA-CEN-3 | Multi-Currency | The `ledger_entries` table correctly stores and retrieves the currency code (e.g., `NGN`, `GHS`) for all transactions. | PENDING |
| QA-CEN-4 | Unit Tests | All new billing modules and event handlers have passing unit tests in `src/**/*.test.ts`. | PENDING |

## 3. Offline Resilience Testing

- The central management service is a backend API; offline resilience applies to its clients (the vertical suites).
- However, the service must gracefully handle upstream provider outages (e.g., Paystack 503s) by automatically queuing payouts for retry.

## 4. Security & RBAC Validation

- Verify that the `POST /events/ingest` endpoint requires a valid `INTER_SERVICE_SECRET` to execute.
- Ensure that tenants cannot query or modify ledger entries belonging to other tenants.

## 5. Regression Guards

- Run `npm run test` to ensure 100% pass rate.
- Run `npm run build` to ensure no TypeScript compilation errors.
- Verify that the existing AI usage billing logic still functions correctly and correctly debits the tenant's quota.

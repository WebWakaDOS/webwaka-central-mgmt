# WebWaka Central Management (`webwaka-central-mgmt`) Implementation Plan

**Prepared by:** Manus AI
**Date:** April 2026
**Target Repository:** `webwaka-central-mgmt`

## 1. Executive Summary

`webwaka-central-mgmt` is the core event ingestion and billing engine for the WebWaka ecosystem. It processes cross-repo events, manages the centralized ledger, and orchestrates platform-wide webhooks. This plan details the next phase of enhancements to support real-time fraud detection, automated tax splitting, and multi-currency ledgers.

## 2. Current State vs. Target State

**Current State:**
- Basic event ingestion via `POST /events/ingest`.
- AI usage billing and quota management.
- Simple ledger entries for commerce payouts.

**Target State:**
- Real-time fraud scoring engine for all financial events.
- Automated VAT and WHT (Withholding Tax) splitting.
- Multi-currency ledger support (NGN, GHS, KES).
- Dead-letter queue (DLQ) for failed webhook deliveries.

## 3. Enhancement Backlog (Top 20)

1. **Real-Time Fraud Scoring:** Analyze incoming events (e.g., `commerce.order.placed`) against a rules engine.
2. **Automated Tax Splitting:** Automatically split VAT (7.5%) and WHT from incoming payouts.
3. **Multi-Currency Ledger:** Update the `ledger_entries` table to support currency codes.
4. **Webhook Dead-Letter Queue (DLQ):** Store failed webhook deliveries and implement exponential backoff retries.
5. **Idempotency Key Enforcement:** Reject duplicate events based on `eventId` within a 24-hour window.
6. **Subscription Billing Engine:** Automatically generate monthly invoices for SaaS tiers.
7. **Usage-Based Billing Aggregator:** Aggregate AI and SMS usage into a single monthly invoice.
8. **Paystack Split Payment Integration:** Automatically route funds to sub-accounts via Paystack API.
9. **NIBSS NIP Outbound Transfers:** Initiate direct bank transfers for tenant payouts.
10. **Event Replay API:** Allow super admins to replay specific events from the archive.
11. **Ledger Reconciliation Job:** Nightly cron job to verify ledger balances against external payment gateways.
12. **Tenant Suspension Hook:** Automatically suspend tenants with overdue invoices.
13. **Custom Event Routing:** Allow tenants to route specific events to custom AWS EventBridge/SQS targets.
14. **Rate Limiting Engine:** Enforce API rate limits per tenant based on their subscription tier.
15. **Data Retention Pruner:** Automatically archive events older than 90 days to R2 storage.
16. **Compliance Reporting API:** Generate automated NDPR/CBN compliance reports.
17. **Referral Commission Engine:** Automatically calculate and credit referral bonuses.
18. **Dynamic Pricing Rules:** Support custom pricing agreements for enterprise tenants.
19. **SMS Usage Billing:** Track and bill for Termii SMS notifications.
20. **Platform Status Broadcaster:** Automatically update the public status page during outages.

## 4. Execution Phases

### Phase 1: Financial Integrity
- Implement Idempotency Key Enforcement.
- Implement Automated Tax Splitting.
- Implement Multi-Currency Ledger.

### Phase 2: Security & Fraud
- Implement Real-Time Fraud Scoring.
- Implement Tenant Suspension Hook.

### Phase 3: Reliability
- Implement Webhook Dead-Letter Queue (DLQ).
- Implement Data Retention Pruner.

## 5. Replit Execution Prompts

**Prompt 1: Idempotency Key Enforcement**
```text
You are the Replit execution agent for `webwaka-central-mgmt`.
Task: Implement Idempotency Key Enforcement.
1. Open `src/worker.ts`.
2. In the `POST /events/ingest` handler, check if the `eventId` exists in a new D1 table `processed_events`.
3. If it exists, return a 200 OK immediately (idempotent).
4. If not, process the event and insert the `eventId` into the table.
```

**Prompt 2: Automated Tax Splitting**
```text
You are the Replit execution agent for `webwaka-central-mgmt`.
Task: Implement Automated Tax Splitting.
1. Create `src/modules/billing/tax.ts`.
2. Implement `calculateTaxes(amount: number)` to return VAT (7.5%) and WHT (5%).
3. Update the `commerce.payout.processed` event handler to create separate ledger entries for the net amount, VAT, and WHT.
```

-- Migration 001: Central Management Schema
-- 
-- Creates the core tables for the Central Management service:
--   - ledger_entries: Immutable double-entry ledger (Part 10.1 MGMT-4)
--   - central_mgmt_events: Inbound event log from transport and commerce
--
-- Blueprint Reference: Part 10.1 (Central Management & Economics)
-- Blueprint Reference: Part 9.2 (Monetary Integrity — integer kobo only)
-- Added: 2026-04-01 — Remediation Issue #7

-- ─── Ledger Entries ───────────────────────────────────────────────────────────
-- Immutable double-entry ledger. NEVER UPDATE or DELETE rows.
-- All monetary values are stored as integer kobo (NGN × 100).
CREATE TABLE IF NOT EXISTS ledger_entries (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL,
  account_id      TEXT NOT NULL,         -- e.g. 'platform_revenue', 'operator_abc123', 'vendor_xyz'
  account_type    TEXT NOT NULL,         -- 'platform' | 'operator' | 'vendor'
  type            TEXT NOT NULL,         -- 'credit' | 'debit'
  amount_kobo     INTEGER NOT NULL CHECK (amount_kobo > 0),
  currency        TEXT NOT NULL DEFAULT 'NGN',
  status          TEXT NOT NULL DEFAULT 'cleared', -- 'pending' | 'cleared' | 'failed'
  metadata_json   TEXT,
  created_at      INTEGER NOT NULL       -- Unix timestamp ms
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_ledger_account_id ON ledger_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_ledger_transaction_id ON ledger_entries(transaction_id);
CREATE INDEX IF NOT EXISTS idx_ledger_account_type ON ledger_entries(account_type);
CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries(created_at DESC);

-- ─── Central Mgmt Events ──────────────────────────────────────────────────────
-- Inbound event log from transport and commerce services.
-- Provides idempotency (source_event_id UNIQUE) and audit trail.
CREATE TABLE IF NOT EXISTS central_mgmt_events (
  id                TEXT PRIMARY KEY,
  event_type        TEXT NOT NULL,       -- e.g. 'transport.booking.confirmed'
  source_event_id   TEXT NOT NULL UNIQUE, -- original aggregate_id for idempotency
  tenant_id         TEXT,
  payload_json      TEXT,
  processed         INTEGER NOT NULL DEFAULT 0,  -- 0 = pending, 1 = processed
  received_at       INTEGER NOT NULL,    -- Unix timestamp ms
  processed_at      INTEGER             -- Unix timestamp ms, NULL if not yet processed
);

CREATE INDEX IF NOT EXISTS idx_cme_event_type ON central_mgmt_events(event_type);
CREATE INDEX IF NOT EXISTS idx_cme_tenant_id ON central_mgmt_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cme_processed ON central_mgmt_events(processed);
CREATE INDEX IF NOT EXISTS idx_cme_received_at ON central_mgmt_events(received_at DESC);

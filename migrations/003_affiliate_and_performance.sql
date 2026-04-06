-- Migration 003: Affiliate Engine, Ledger Hash Chain, Compound Performance Indexes
--
-- WCM-001: Adds cryptographic hash chaining columns to ledger_entries for immutability
-- WCM-003: Introduces the affiliates table for the multi-level commission engine
-- WCM-009: Adds compound/covering indexes for high-frequency ledger query patterns
--
-- Added: 2026-04-06 — Taskbook execution (WCM-001/003/009)

-- ─── WCM-001: Ledger Immutability — Cryptographic Hash Chain ─────────────────
-- Add hash chain columns to ledger_entries.
-- previous_hash: SHA-256 hex of the previous entry (GENESIS for the first entry)
-- entry_hash:    SHA-256 hex of this entry's canonical fields
-- These columns allow offline integrity verification of the entire ledger chain.
ALTER TABLE ledger_entries ADD COLUMN previous_hash TEXT NOT NULL DEFAULT 'GENESIS';
ALTER TABLE ledger_entries ADD COLUMN entry_hash    TEXT NOT NULL DEFAULT '';

-- ─── WCM-003: Affiliate Engine ────────────────────────────────────────────────
-- Stores the multi-level affiliate hierarchy (up to 5 levels deep).
CREATE TABLE IF NOT EXISTS affiliates (
  id              TEXT PRIMARY KEY,                   -- e.g. 'aff_<uuid>'
  user_id         TEXT NOT NULL,                      -- platform user or tenant ID
  parent_id       TEXT,                               -- NULL for top-level affiliates
  level           INTEGER NOT NULL CHECK (level BETWEEN 1 AND 5),
  commission_rate REAL    NOT NULL CHECK (commission_rate >= 0 AND commission_rate <= 1),
  status          TEXT    NOT NULL DEFAULT 'active',  -- 'active' | 'inactive'
  created_at      INTEGER NOT NULL,                   -- Unix timestamp ms
  updated_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aff_user_id   ON affiliates(user_id);
CREATE INDEX IF NOT EXISTS idx_aff_parent_id ON affiliates(parent_id);
CREATE INDEX IF NOT EXISTS idx_aff_status    ON affiliates(status);

-- Commission payouts ledger — records each calculated commission split
CREATE TABLE IF NOT EXISTS affiliate_commissions (
  id              TEXT PRIMARY KEY,
  transaction_id  TEXT NOT NULL,                      -- source ledger transaction_id
  affiliate_id    TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  level           INTEGER NOT NULL,
  amount_kobo     INTEGER NOT NULL CHECK (amount_kobo > 0),
  currency        TEXT    NOT NULL DEFAULT 'NGN',
  status          TEXT    NOT NULL DEFAULT 'pending', -- 'pending' | 'paid' | 'cancelled'
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_aff_comm_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX IF NOT EXISTS idx_aff_comm_txn       ON affiliate_commissions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_aff_comm_status    ON affiliate_commissions(status);
CREATE INDEX IF NOT EXISTS idx_aff_comm_created   ON affiliate_commissions(created_at DESC);

-- ─── WCM-009: Compound Indexes for Ledger Query Performance ──────────────────
-- These support the most common query shapes in worker.ts GET /api/ledger/entries

-- (account_id, created_at): most frequent — filter by account, order by time
CREATE INDEX IF NOT EXISTS idx_ledger_acct_time
  ON ledger_entries(account_id, created_at DESC);

-- (account_type, created_at): summary queries group by type
CREATE INDEX IF NOT EXISTS idx_ledger_type_time
  ON ledger_entries(account_type, created_at DESC);

-- (currency, status, created_at): balance summary filtered by currency + cleared
CREATE INDEX IF NOT EXISTS idx_ledger_currency_status
  ON ledger_entries(currency, status, created_at DESC);

-- (transaction_id, type): double-entry pair lookup (debit + credit for same txn)
CREATE INDEX IF NOT EXISTS idx_ledger_txn_type
  ON ledger_entries(transaction_id, type);

-- Central mgmt events: compound index for velocity fraud check
-- (tenant_id, event_type, received_at): used in fraud scoring velocity rule
CREATE INDEX IF NOT EXISTS idx_cme_velocity
  ON central_mgmt_events(tenant_id, event_type, received_at DESC);

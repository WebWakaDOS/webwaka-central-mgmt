-- Migration 002: Enhancements — Idempotency, AI Ledgers, DLQ, Fraud, Suspension, FX Rates
--
-- Phase 1: Financial Integrity (Idempotency, Tax Splitting, Multi-Currency)
-- Phase 2: Security & Fraud (Fraud Scoring, Tenant Suspension)
-- Phase 3: Reliability (Webhook DLQ, Data Retention)
--
-- Added: 2026-04-04 — Implementation Plan v1

-- ─── Idempotency Keys ─────────────────────────────────────────────────────────
-- Strict 24-hour deduplication window for inbound events.
-- Keyed on the source aggregate_id. After expires_at the key may be replayed.
CREATE TABLE IF NOT EXISTS cmgt_idempotency_keys (
  event_id    TEXT PRIMARY KEY,
  event_type  TEXT NOT NULL,
  tenant_id   TEXT,
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL    -- epoch ms; reject duplicates until this time
);

CREATE INDEX IF NOT EXISTS idx_idem_expires ON cmgt_idempotency_keys(expires_at);

-- ─── AI Usage Ledger ──────────────────────────────────────────────────────────
-- Records individual AI capability invocations per tenant.
CREATE TABLE IF NOT EXISTS cmgt_ai_usage_ledger (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  capability_id     TEXT NOT NULL,
  model             TEXT NOT NULL,
  prompt_tokens     INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens      INTEGER NOT NULL DEFAULT 0,
  used_byok         INTEGER NOT NULL DEFAULT 0,   -- 0 = platform, 1 = BYOK
  estimated_cost_usd REAL,
  recorded_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_tenant     ON cmgt_ai_usage_ledger(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_capability ON cmgt_ai_usage_ledger(capability_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_recorded   ON cmgt_ai_usage_ledger(recorded_at DESC);

-- ─── AI Quota Ledger ──────────────────────────────────────────────────────────
-- Tracks allocated vs consumed token budget per tenant.
CREATE TABLE IF NOT EXISTS cmgt_ai_quota_ledger (
  id               TEXT PRIMARY KEY,
  tenant_id        TEXT NOT NULL UNIQUE,
  tokens_allocated INTEGER NOT NULL DEFAULT 0,
  tokens_consumed  INTEGER NOT NULL DEFAULT 0,
  reset_at         INTEGER,
  updated_at       INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_quota_tenant ON cmgt_ai_quota_ledger(tenant_id);

-- ─── Webhook Dead-Letter Queue ────────────────────────────────────────────────
-- Stores failed outbound webhook deliveries for exponential-backoff retry.
-- Max 5 attempts; after that status = 'exhausted'.
CREATE TABLE IF NOT EXISTS cmgt_webhook_dlq (
  id            TEXT PRIMARY KEY,
  event_id      TEXT NOT NULL,
  event_type    TEXT NOT NULL,
  tenant_id     TEXT,
  target_url    TEXT NOT NULL,
  payload_json  TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  last_error    TEXT,
  next_retry_at INTEGER,                    -- NULL when exhausted or delivered
  status        TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'retrying' | 'delivered' | 'exhausted'
  created_at    INTEGER NOT NULL,
  delivered_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_dlq_status     ON cmgt_webhook_dlq(status);
CREATE INDEX IF NOT EXISTS idx_dlq_next_retry ON cmgt_webhook_dlq(next_retry_at);
CREATE INDEX IF NOT EXISTS idx_dlq_tenant     ON cmgt_webhook_dlq(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dlq_created    ON cmgt_webhook_dlq(created_at DESC);

-- ─── Fraud Scores ─────────────────────────────────────────────────────────────
-- Stores the fraud evaluation result for each inbound event.
CREATE TABLE IF NOT EXISTS cmgt_fraud_scores (
  id           TEXT PRIMARY KEY,
  event_id     TEXT NOT NULL,
  event_type   TEXT NOT NULL,
  tenant_id    TEXT,
  score        INTEGER NOT NULL,      -- 0–100
  risk_level   TEXT NOT NULL,         -- 'low' | 'medium' | 'high' | 'critical'
  signals_json TEXT,                  -- JSON array of FraudSignal objects
  action       TEXT NOT NULL,         -- 'allow' | 'flag' | 'block'
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_fraud_event_id ON cmgt_fraud_scores(event_id);
CREATE INDEX IF NOT EXISTS idx_fraud_tenant   ON cmgt_fraud_scores(tenant_id);
CREATE INDEX IF NOT EXISTS idx_fraud_risk     ON cmgt_fraud_scores(risk_level);
CREATE INDEX IF NOT EXISTS idx_fraud_created  ON cmgt_fraud_scores(created_at DESC);

-- ─── Tenant Suspension Log ────────────────────────────────────────────────────
-- Immutable audit trail of every tenant suspend / unsuspend action.
CREATE TABLE IF NOT EXISTS cmgt_tenant_suspension_log (
  id           TEXT PRIMARY KEY,
  tenant_id    TEXT NOT NULL,
  action       TEXT NOT NULL,     -- 'suspend' | 'unsuspend'
  reason       TEXT NOT NULL,
  suspended_by TEXT,              -- 'system' | admin userId
  created_at   INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_susp_tenant  ON cmgt_tenant_suspension_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_susp_created ON cmgt_tenant_suspension_log(created_at DESC);

-- ─── FX Rates ─────────────────────────────────────────────────────────────────
-- Approximate exchange rates relative to NGN for multi-currency ledger support.
-- Updated by super-admin or an external rate-refresh job.
CREATE TABLE IF NOT EXISTS cmgt_fx_rates (
  id          TEXT PRIMARY KEY,
  currency    TEXT NOT NULL UNIQUE,  -- ISO 4217 code, e.g. 'GHS', 'KES'
  rate_to_ngn REAL NOT NULL,         -- 1 unit of this currency = N NGN
  updated_at  INTEGER NOT NULL
);

-- Seed default rates (approximate as of April 2026)
INSERT OR IGNORE INTO cmgt_fx_rates (id, currency, rate_to_ngn, updated_at) VALUES
  ('fx_ngn', 'NGN', 1.0,  0),
  ('fx_ghs', 'GHS', 90.0, 0),
  ('fx_kes', 'KES', 5.5,  0);

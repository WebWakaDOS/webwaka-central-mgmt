/**
 * Data Retention Pruner
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Phase 3 — Reliability
 *
 * Deletes or archives records older than the configured retention window (90 days).
 *
 * Tables pruned:
 *   - central_mgmt_events  (processed events only — keeps unprocessed for audit)
 *   - fraud_scores         (all records older than cutoff)
 *   - webhook_dlq          (delivered or exhausted entries older than cutoff)
 *   - idempotency_keys     (expired keys — uses their own expires_at timestamp)
 *
 * Ledger tables (ledger_entries, ai_usage_ledger) are NEVER deleted — they are
 * the immutable financial record of the platform.
 */

const RETENTION_DAYS = 90;
const RETENTION_MS   = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface PrunerResult {
  cutoffMs: number;
  prunedEvents: number;
  prunedFraudScores: number;
  prunedDLQEntries: number;
  prunedIdempotencyKeys: number;
  totalPruned: number;
}

/**
 * Run the data retention pruner.
 * Safe to call multiple times (idempotent deletes).
 *
 * @param db  D1 database binding
 */
export async function pruneOldData(db: D1Database): Promise<PrunerResult> {
  const cutoffMs = Date.now() - RETENTION_MS;
  const now      = Date.now();

  const [eventsResult, fraudResult, dlqResult, idemResult] = await Promise.all([
    // Processed events older than 90 days
    db
      .prepare(
        `DELETE FROM central_mgmt_events
         WHERE processed = 1 AND received_at < ?`,
      )
      .bind(cutoffMs)
      .run(),

    // Fraud scores older than 90 days
    db
      .prepare(`DELETE FROM fraud_scores WHERE created_at < ?`)
      .bind(cutoffMs)
      .run(),

    // Delivered or exhausted DLQ entries older than 90 days
    db
      .prepare(
        `DELETE FROM webhook_dlq
         WHERE status IN ('delivered', 'exhausted') AND created_at < ?`,
      )
      .bind(cutoffMs)
      .run(),

    // Expired idempotency keys (use their own expires_at timestamp)
    db
      .prepare(`DELETE FROM idempotency_keys WHERE expires_at < ?`)
      .bind(now)
      .run(),
  ]);

  const prunedEvents          = eventsResult.meta.changes;
  const prunedFraudScores     = fraudResult.meta.changes;
  const prunedDLQEntries      = dlqResult.meta.changes;
  const prunedIdempotencyKeys = idemResult.meta.changes;

  return {
    cutoffMs,
    prunedEvents,
    prunedFraudScores,
    prunedDLQEntries,
    prunedIdempotencyKeys,
    totalPruned: prunedEvents + prunedFraudScores + prunedDLQEntries + prunedIdempotencyKeys,
  };
}

/**
 * Webhook Dead-Letter Queue (DLQ)
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Phase 3 — Reliability
 *
 * Stores failed outbound webhook delivery attempts and retries them with
 * exponential backoff (base 30 s, max 5 attempts → 'exhausted').
 *
 * Retry schedule:
 *   Attempt 1 → 30 s
 *   Attempt 2 → 60 s
 *   Attempt 3 → 120 s
 *   Attempt 4 → 240 s
 *   Attempt 5 → exhausted (no further retry)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DLQEntry {
  id: string;
  event_id: string;
  event_type: string;
  tenant_id: string | null;
  target_url: string;
  payload_json: string;
  attempts: number;
  last_error: string | null;
  next_retry_at: number | null;
  status: 'pending' | 'retrying' | 'delivered' | 'exhausted';
  created_at: number;
  delivered_at: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS   = 5;
const BASE_DELAY_MS  = 30_000; // 30 seconds

function retryDelayMs(attemptsDone: number): number {
  return BASE_DELAY_MS * Math.pow(2, attemptsDone - 1);
  // attempts=1 → 30 s, 2 → 60 s, 3 → 120 s, 4 → 240 s
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a failed webhook delivery for later retry.
 *
 * @param db         D1 database binding
 * @param eventId    Source event ID
 * @param eventType  Event type string
 * @param tenantId   Optional tenant identifier
 * @param targetUrl  Destination webhook URL
 * @param payload    Event payload (will be JSON-serialised)
 * @returns          The new DLQ entry ID
 */
export async function enqueueDLQ(
  db: D1Database,
  eventId: string,
  eventType: string,
  tenantId: string | undefined,
  targetUrl: string,
  payload: unknown,
): Promise<string> {
  const id  = `dlq_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();

  await db
    .prepare(
      `INSERT INTO webhook_dlq
         (id, event_id, event_type, tenant_id, target_url, payload_json,
          attempts, last_error, next_retry_at, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, 'pending', ?)`,
    )
    .bind(
      id,
      eventId,
      eventType,
      tenantId ?? null,
      targetUrl,
      typeof payload === 'string' ? payload : JSON.stringify(payload),
      now + BASE_DELAY_MS,
      now,
    )
    .run();

  return id;
}

/**
 * Process all DLQ entries whose `next_retry_at` is past due.
 * Called from the admin retry endpoint or a scheduled cron handler.
 *
 * @returns Summary of this retry pass.
 */
export async function retryDueDLQItems(db: D1Database): Promise<{
  processed: number;
  delivered: number;
  exhausted: number;
  rescheduled: number;
}> {
  const now = Date.now();

  const { results } = await db
    .prepare(
      `SELECT * FROM webhook_dlq
       WHERE status IN ('pending', 'retrying') AND next_retry_at <= ?
       ORDER BY next_retry_at ASC
       LIMIT 50`,
    )
    .bind(now)
    .all<DLQEntry>();

  let delivered   = 0;
  let exhausted   = 0;
  let rescheduled = 0;

  for (const item of results) {
    const newAttempts = item.attempts + 1;

    try {
      const resp = await fetch(item.target_url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: item.payload_json,
        signal: AbortSignal.timeout(10_000),
      });

      if (resp.ok) {
        await db
          .prepare(
            `UPDATE webhook_dlq
             SET status = 'delivered', delivered_at = ?, attempts = ?
             WHERE id = ?`,
          )
          .bind(now, newAttempts, item.id)
          .run();
        delivered++;
      } else {
        throw new Error(`HTTP ${resp.status} ${resp.statusText}`);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);

      if (newAttempts >= MAX_ATTEMPTS) {
        await db
          .prepare(
            `UPDATE webhook_dlq
             SET status = 'exhausted', attempts = ?, last_error = ?, next_retry_at = NULL
             WHERE id = ?`,
          )
          .bind(newAttempts, errMsg, item.id)
          .run();
        exhausted++;
      } else {
        const nextRetry = now + retryDelayMs(newAttempts);
        await db
          .prepare(
            `UPDATE webhook_dlq
             SET status = 'retrying', attempts = ?, last_error = ?, next_retry_at = ?
             WHERE id = ?`,
          )
          .bind(newAttempts, errMsg, nextRetry, item.id)
          .run();
        rescheduled++;
      }
    }
  }

  return { processed: results.length, delivered, exhausted, rescheduled };
}

/**
 * Fetch paginated DLQ entries.
 */
export async function listDLQEntries(
  db: D1Database,
  status?: DLQEntry['status'],
  limit = 50,
  offset = 0,
): Promise<DLQEntry[]> {
  if (status) {
    const { results } = await db
      .prepare(
        `SELECT * FROM webhook_dlq WHERE status = ?
         ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      )
      .bind(status, limit, offset)
      .all<DLQEntry>();
    return results;
  }

  const { results } = await db
    .prepare(
      `SELECT * FROM webhook_dlq ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .bind(limit, offset)
    .all<DLQEntry>();
  return results;
}

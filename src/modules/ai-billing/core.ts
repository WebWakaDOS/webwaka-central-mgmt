/**
 * AI Usage Billing Module — webwaka-central-mgmt
 * Blueprint Reference: WEBWAKA_AI_PLATFORM_ARCHITECTURE.md — "Usage Billing"
 *
 * Task: CEN-1 — Implement AI usage billing hook
 *
 * Processes `ai.usage.recorded` events emitted by webwaka-ai-platform.
 * For each event, this module:
 *   1. Records the AI usage in the `cmgt_ai_usage_ledger` table
 *   2. Debits the tenant's AI quota (token balance) in `cmgt_ai_quota_ledger`
 *   3. Emits a billing.debit.recorded event if the tenant is on a metered plan
 *
 * D1 Schema (run via migration):
 *   CREATE TABLE IF NOT EXISTS cmgt_ai_usage_ledger (
 *     id TEXT PRIMARY KEY,
 *     tenant_id TEXT NOT NULL,
 *     capability_id TEXT NOT NULL,
 *     model TEXT NOT NULL,
 *     prompt_tokens INTEGER NOT NULL DEFAULT 0,
 *     completion_tokens INTEGER NOT NULL DEFAULT 0,
 *     total_tokens INTEGER NOT NULL DEFAULT 0,
 *     used_byok INTEGER NOT NULL DEFAULT 0,
 *     estimated_cost_usd REAL,
 *     recorded_at INTEGER NOT NULL
 *   );
 *
 *   CREATE TABLE IF NOT EXISTS cmgt_ai_quota_ledger (
 *     id TEXT PRIMARY KEY,
 *     tenant_id TEXT NOT NULL,
 *     tokens_allocated INTEGER NOT NULL DEFAULT 0,
 *     tokens_consumed INTEGER NOT NULL DEFAULT 0,
 *     reset_at INTEGER,
 *     updated_at INTEGER NOT NULL
 *   );
 */

export interface AIUsagePayload {
  capabilityId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  usedByok: boolean;
  estimatedCostUsd?: number;
}

export interface AIUsageBillingEnv {
  DB: D1Database;
  PLATFORM_KV: KVNamespace;
  /** KV namespace for outbound event queue (write-only from emitter side) */
  EVENTS?: KVNamespace;
  /** Optional HTTP endpoint to forward events to a central event router */
  EVENT_BUS_URL?: string;
}

/**
 * Process an `ai.usage.recorded` event.
 * Called from the central-mgmt event ingestion endpoint.
 *
 * @param env       Worker environment bindings
 * @param tenantId  The tenant that consumed the AI capability
 * @param payload   Usage details from the event
 * @param eventId   The unique event ID (for idempotency)
 */
export async function processAIUsageEvent(
  env: AIUsageBillingEnv,
  tenantId: string,
  payload: AIUsagePayload,
  eventId: string,
): Promise<{ recorded: boolean; quotaExceeded: boolean }> {
  const now = Date.now();

  // ─── 1. Record usage in cmgt_ai_usage_ledger (idempotent via INSERT OR IGNORE) ──
  await env.DB.prepare(
    `INSERT OR IGNORE INTO cmgt_ai_usage_ledger
       (id, tenant_id, capability_id, model, prompt_tokens, completion_tokens,
        total_tokens, used_byok, estimated_cost_usd, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    eventId,
    tenantId,
    payload.capabilityId,
    payload.model,
    payload.promptTokens,
    payload.completionTokens,
    payload.totalTokens,
    payload.usedByok ? 1 : 0,
    payload.estimatedCostUsd ?? null,
    now,
  ).run();

  // ─── 2. Update cmgt_ai_quota_ledger ────────────────────────────────────────────
  // Upsert: if no quota record exists, create one with a default allocation
  const DEFAULT_MONTHLY_TOKENS = 1_000_000; // 1M tokens/month default

  const existing = await env.DB.prepare(
    `SELECT id, tokens_allocated, tokens_consumed FROM cmgt_ai_quota_ledger WHERE tenant_id = ?`
  ).bind(tenantId).first<{ id: string; tokens_allocated: number; tokens_consumed: number }>();

  let quotaExceeded = false;

  if (!existing) {
    // Create initial quota record
    await env.DB.prepare(
      `INSERT INTO cmgt_ai_quota_ledger
         (id, tenant_id, tokens_allocated, tokens_consumed, updated_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(
      `quota_${tenantId}`,
      tenantId,
      DEFAULT_MONTHLY_TOKENS,
      payload.totalTokens,
      now,
    ).run();
  } else {
    const newConsumed = existing.tokens_consumed + payload.totalTokens;
    quotaExceeded = newConsumed > existing.tokens_allocated;

    await env.DB.prepare(
      `UPDATE cmgt_ai_quota_ledger SET tokens_consumed = ?, updated_at = ? WHERE tenant_id = ?`
    ).bind(newConsumed, now, tenantId).run();

    // ─── 3. Emit billing.debit.recorded for metered tenants ─────────────────
    // Only emit if: tenant is NOT using BYOK (platform bears the cost) AND
    // there is an estimated cost to bill.
    if (!payload.usedByok && payload.estimatedCostUsd && payload.estimatedCostUsd > 0) {
      const costKobo = Math.round(payload.estimatedCostUsd * 1650 * 100); // USD → NGN → kobo
      if (costKobo > 0) {
        // Write to cmgt_ledger_entries for financial record-keeping
        await env.DB.prepare(
          `INSERT OR IGNORE INTO cmgt_ledger_entries
             (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
           VALUES (?, ?, ?, 'tenant', 'debit', ?, 'NGN', 'cleared', ?, ?)`
        ).bind(
          `led_ai_${eventId}`,
          `txn_ai_${eventId}`,
          `tenant_${tenantId}`,
          costKobo,
          JSON.stringify({
            source: 'ai-platform',
            event_id: eventId,
            capability_id: payload.capabilityId,
            model: payload.model,
            total_tokens: payload.totalTokens,
            estimated_cost_usd: payload.estimatedCostUsd,
          }),
          now,
        ).run();

        // Emit billing.debit.recorded event to the platform event bus
        // This allows other services (e.g. notifications, analytics) to react
        await emitBillingEvent(env, tenantId, {
          event: 'billing.debit.recorded',
          tenantId,
          payload: {
            source: 'ai-platform',
            eventId,
            capabilityId: payload.capabilityId,
            model: payload.model,
            totalTokens: payload.totalTokens,
            amountKobo: costKobo,
            currency: 'NGN',
            estimatedCostUsd: payload.estimatedCostUsd,
          },
          timestamp: now,
        });
      }
    }
  }

  return { recorded: true, quotaExceeded };
}

/**
 * Emit a billing event to the platform event bus.
 * Uses KV outbox pattern (write to EVENTS KV, optionally forward via HTTP).
 * Non-fatal — failures are logged and swallowed.
 */
async function emitBillingEvent(
  env: AIUsageBillingEnv,
  tenantId: string,
  event: { event: string; tenantId: string; payload: unknown; timestamp: number },
): Promise<void> {
  const key = `event:${Date.now()}:${crypto.randomUUID()}`;
  const body = JSON.stringify(event);

  // 1. Write to EVENTS KV outbox
  if (env.EVENTS) {
    try {
      await env.EVENTS.put(key, body, { expirationTtl: 86400 });
    } catch (err) {
      console.warn(`[ai-billing] Failed to write billing event to KV: ${err}`);
    }
  }

  // 2. HTTP delivery (fire-and-forget)
  if (env.EVENT_BUS_URL) {
    try {
      await fetch(env.EVENT_BUS_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(5000),
      });
    } catch (err) {
      console.warn(`[ai-billing] Failed to forward billing event via HTTP: ${err}`);
    }
  }
}

/**
 * Get AI usage summary for a tenant.
 * Used by the admin API to display usage dashboards.
 */
export async function getAIUsageSummary(
  env: AIUsageBillingEnv,
  tenantId: string,
  sinceMs?: number,
): Promise<{
  totalTokens: number;
  totalRequests: number;
  estimatedCostUsd: number;
  byCapability: Array<{ capabilityId: string; totalTokens: number; requests: number }>;
}> {
  const since = sinceMs ?? (Date.now() - 30 * 24 * 60 * 60 * 1000); // default: last 30 days

  const summary = await env.DB.prepare(
    `SELECT
       SUM(total_tokens) as total_tokens,
       COUNT(*) as total_requests,
       SUM(COALESCE(estimated_cost_usd, 0)) as estimated_cost_usd
     FROM cmgt_ai_usage_ledger
     WHERE tenant_id = ? AND recorded_at >= ?`
  ).bind(tenantId, since).first<{
    total_tokens: number;
    total_requests: number;
    estimated_cost_usd: number;
  }>();

  const byCapability = await env.DB.prepare(
    `SELECT
       capability_id as capabilityId,
       SUM(total_tokens) as totalTokens,
       COUNT(*) as requests
     FROM cmgt_ai_usage_ledger
     WHERE tenant_id = ? AND recorded_at >= ?
     GROUP BY capability_id
     ORDER BY totalTokens DESC`
  ).bind(tenantId, since).all<{ capabilityId: string; totalTokens: number; requests: number }>();

  return {
    totalTokens: summary?.total_tokens ?? 0,
    totalRequests: summary?.total_requests ?? 0,
    estimatedCostUsd: summary?.estimated_cost_usd ?? 0,
    byCapability: byCapability.results,
  };
}

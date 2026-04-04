/**
 * WebWaka Central Management — Cloudflare Worker Entry Point
 *
 * Exposes the Ledger, Affiliate, and Super Admin modules as HTTP endpoints.
 * Receives inbound events from transport, commerce, and AI platform via POST /events/ingest.
 *
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 * Blueprint Reference: Part 9.1 (Cloudflare-First: D1, KV, Workers)
 * Blueprint Reference: Part 9.3 (Platform Conventions — RBAC)
 *
 * Added: 2026-04-01 — Remediation Issue #7 (missing HTTP worker)
 * Updated: 2026-04-04 — Phase 1/2/3 enhancements:
 *   Phase 1 — Financial Integrity: idempotency keys, automated tax splitting (VAT+WHT), multi-currency
 *   Phase 2 — Security & Fraud: real-time fraud scoring, tenant suspension hook
 *   Phase 3 — Reliability: webhook DLQ, data retention pruner
 */
import { Hono }                                          from 'hono';
import { jwtAuthMiddleware, requireRole }                from '@webwaka/core';
import { processAIUsageEvent }                           from './modules/ai-billing/core';
import { calculateTaxes, convertToNGNKobo, isSupportedCurrency } from './modules/billing/tax';
import { scoreFraudEvent }                               from './modules/fraud/core';
import { enqueueDLQ, retryDueDLQItems, listDLQEntries } from './modules/webhooks/dlq';
import { pruneOldData }                                  from './modules/retention/pruner';
import {
  suspendTenant,
  unsuspendTenant,
  isTenantSuspended,
  getTenantSuspensionLog,
}                                                        from './modules/super-admin/suspension';

// ─── Environment ──────────────────────────────────────────────────────────────

export interface Env {
  DB: D1Database;
  PLATFORM_KV: KVNamespace;
  JWT_SECRET: string;
  INTER_SERVICE_SECRET: string;
  ENVIRONMENT?: string;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

// ─── Idempotency helpers ──────────────────────────────────────────────────────

const IDEMPOTENCY_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Check whether an aggregate_id has been processed within the last 24 hours.
 * Returns true if it already exists (duplicate → caller should return early).
 */
async function checkIdempotency(
  db: D1Database,
  aggregateId: string,
): Promise<boolean> {
  const row = await db
    .prepare('SELECT event_id FROM idempotency_keys WHERE event_id = ? AND expires_at > ?')
    .bind(aggregateId, Date.now())
    .first<{ event_id: string }>();
  return row !== null;
}

/**
 * Register an aggregate_id as processed for the next 24 hours.
 */
async function registerIdempotencyKey(
  db: D1Database,
  aggregateId: string,
  eventType: string,
  tenantId?: string,
): Promise<void> {
  const now      = Date.now();
  const expiresAt = now + IDEMPOTENCY_WINDOW_MS;
  await db
    .prepare(
      `INSERT OR IGNORE INTO idempotency_keys
         (event_id, event_type, tenant_id, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(aggregateId, eventType, tenantId ?? null, now, expiresAt)
    .run();
}

// ─── Health ───────────────────────────────────────────────────────────────────

app.get('/health', (c) =>
  c.json({
    success: true,
    data: {
      service: 'webwaka-central-mgmt',
      status: 'healthy',
      modules: ['ledger', 'affiliate', 'super-admin'],
      enhancements: ['idempotency', 'tax-splitting', 'multi-currency', 'fraud-scoring', 'tenant-suspension', 'webhook-dlq', 'data-retention'],
      environment: c.env.ENVIRONMENT ?? 'development',
      timestamp: Date.now(),
    },
  }),
);

// ─── Inter-service event ingestion ───────────────────────────────────────────
/**
 * POST /events/ingest
 * Receives ledger events from transport and commerce services.
 * Authenticated via Authorization: Bearer {INTER_SERVICE_SECRET}.
 *
 * Accepted event types:
 *   - transport.booking.confirmed  → credit platform revenue + operator accounts
 *   - transport.booking.refunded   → debit platform revenue account
 *   - commerce.order.paid          → credit platform commission account
 *   - commerce.payout.processed    → debit vendor escrow; split VAT + WHT
 *   - ai.usage.recorded            → AI billing / quota deduction
 *
 * Phase 1 — Financial Integrity:
 *   • Idempotency keys (24 h window) — rejects duplicate aggregate_ids
 *   • Automated tax splitting for commerce.payout.processed (VAT 7.5%, WHT 5%)
 *   • Multi-currency support (NGN, GHS, KES via fx_rates table)
 *
 * Phase 2 — Security & Fraud:
 *   • Fraud scoring on all financial events; BLOCK action returns 422
 *   • Tenant suspension check; suspended tenants are rejected with 403
 */
app.post('/events/ingest', async (c) => {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const authHeader     = c.req.header('Authorization');
  const expectedSecret = c.env.INTER_SERVICE_SECRET;
  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: {
    event_type: string;
    aggregate_id: string;
    tenant_id?: string;
    payload: Record<string, unknown>;
    timestamp: number;
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const { event_type, aggregate_id, tenant_id, payload, timestamp } = body;
  if (!event_type || !aggregate_id) {
    return c.json(
      { success: false, error: 'Missing required fields: event_type, aggregate_id' },
      400,
    );
  }

  // ── Phase 1: Idempotency key enforcement (24-hour window) ──────────────────
  const isDuplicate = await checkIdempotency(c.env.DB, aggregate_id);
  if (isDuplicate) {
    return c.json({
      success: true,
      message: 'Already processed (idempotency key)',
      aggregate_id,
    });
  }

  // ── Phase 2: Tenant suspension check ───────────────────────────────────────
  if (tenant_id) {
    const suspended = await isTenantSuspended(c.env.PLATFORM_KV, tenant_id);
    if (suspended) {
      return c.json(
        { success: false, error: `Tenant ${tenant_id} is suspended. Event rejected.` },
        403,
      );
    }
  }

  // ── Phase 1: Resolve currency (default NGN) ─────────────────────────────────
  const rawCurrency  = (payload.currency as string | undefined) ?? 'NGN';
  const currency     = isSupportedCurrency(rawCurrency) ? rawCurrency : 'NGN';

  // ── Generate event ID ───────────────────────────────────────────────────────
  const now     = Date.now();
  const eventId = `cme_${now}_${Math.random().toString(36).slice(2, 9)}`;

  // ── Phase 2: Fraud scoring for financial events ────────────────────────────
  const financialEventTypes = new Set([
    'transport.booking.confirmed',
    'transport.booking.refunded',
    'commerce.order.paid',
    'commerce.payout.processed',
  ]);

  if (financialEventTypes.has(event_type)) {
    // Determine raw amount from payload for fraud scoring
    const rawAmount =
      (payload.total_amount as number | undefined) ??
      (payload.amount_kobo as number | undefined) ??
      (payload.refund_amount_kobo as number | undefined) ??
      undefined;

    // Convert to NGN kobo for a consistent comparison
    const amountNGNKobo = rawAmount != null && currency !== 'NGN'
      ? await convertToNGNKobo(rawAmount, currency, c.env.DB)
      : rawAmount;

    const fraud = await scoreFraudEvent(c.env.DB, {
      eventId: aggregate_id,
      eventType: event_type,
      tenantId: tenant_id,
      amountKobo: amountNGNKobo,
      payload,
    });

    if (fraud.action === 'block') {
      return c.json(
        {
          success: false,
          error: 'Event blocked by fraud scoring engine',
          fraud: { score: fraud.score, riskLevel: fraud.riskLevel, signals: fraud.signals },
        },
        422,
      );
    }

    // For 'flag' level, we continue processing but note it in the response (logged to fraud_scores already)
  }

  // ── Check legacy idempotency (source_event_id UNIQUE) ──────────────────────
  const existingEvent = await c.env.DB.prepare(
    `SELECT id FROM central_mgmt_events WHERE source_event_id = ?`,
  ).bind(aggregate_id).first<{ id: string }>();

  if (existingEvent) {
    return c.json({ success: true, message: 'Already processed', event_id: existingEvent.id });
  }

  // ── Record the inbound event ────────────────────────────────────────────────
  await c.env.DB.prepare(
    `INSERT INTO central_mgmt_events
       (id, event_type, source_event_id, tenant_id, payload_json, processed, received_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`,
  ).bind(eventId, event_type, aggregate_id, tenant_id ?? null, JSON.stringify(payload), now).run();

  // ── Process ledger entries based on event type ──────────────────────────────
  try {
    if (event_type === 'transport.booking.confirmed') {
      const amountKobo = payload.total_amount as number;
      const bookingId  = payload.booking_id as string;
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        // Convert to NGN if needed
        const amountNGN       = await convertToNGNKobo(amountKobo, currency, c.env.DB);
        const platformFeeKobo = Math.round(amountNGN * 0.05);
        const operatorKobo    = amountNGN - platformFeeKobo;
        const txnId           = `txn_trn_${bookingId}`;

        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, 'platform_revenue', 'platform', 'credit', ?, 'NGN', 'cleared', ?, ?)`,
          ).bind(
            `led_plat_${bookingId}`, txnId, platformFeeKobo,
            JSON.stringify({ source: 'transport', booking_id: bookingId, tenant_id, original_currency: currency }),
            now,
          ),
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, ?, 'operator', 'credit', ?, 'NGN', 'cleared', ?, ?)`,
          ).bind(
            `led_oper_${bookingId}`, txnId, `operator_${tenant_id ?? 'unknown'}`, operatorKobo,
            JSON.stringify({ source: 'transport', booking_id: bookingId, tenant_id, original_currency: currency }),
            now,
          ),
        ]);
      }

    } else if (event_type === 'transport.booking.refunded') {
      const amountKobo = payload.refund_amount_kobo as number;
      const bookingId  = payload.booking_id as string;
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        const amountNGN = await convertToNGNKobo(amountKobo, currency, c.env.DB);
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO ledger_entries
             (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
           VALUES (?, ?, 'platform_revenue', 'platform', 'debit', ?, 'NGN', 'cleared', ?, ?)`,
        ).bind(
          `led_ref_${bookingId}`,
          `txn_ref_${bookingId}`,
          amountNGN,
          JSON.stringify({ source: 'transport', booking_id: bookingId, refund: true, original_currency: currency }),
          now,
        ).run();
      }

    } else if (event_type === 'commerce.order.paid') {
      const amountKobo    = payload.amount_kobo as number;
      const orderId       = payload.order_id as string;
      const commissionBps = (payload.commission_bps as number) ?? 500;
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        const amountNGN      = await convertToNGNKobo(amountKobo, currency, c.env.DB);
        const commissionKobo = Math.round(amountNGN * commissionBps / 10_000);
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO ledger_entries
             (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
           VALUES (?, ?, 'platform_commission', 'platform', 'credit', ?, 'NGN', 'cleared', ?, ?)`,
        ).bind(
          `led_com_${orderId}`,
          `txn_com_${orderId}`,
          commissionKobo,
          JSON.stringify({ source: 'commerce', order_id: orderId, tenant_id, commission_bps: commissionBps, original_currency: currency }),
          now,
        ).run();
      }

    } else if (event_type === 'commerce.payout.processed') {
      // ── Phase 1: Automated Tax Splitting (VAT 7.5% + WHT 5%) ─────────────
      const amountKobo = payload.amount_kobo as number;
      const payoutId   = payload.payout_id as string;
      const vendorId   = (payload.vendor_id as string | undefined) ?? 'unknown';

      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        const amountNGN = await convertToNGNKobo(amountKobo, currency, c.env.DB);
        const taxes     = calculateTaxes(amountNGN, 'NGN');
        const txnId     = `txn_pay_${payoutId}`;

        const meta = JSON.stringify({
          source: 'commerce',
          payout_id: payoutId,
          vendor_id: vendorId,
          tax_breakdown: {
            gross_kobo: taxes.grossKobo,
            vat_kobo:   taxes.vatKobo,
            wht_kobo:   taxes.whtKobo,
            net_kobo:   taxes.netKobo,
          },
          original_currency: currency,
        });

        await c.env.DB.batch([
          // Net payout to vendor (gross − VAT − WHT)
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, ?, 'vendor', 'debit', ?, 'NGN', 'cleared', ?, ?)`,
          ).bind(
            `led_pay_net_${payoutId}`, txnId,
            `vendor_${vendorId}`, taxes.netKobo, meta, now,
          ),

          // VAT → platform tax collection account
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, 'platform_vat', 'platform', 'credit', ?, 'NGN', 'cleared', ?, ?)`,
          ).bind(
            `led_pay_vat_${payoutId}`, txnId,
            taxes.vatKobo, meta, now,
          ),

          // WHT → platform withholding tax account
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, 'platform_wht', 'platform', 'credit', ?, 'NGN', 'cleared', ?, ?)`,
          ).bind(
            `led_pay_wht_${payoutId}`, txnId,
            taxes.whtKobo, meta, now,
          ),
        ]);
      }

    } else if (event_type === 'ai.usage.recorded') {
      const aiPayload = payload as {
        capabilityId: string;
        model: string;
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
        usedByok: boolean;
        estimatedCostUsd?: number;
      };
      if (aiPayload.capabilityId && aiPayload.totalTokens > 0) {
        await processAIUsageEvent(
          { DB: c.env.DB, PLATFORM_KV: c.env.PLATFORM_KV },
          tenant_id ?? 'unknown',
          aiPayload,
          eventId,
        );
      }
    }

    // ── Mark event as processed ─────────────────────────────────────────────
    await c.env.DB.prepare(
      `UPDATE central_mgmt_events SET processed = 1, processed_at = ? WHERE id = ?`,
    ).bind(now, eventId).run();

    // ── Phase 1: Register idempotency key (after successful processing) ─────
    await registerIdempotencyKey(c.env.DB, aggregate_id, event_type, tenant_id);

    return c.json({ success: true, data: { event_id: eventId, event_type } });

  } catch (err) {
    console.error('[central-mgmt] Ledger processing error:', err);
    return c.json({ success: false, error: 'Ledger processing failed' }, 500);
  }
});

// ─── Protected API middleware ─────────────────────────────────────────────────

app.use('/api/*', jwtAuthMiddleware({ publicRoutes: [] }));

// ─── Ledger API (admin only) ──────────────────────────────────────────────────

/**
 * GET /api/ledger/entries
 * Returns paginated ledger entries. Admin only.
 */
app.get('/api/ledger/entries', requireRole(['admin', 'super_admin']), async (c) => {
  const limit     = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const offset    = parseInt(c.req.query('offset') ?? '0');
  const accountId = c.req.query('account_id');
  const eventType = c.req.query('event_type');
  const currency  = c.req.query('currency');

  let query = `SELECT * FROM ledger_entries`;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (accountId) { conditions.push('account_id = ?');  params.push(accountId); }
  if (eventType) { conditions.push('account_type = ?'); params.push(eventType); }
  if (currency)  { conditions.push('currency = ?');     params.push(currency); }
  if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const entries = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: entries.results });
});

/**
 * GET /api/ledger/summary
 * Returns account balance summary. Admin only.
 * Optionally filter by ?currency=NGN
 */
app.get('/api/ledger/summary', requireRole(['admin', 'super_admin']), async (c) => {
  const currency = c.req.query('currency');

  let query = `
    SELECT account_id, account_type, currency,
      SUM(CASE WHEN type = 'credit' THEN amount_kobo ELSE 0 END) as total_credits_kobo,
      SUM(CASE WHEN type = 'debit'  THEN amount_kobo ELSE 0 END) as total_debits_kobo,
      SUM(CASE WHEN type = 'credit' THEN amount_kobo ELSE -amount_kobo END) as balance_kobo
    FROM ledger_entries
    WHERE status = 'cleared'`;

  const params: string[] = [];
  if (currency) { query += ` AND currency = ?`; params.push(currency); }
  query += ` GROUP BY account_id, account_type, currency ORDER BY account_type, account_id`;

  const summary = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: summary.results });
});

/**
 * GET /api/events
 * Returns inbound event log. Admin only.
 */
app.get('/api/events', requireRole(['admin', 'super_admin']), async (c) => {
  const limit  = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const events = await c.env.DB.prepare(
    `SELECT id, event_type, source_event_id, tenant_id, processed, received_at, processed_at
     FROM central_mgmt_events
     ORDER BY received_at DESC LIMIT ? OFFSET ?`,
  ).bind(limit, offset).all();
  return c.json({ success: true, data: events.results });
});

// ─── Fraud API (admin only) ───────────────────────────────────────────────────

/**
 * GET /api/fraud/scores
 * Returns paginated fraud score records. Filterable by risk_level and tenant_id.
 */
app.get('/api/fraud/scores', requireRole(['admin', 'super_admin']), async (c) => {
  const limit     = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const offset    = parseInt(c.req.query('offset') ?? '0');
  const riskLevel = c.req.query('risk_level');
  const tenantId  = c.req.query('tenant_id');

  let query = `SELECT * FROM fraud_scores`;
  const params: (string | number)[] = [];
  const conditions: string[] = [];

  if (riskLevel) { conditions.push('risk_level = ?'); params.push(riskLevel); }
  if (tenantId)  { conditions.push('tenant_id = ?');  params.push(tenantId); }
  if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const scores = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: scores.results });
});

// ─── Webhook DLQ API (admin only) ────────────────────────────────────────────

/**
 * GET /api/admin/dlq
 * Returns paginated DLQ entries. Optionally filter by ?status=pending|retrying|delivered|exhausted
 */
app.get('/api/admin/dlq', requireRole(['admin', 'super_admin']), async (c) => {
  const limit  = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const status = c.req.query('status') as 'pending' | 'retrying' | 'delivered' | 'exhausted' | undefined;

  const entries = await listDLQEntries(c.env.DB, status, limit, offset);
  return c.json({ success: true, data: entries });
});

/**
 * POST /api/admin/dlq/retry
 * Trigger an immediate retry pass for all due DLQ items.
 */
app.post('/api/admin/dlq/retry', requireRole(['admin', 'super_admin']), async (c) => {
  const result = await retryDueDLQItems(c.env.DB);
  return c.json({ success: true, data: result });
});

// ─── Data Retention API (super admin only) ────────────────────────────────────

/**
 * POST /api/admin/retention/prune
 * Manually trigger the data retention pruner (also runs as scheduled cron).
 * Deletes processed events, fraud scores, delivered DLQ items, and expired idempotency keys.
 * Ledger tables are never touched.
 */
app.post('/api/admin/retention/prune', requireRole(['super_admin']), async (c) => {
  const result = await pruneOldData(c.env.DB);
  return c.json({ success: true, data: result });
});

// ─── Tenant Suspension API (super admin only) ─────────────────────────────────

/**
 * PUT /api/admin/tenants/:tenantId/suspend
 * Suspend a tenant. Body: { reason: string }
 */
app.put('/api/admin/tenants/:tenantId/suspend', requireRole(['super_admin']), async (c) => {
  const { tenantId } = c.req.param();
  let reason = 'Suspended by admin';

  try {
    const body = await c.req.json<{ reason?: string }>();
    if (body.reason) reason = body.reason;
  } catch { /* body is optional */ }

  const result = await suspendTenant(
    c.env.PLATFORM_KV,
    c.env.DB,
    tenantId,
    reason,
    'admin',
  );
  return c.json({ success: true, data: result });
});

/**
 * PUT /api/admin/tenants/:tenantId/unsuspend
 * Unsuspend (reinstate) a tenant. Body: { reason: string }
 */
app.put('/api/admin/tenants/:tenantId/unsuspend', requireRole(['super_admin']), async (c) => {
  const { tenantId } = c.req.param();
  let reason = 'Reinstated by admin';

  try {
    const body = await c.req.json<{ reason?: string }>();
    if (body.reason) reason = body.reason;
  } catch { /* body is optional */ }

  const result = await unsuspendTenant(
    c.env.PLATFORM_KV,
    c.env.DB,
    tenantId,
    reason,
    'admin',
  );
  return c.json({ success: true, data: result });
});

/**
 * GET /api/admin/tenants/:tenantId/suspension-log
 * Returns the suspension audit log for a tenant.
 */
app.get('/api/admin/tenants/:tenantId/suspension-log', requireRole(['admin', 'super_admin']), async (c) => {
  const { tenantId } = c.req.param();
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const log = await getTenantSuspensionLog(c.env.DB, tenantId, limit);
  return c.json({ success: true, data: log });
});

/**
 * GET /api/admin/tenants/:tenantId/status
 * Quick suspension status check for a tenant.
 */
app.get('/api/admin/tenants/:tenantId/status', requireRole(['admin', 'super_admin']), async (c) => {
  const { tenantId } = c.req.param();
  const suspended = await isTenantSuspended(c.env.PLATFORM_KV, tenantId);
  return c.json({ success: true, data: { tenantId, suspended } });
});

// ─── FX Rates API (admin only) ────────────────────────────────────────────────

/**
 * GET /api/admin/fx-rates
 * Returns current FX rates stored in D1.
 */
app.get('/api/admin/fx-rates', requireRole(['admin', 'super_admin']), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT currency, rate_to_ngn, updated_at FROM fx_rates ORDER BY currency`,
  ).all();
  return c.json({ success: true, data: results });
});

/**
 * PUT /api/admin/fx-rates/:currency
 * Update the exchange rate for a supported currency. Body: { rate_to_ngn: number }
 */
app.put('/api/admin/fx-rates/:currency', requireRole(['super_admin']), async (c) => {
  const currency = c.req.param('currency').toUpperCase();
  let rate: number;

  try {
    const body = await c.req.json<{ rate_to_ngn: number }>();
    rate = Number(body.rate_to_ngn);
    if (!Number.isFinite(rate) || rate <= 0) throw new Error();
  } catch {
    return c.json({ success: false, error: 'Body must be { rate_to_ngn: <positive number> }' }, 400);
  }

  await c.env.DB.prepare(
    `INSERT INTO fx_rates (id, currency, rate_to_ngn, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(currency) DO UPDATE SET rate_to_ngn = excluded.rate_to_ngn, updated_at = excluded.updated_at`,
  ).bind(`fx_${currency.toLowerCase()}`, currency, rate, Date.now()).run();

  return c.json({ success: true, data: { currency, rate_to_ngn: rate } });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────

app.notFound((c) => c.json({ success: false, error: 'Not Found' }, 404));

export default app;

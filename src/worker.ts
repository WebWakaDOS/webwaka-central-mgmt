/**
 * WebWaka Central Management — Cloudflare Worker Entry Point
 *
 * Exposes the Ledger, Affiliate, and Super Admin modules as HTTP endpoints.
 * Receives inbound events from transport and commerce via POST /events/ingest.
 *
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 * Blueprint Reference: Part 9.1 (Cloudflare-First: D1, KV, Workers)
 * Blueprint Reference: Part 9.3 (Platform Conventions — RBAC)
 *
 * Added: 2026-04-01 — Remediation Issue #7 (missing HTTP worker)
 */
import { Hono } from 'hono';
import { jwtAuthMiddleware, requireRole } from '@webwaka/core';

export interface Env {
  DB: D1Database;
  PLATFORM_KV: KVNamespace;
  JWT_SECRET: string;
  INTER_SERVICE_SECRET: string;
  ENVIRONMENT?: string;
}

const app = new Hono<{ Bindings: Env }>();

// ─── Health ──────────────────────────────────────────────────────────────────
app.get('/health', (c) =>
  c.json({
    success: true,
    data: {
      service: 'webwaka-central-mgmt',
      status: 'healthy',
      modules: ['ledger', 'affiliate', 'super-admin'],
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
 *   - transport.booking.confirmed  → credit platform revenue account
 *   - transport.booking.refunded   → debit platform revenue account
 *   - commerce.order.paid          → credit platform commission account
 *   - commerce.payout.processed    → debit vendor escrow account
 */
app.post('/events/ingest', async (c) => {
  // Verify inter-service secret
  const authHeader = c.req.header('Authorization');
  const expectedSecret = c.env.INTER_SERVICE_SECRET;
  if (!authHeader || authHeader !== `Bearer ${expectedSecret}`) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

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
    return c.json({ success: false, error: 'Missing required fields: event_type, aggregate_id' }, 400);
  }

  const now = Date.now();
  const eventId = `cme_${now}_${Math.random().toString(36).slice(2, 9)}`;

  // Idempotency: check if already processed
  const existing = await c.env.DB.prepare(
    `SELECT id FROM central_mgmt_events WHERE source_event_id = ?`
  ).bind(aggregate_id).first<{ id: string }>();

  if (existing) {
    return c.json({ success: true, message: 'Already processed', event_id: existing.id });
  }

  // Record the inbound event
  await c.env.DB.prepare(
    `INSERT INTO central_mgmt_events
       (id, event_type, source_event_id, tenant_id, payload_json, processed, received_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)`
  ).bind(eventId, event_type, aggregate_id, tenant_id ?? null, JSON.stringify(payload), now).run();

  // Process ledger entries based on event type
  try {
    if (event_type === 'transport.booking.confirmed') {
      const amountKobo = payload.total_amount as number;
      const bookingId = payload.booking_id as string;
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        const platformFeeKobo = Math.round(amountKobo * 0.05); // 5% platform fee
        const operatorKobo = amountKobo - platformFeeKobo;
        const txnId = `txn_trn_${bookingId}`;
        await c.env.DB.batch([
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, 'platform_revenue', 'platform', 'credit', ?, 'NGN', 'cleared', ?, ?)`
          ).bind(
            `led_plat_${bookingId}`, txnId, platformFeeKobo,
            JSON.stringify({ source: 'transport', booking_id: bookingId, tenant_id: tenant_id }),
            now,
          ),
          c.env.DB.prepare(
            `INSERT OR IGNORE INTO ledger_entries
               (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
             VALUES (?, ?, ?, 'operator', 'credit', ?, 'NGN', 'cleared', ?, ?)`
          ).bind(
            `led_oper_${bookingId}`, txnId, `operator_${tenant_id ?? 'unknown'}`, operatorKobo,
            JSON.stringify({ source: 'transport', booking_id: bookingId, tenant_id: tenant_id }),
            now,
          ),
        ]);
      }
    } else if (event_type === 'transport.booking.refunded') {
      const amountKobo = payload.refund_amount_kobo as number;
      const bookingId = payload.booking_id as string;
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO ledger_entries
             (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
           VALUES (?, ?, 'platform_revenue', 'platform', 'debit', ?, 'NGN', 'cleared', ?, ?)`
        ).bind(
          `led_ref_${bookingId}`,
          `txn_ref_${bookingId}`,
          amountKobo,
          JSON.stringify({ source: 'transport', booking_id: bookingId, refund: true }),
          now,
        ).run();
      }
    } else if (event_type === 'commerce.order.paid') {
      const amountKobo = payload.amount_kobo as number;
      const orderId = payload.order_id as string;
      const commissionBps = (payload.commission_bps as number) ?? 500; // default 5%
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        const commissionKobo = Math.round(amountKobo * commissionBps / 10000);
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO ledger_entries
             (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
           VALUES (?, ?, 'platform_commission', 'platform', 'credit', ?, 'NGN', 'cleared', ?, ?)`
        ).bind(
          `led_com_${orderId}`,
          `txn_com_${orderId}`,
          commissionKobo,
          JSON.stringify({ source: 'commerce', order_id: orderId, tenant_id: tenant_id, commission_bps: commissionBps }),
          now,
        ).run();
      }
    } else if (event_type === 'commerce.payout.processed') {
      const amountKobo = payload.amount_kobo as number;
      const payoutId = payload.payout_id as string;
      if (Number.isInteger(amountKobo) && amountKobo > 0) {
        await c.env.DB.prepare(
          `INSERT OR IGNORE INTO ledger_entries
             (id, transaction_id, account_id, account_type, type, amount_kobo, currency, status, metadata_json, created_at)
           VALUES (?, ?, ?, 'vendor', 'debit', ?, 'NGN', 'cleared', ?, ?)`
        ).bind(
          `led_pay_${payoutId}`,
          `txn_pay_${payoutId}`,
          `vendor_${payload.vendor_id ?? 'unknown'}`,
          amountKobo,
          JSON.stringify({ source: 'commerce', payout_id: payoutId, vendor_id: payload.vendor_id }),
          now,
        ).run();
      }
    }

    // Mark event as processed
    await c.env.DB.prepare(
      `UPDATE central_mgmt_events SET processed = 1, processed_at = ? WHERE id = ?`
    ).bind(now, eventId).run();

    return c.json({ success: true, data: { event_id: eventId, event_type } });
  } catch (err) {
    console.error('[central-mgmt] Ledger processing error:', err);
    return c.json({ success: false, error: 'Ledger processing failed' }, 500);
  }
});

// ─── Ledger API (admin only) ──────────────────────────────────────────────────
app.use('/api/*', jwtAuthMiddleware({ publicRoutes: [] }));

/**
 * GET /api/ledger/entries
 * Returns paginated ledger entries. Admin only.
 */
app.get('/api/ledger/entries', requireRole(['admin', 'super_admin']), async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const accountId = c.req.query('account_id');
  const eventType = c.req.query('event_type');

  let query = `SELECT * FROM ledger_entries`;
  const params: (string | number)[] = [];
  const conditions: string[] = [];
  if (accountId) { conditions.push('account_id = ?'); params.push(accountId); }
  if (eventType) { conditions.push('account_type = ?'); params.push(eventType); }
  if (conditions.length) query += ` WHERE ${conditions.join(' AND ')}`;
  query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  const entries = await c.env.DB.prepare(query).bind(...params).all();
  return c.json({ success: true, data: entries.results });
});

/**
 * GET /api/ledger/summary
 * Returns account balance summary. Admin only.
 */
app.get('/api/ledger/summary', requireRole(['admin', 'super_admin']), async (c) => {
  const summary = await c.env.DB.prepare(
    `SELECT account_id, account_type,
       SUM(CASE WHEN type = 'credit' THEN amount_kobo ELSE 0 END) as total_credits_kobo,
       SUM(CASE WHEN type = 'debit' THEN amount_kobo ELSE 0 END) as total_debits_kobo,
       SUM(CASE WHEN type = 'credit' THEN amount_kobo ELSE -amount_kobo END) as balance_kobo
     FROM ledger_entries
     WHERE status = 'cleared'
     GROUP BY account_id, account_type
     ORDER BY account_type, account_id`
  ).all();
  return c.json({ success: true, data: summary.results });
});

/**
 * GET /api/events
 * Returns inbound event log. Admin only.
 */
app.get('/api/events', requireRole(['admin', 'super_admin']), async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50'), 200);
  const offset = parseInt(c.req.query('offset') ?? '0');
  const events = await c.env.DB.prepare(
    `SELECT id, event_type, source_event_id, tenant_id, processed, received_at, processed_at
     FROM central_mgmt_events
     ORDER BY received_at DESC LIMIT ? OFFSET ?`
  ).bind(limit, offset).all();
  return c.json({ success: true, data: events.results });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.notFound((c) => c.json({ success: false, error: 'Not Found' }, 404));

export default app;

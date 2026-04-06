/**
 * QA-CEN-X: Real-Time Fraud Scoring Unit Tests
 *
 * Covers: scoreFraudEvent — all 5 rules, score capping, persistence
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { scoreFraudEvent } from './core';

// ─── Mock D1 factory ──────────────────────────────────────────────────────────
//
// We need to support two queries inside scoreFraudEvent:
//   1. Velocity check: SELECT COUNT(*) FROM cmgt_central_mgmt_events …  → .first()
//   2. Insert into cmgt_fraud_scores …                                   → .run()

function createMockD1(velocityCount = 0) {
  const runMock = vi.fn(async () => ({ meta: { changes: 1 } }));

  const db = {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        first: vi.fn(async () => ({ cnt: velocityCount })),
        run: runMock,
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
    batch: vi.fn(async () => []),
    _runMock: runMock, // expose for assertions
  };
  return db as unknown as D1Database & { _runMock: typeof runMock };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Real-Time Fraud Scoring — scoreFraudEvent', () => {
  it('returns low risk + allow for a normal small transaction', async () => {
    const db = createMockD1(0);
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_001',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 500_000, // ₦5,000 — well below threshold
      payload: {},
    });

    expect(result.score).toBe(0);
    expect(result.riskLevel).toBe('low');
    expect(result.action).toBe('allow');
    expect(result.signals).toHaveLength(0);
  });

  it('rule: high_amount (₦500k+) → score 25, medium risk, allow', async () => {
    const db = createMockD1(0);
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_002',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 55_500_000, // ₦555,000 — above high threshold, not a round million
      payload: {},
    });

    const highAmount = result.signals.find((s) => s.rule === 'high_amount');
    expect(highAmount).toBeDefined();
    expect(highAmount!.score).toBe(25);
    // score = 25 → below flag threshold of 40 → allow
    expect(result.action).toBe('allow');
    expect(result.riskLevel).toBe('medium');
  });

  it('rule: critical_amount (₦2M+) → score 70, critical risk, block', async () => {
    const db = createMockD1(0);
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_003',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 250_000_000, // ₦2,500,000
      payload: {},
    });

    const criticalAmount = result.signals.find((s) => s.rule === 'critical_amount');
    expect(criticalAmount).toBeDefined();
    expect(criticalAmount!.score).toBe(70);
    expect(result.score).toBeGreaterThanOrEqual(70);
    expect(result.riskLevel).toBe('critical');
    expect(result.action).toBe('block');
  });

  it('rule: velocity_limit (>10 events/min) → score 40, flag or block', async () => {
    const db = createMockD1(15); // 15 events in window — exceeds limit of 10
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_004',
      eventType: 'transport.booking.confirmed',
      tenantId: 'tenant_abc',
      amountKobo: 10_000, // small amount — only velocity fires
      payload: {},
    });

    const velocitySignal = result.signals.find((s) => s.rule === 'velocity_limit');
    expect(velocitySignal).toBeDefined();
    expect(velocitySignal!.score).toBe(40);
    expect(result.action).toBe('flag');
  });

  it('rule: velocity_limit is skipped when tenantId is absent', async () => {
    const db = createMockD1(999); // would be high velocity, but no tenantId
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_005',
      eventType: 'commerce.order.paid',
      // no tenantId
      amountKobo: 10_000,
      payload: {},
    });

    expect(result.signals.find((s) => s.rule === 'velocity_limit')).toBeUndefined();
  });

  it('rule: anonymous_high_value → score 30 when no tenantId + high amount', async () => {
    const db = createMockD1(0);
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_006',
      eventType: 'commerce.order.paid',
      // no tenantId
      amountKobo: 2_000_000, // > 1M threshold
      payload: {},
    });

    const anonSignal = result.signals.find((s) => s.rule === 'anonymous_high_value');
    expect(anonSignal).toBeDefined();
    expect(anonSignal!.score).toBe(30);
  });

  it('rule: round_amount → score 15 for amounts ≥ ₦100k that are round millions', async () => {
    const db = createMockD1(0);
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_007',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 50_000_000, // ₦500,000 exactly — round million, below high threshold
      payload: {},
    });

    const roundSignal = result.signals.find((s) => s.rule === 'round_amount');
    expect(roundSignal).toBeDefined();
    expect(roundSignal!.score).toBe(15);
  });

  it('round_amount is NOT triggered for amounts below ₦100k', async () => {
    const db = createMockD1(0);
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_008',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 5_000_000, // ₦50,000 — below min threshold for round check
      payload: {},
    });

    expect(result.signals.find((s) => s.rule === 'round_amount')).toBeUndefined();
  });

  it('score is capped at 100 when multiple rules fire', async () => {
    const db = createMockD1(15); // velocity fires too
    const result = await scoreFraudEvent(db, {
      eventId: 'evt_009',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 500_000_000, // ₦5M — critical + round
      payload: {},
    });

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.riskLevel).toBe('critical');
    expect(result.action).toBe('block');
  });

  it('persists score to D1 (run() called)', async () => {
    const db = createMockD1(0);
    await scoreFraudEvent(db, {
      eventId: 'evt_010',
      eventType: 'commerce.order.paid',
      tenantId: 'tenant_abc',
      amountKobo: 100,
      payload: {},
    });

    expect(db._runMock).toHaveBeenCalled();
  });

  it('risk levels map correctly to score ranges', async () => {
    // Score 0 → low
    const dbLow = createMockD1(0);
    const low = await scoreFraudEvent(dbLow, { eventId: 'e1', eventType: 'x', amountKobo: 1, payload: {} });
    expect(low.riskLevel).toBe('low');
    expect(low.action).toBe('allow');

    // Score 25 → medium (high_amount only — 55.5M is not a round million)
    const dbMedium = createMockD1(0);
    const medium = await scoreFraudEvent(dbMedium, { eventId: 'e2', eventType: 'x', tenantId: 'tid', amountKobo: 55_500_000, payload: {} });
    expect(medium.riskLevel).toBe('medium');
    expect(medium.action).toBe('allow');

    // Score ≥ 40 → high (velocity alone triggers 40)
    const dbHigh = createMockD1(15); // 15 events → velocity fires
    const high = await scoreFraudEvent(dbHigh, { eventId: 'e3', eventType: 'x', tenantId: 'tid', amountKobo: 1_000, payload: {} });
    expect(high.riskLevel).toBe('high');
    expect(high.action).toBe('flag');

    // Score ≥ 70 → critical (critical_amount = 70)
    const dbCritical = createMockD1(0);
    const critical = await scoreFraudEvent(dbCritical, { eventId: 'e4', eventType: 'x', tenantId: 'tid', amountKobo: 210_000_000, payload: {} });
    expect(critical.riskLevel).toBe('critical');
    expect(critical.action).toBe('block');
  });
});

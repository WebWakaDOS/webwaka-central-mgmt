/**
 * Real-Time Fraud Scoring Engine
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Phase 2 — Security & Fraud
 *
 * Rules engine that evaluates every inbound financial event and assigns a
 * risk score 0–100.  Scores >= 70 → block; >= 40 → flag; < 40 → allow.
 *
 * Rules implemented:
 *   1. critical_amount      — amount ≥ ₦2,000,000 (+50 pts)
 *   2. high_amount          — amount ≥ ₦500,000   (+25 pts)
 *   3. velocity_limit       — > 10 events of same type from tenant in 60 s (+40 pts)
 *   4. anonymous_high_value — high-value event with no tenant_id (+30 pts)
 *   5. round_amount         — suspiciously round amount ≥ ₦100,000 (+15 pts)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface FraudSignal {
  rule: string;
  score: number;
  detail: string;
}

export interface FraudResult {
  score: number;                              // 0–100 (capped)
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  signals: FraudSignal[];
  action: 'allow' | 'flag' | 'block';
}

export interface FraudEventContext {
  eventId: string;
  eventType: string;
  tenantId?: string;
  /** Amount in NGN kobo (already normalised to NGN by caller) */
  amountKobo?: number;
  payload: Record<string, unknown>;
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const HIGH_AMOUNT_THRESHOLD_KOBO     = 50_000_000;   // ₦500,000
const CRITICAL_AMOUNT_THRESHOLD_KOBO = 200_000_000;  // ₦2,000,000
const ROUND_AMOUNT_MIN_KOBO          = 10_000_000;   // ₦100,000 (round amounts below this are fine)
const VELOCITY_WINDOW_MS             = 60_000;        // 1 minute
const VELOCITY_MAX_EVENTS            = 10;

// ─── Individual rules ─────────────────────────────────────────────────────────

async function ruleVelocity(
  db: D1Database,
  tenantId: string,
  eventType: string,
): Promise<FraudSignal | null> {
  const windowStart = Date.now() - VELOCITY_WINDOW_MS;
  const result = await db
    .prepare(
      `SELECT COUNT(*) as cnt FROM central_mgmt_events
       WHERE tenant_id = ? AND event_type = ? AND received_at >= ?`,
    )
    .bind(tenantId, eventType, windowStart)
    .first<{ cnt: number }>();

  const cnt = result?.cnt ?? 0;
  if (cnt >= VELOCITY_MAX_EVENTS) {
    return {
      rule: 'velocity_limit',
      score: 40,
      detail: `${cnt} '${eventType}' events from tenant in last 60 s (limit: ${VELOCITY_MAX_EVENTS})`,
    };
  }
  return null;
}

// ─── Main scoring function ────────────────────────────────────────────────────

/**
 * Score an inbound financial event and return the fraud evaluation result.
 * Persists the score to the `fraud_scores` table.
 */
export async function scoreFraudEvent(
  db: D1Database,
  context: FraudEventContext,
): Promise<FraudResult> {
  const signals: FraudSignal[] = [];

  // Rule 1 & 2: Amount thresholds
  if (context.amountKobo != null) {
    if (context.amountKobo >= CRITICAL_AMOUNT_THRESHOLD_KOBO) {
      signals.push({
        rule: 'critical_amount',
        score: 70,
        detail: `Amount ${context.amountKobo} kobo (₦${(context.amountKobo / 100).toLocaleString()}) exceeds critical threshold`,
      });
    } else if (context.amountKobo >= HIGH_AMOUNT_THRESHOLD_KOBO) {
      signals.push({
        rule: 'high_amount',
        score: 25,
        detail: `Amount ${context.amountKobo} kobo (₦${(context.amountKobo / 100).toLocaleString()}) exceeds high-value threshold`,
      });
    }

    // Rule 5: Round-number structuring signal
    if (
      context.amountKobo >= ROUND_AMOUNT_MIN_KOBO &&
      context.amountKobo % 1_000_000 === 0
    ) {
      signals.push({
        rule: 'round_amount',
        score: 15,
        detail: `Amount ${context.amountKobo} kobo is suspiciously round`,
      });
    }
  }

  // Rule 3: Velocity check (DB query — skip if no tenantId)
  if (context.tenantId) {
    const velocitySignal = await ruleVelocity(db, context.tenantId, context.eventType);
    if (velocitySignal) signals.push(velocitySignal);
  }

  // Rule 4: Anonymous high-value
  if (
    !context.tenantId &&
    context.amountKobo != null &&
    context.amountKobo > 1_000_000
  ) {
    signals.push({
      rule: 'anonymous_high_value',
      score: 30,
      detail: 'High-value event received with no tenant_id',
    });
  }

  const totalScore = Math.min(
    signals.reduce((sum, s) => sum + s.score, 0),
    100,
  );

  const riskLevel: FraudResult['riskLevel'] =
    totalScore >= 70 ? 'critical' :
    totalScore >= 40 ? 'high' :
    totalScore >= 20 ? 'medium' : 'low';

  const action: FraudResult['action'] =
    totalScore >= 70 ? 'block' :
    totalScore >= 40 ? 'flag' : 'allow';

  // Persist to fraud_scores table
  const scoreId = `frd_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
  await db
    .prepare(
      `INSERT INTO fraud_scores
         (id, event_id, event_type, tenant_id, score, risk_level, signals_json, action, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      scoreId,
      context.eventId,
      context.eventType,
      context.tenantId ?? null,
      totalScore,
      riskLevel,
      JSON.stringify(signals),
      action,
      Date.now(),
    )
    .run();

  return { score: totalScore, riskLevel, signals, action };
}

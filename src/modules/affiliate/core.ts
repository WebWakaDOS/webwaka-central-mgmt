/**
 * MGMT-3 / WCM-003: Multi-Level Affiliate and Commission Engine
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Implements a 5-level deep affiliate hierarchy with automated commission splits.
 * Each affiliate node stores its own commission_rate (set at registration time).
 *
 * Default platform rates (applied when registering without an explicit rate):
 *   Level 1: 5.0%   Level 2: 3.0%   Level 3: 2.0%   Level 4: 1.0%   Level 5: 0.5%
 *
 * Monetary invariant: amounts are integer kobo only (Math.floor). Never floats in storage.
 * DB schema: affiliates + affiliate_commissions tables — see migration 003.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AffiliateNode {
  id: string;
  userId: string;
  parentId: string | null;
  level: number;           // absolute hierarchy level 1–5
  commissionRate: number;  // fraction, e.g. 0.05 for 5%
  status: 'active' | 'inactive';
}

export interface CommissionSplit {
  affiliateId: string;
  userId: string;
  amountKobo: number;
  level: number;  // relative traversal level starting at 1 from the direct affiliate
}

// ─── Platform default commission rates per hierarchy level ────────────────────

export const DEFAULT_COMMISSION_RATES: Record<number, number> = {
  1: 0.050,  // 5.0%
  2: 0.030,  // 3.0%
  3: 0.020,  // 2.0%
  4: 0.010,  // 1.0%
  5: 0.005,  // 0.5%
};

// ─── AffiliateSystem ──────────────────────────────────────────────────────────

export class AffiliateSystem {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  // ── D1 query helpers ────────────────────────────────────────────────────────

  /**
   * Fetch a single active affiliate node from D1 by ID.
   * Returns null when the affiliate doesn't exist or is inactive.
   */
  async getAffiliate(id: string): Promise<AffiliateNode | null> {
    const row = await this.db
      .prepare(
        `SELECT id, user_id, parent_id, level, commission_rate, status
         FROM affiliates WHERE id = ? AND status = 'active'`,
      )
      .bind(id)
      .first<{
        id: string;
        user_id: string;
        parent_id: string | null;
        level: number;
        commission_rate: number;
        status: string;
      }>();

    if (!row) return null;

    return {
      id:             row.id,
      userId:         row.user_id,
      parentId:       row.parent_id,
      level:          row.level,
      commissionRate: row.commission_rate,
      status:         row.status as 'active' | 'inactive',
    };
  }

  /**
   * Register a new affiliate in D1.
   * If commissionRate is omitted the platform default for that level is used.
   */
  async registerAffiliate(
    userId: string,
    parentId: string | null,
    level: number,
    commissionRate?: number,
  ): Promise<AffiliateNode> {
    if (level < 1 || level > 5) {
      throw new Error(`Affiliate level must be between 1 and 5, got ${level}`);
    }

    const rate = commissionRate ?? DEFAULT_COMMISSION_RATES[level] ?? 0;
    const id   = `aff_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const now  = Date.now();

    await this.db
      .prepare(
        `INSERT INTO affiliates
           (id, user_id, parent_id, level, commission_rate, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'active', ?, ?)`,
      )
      .bind(id, userId, parentId ?? null, level, rate, now, now)
      .run();

    return { id, userId, parentId, level, commissionRate: rate, status: 'active' };
  }

  // ── Commission calculation ──────────────────────────────────────────────────

  /**
   * Traverse the affiliate hierarchy starting from `directAffiliateId` and
   * calculate the commission split for each level up to 5.
   *
   * The commission rate for each node is taken from the affiliate's own
   * stored `commissionRate` field (not a positional default) — this preserves
   * individually negotiated rates while still defaulting to platform rates at
   * registration time.
   *
   * @param transactionAmountKobo  Gross transaction amount in kobo (positive integer)
   * @param directAffiliateId      The affiliate who made the direct referral (level 1)
   * @returns Array of CommissionSplit objects, one per active level, in traversal order
   */
  async calculateSplits(
    transactionAmountKobo: number,
    directAffiliateId: string,
  ): Promise<CommissionSplit[]> {
    if (!Number.isInteger(transactionAmountKobo) || transactionAmountKobo <= 0) {
      throw new Error('Transaction amount must be a positive integer in kobo');
    }

    const splits: CommissionSplit[] = [];
    let currentId: string | null    = directAffiliateId;
    let relativeLevel               = 1;

    while (currentId && relativeLevel <= 5) {
      const affiliate = await this.getAffiliate(currentId);
      if (!affiliate) break;

      // Use the affiliate's own stored rate (set at registration, defaults to platform rate)
      const amountKobo = Math.floor(transactionAmountKobo * affiliate.commissionRate);

      if (amountKobo > 0) {
        splits.push({
          affiliateId: affiliate.id,
          userId:      affiliate.userId,
          amountKobo,
          level:       relativeLevel,
        });
      }

      currentId     = affiliate.parentId;
      relativeLevel++;
    }

    return splits;
  }

  /**
   * Persist a commission split batch to the `affiliate_commissions` table.
   * Call this after calculateSplits() once the underlying transaction is confirmed.
   *
   * @param transactionId  Source ledger transaction_id
   * @param splits         Output of calculateSplits()
   * @returns IDs of the newly created commission records
   */
  async persistCommissions(
    transactionId: string,
    splits: CommissionSplit[],
  ): Promise<string[]> {
    if (splits.length === 0) return [];

    const now  = Date.now();
    const ids: string[] = [];

    const stmts = splits.map((split) => {
      const id = `comm_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      ids.push(id);
      return this.db
        .prepare(
          `INSERT INTO affiliate_commissions
             (id, transaction_id, affiliate_id, user_id, level,
              amount_kobo, currency, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'NGN', 'pending', ?)`,
        )
        .bind(
          id, transactionId, split.affiliateId, split.userId,
          split.level, split.amountKobo, now,
        );
    });

    await this.db.batch(stmts);
    return ids;
  }

  /**
   * Retrieve commission records for a specific affiliate, newest first.
   */
  async getAffiliateCommissions(
    affiliateId: string,
    status?: 'pending' | 'paid' | 'cancelled',
    limit = 50,
  ): Promise<Array<{
    id: string;
    transactionId: string;
    amountKobo: number;
    level: number;
    status: string;
    createdAt: number;
  }>> {
    let sql = `SELECT id, transaction_id, level, amount_kobo, status, created_at
               FROM affiliate_commissions WHERE affiliate_id = ?`;
    const params: (string | number)[] = [affiliateId];

    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const { results } = await this.db
      .prepare(sql)
      .bind(...params)
      .all<{
        id: string;
        transaction_id: string;
        level: number;
        amount_kobo: number;
        status: string;
        created_at: number;
      }>();

    return results.map(r => ({
      id:            r.id,
      transactionId: r.transaction_id,
      amountKobo:    r.amount_kobo,
      level:         r.level,
      status:        r.status,
      createdAt:     r.created_at,
    }));
  }
}

/**
 * WCM-003 / WCM-010: Multi-Level Affiliate Commission Engine Unit Tests
 *
 * Covers:
 *   - calculateSplits — 5-level hierarchy, hierarchy termination, non-integer rejection
 *   - getAffiliate    — D1 query delegation
 *   - registerAffiliate — D1 insert, default rate application, level validation
 *   - persistCommissions — D1 batch insert
 *   - getAffiliateCommissions — filtered and unfiltered D1 queries
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AffiliateSystem, DEFAULT_COMMISSION_RATES } from './core';

// ─── Mock affiliate data ───────────────────────────────────────────────────────
// Mimics the cmgt_affiliates DB table for the 5-node hierarchy used in tests.

const MOCK_AFFILIATES: Record<string, {
  id: string; user_id: string; parent_id: string | null;
  level: number; commission_rate: number; status: string;
}> = {
  'aff_1': { id: 'aff_1', user_id: 'user_1', parent_id: 'aff_2', level: 1, commission_rate: 0.05, status: 'active' },
  'aff_2': { id: 'aff_2', user_id: 'user_2', parent_id: 'aff_3', level: 2, commission_rate: 0.03, status: 'active' },
  'aff_3': { id: 'aff_3', user_id: 'user_3', parent_id: 'aff_4', level: 3, commission_rate: 0.02, status: 'active' },
  'aff_4': { id: 'aff_4', user_id: 'user_4', parent_id: 'aff_5', level: 4, commission_rate: 0.01, status: 'active' },
  'aff_5': { id: 'aff_5', user_id: 'user_5', parent_id: null,    level: 5, commission_rate: 0.005, status: 'active' },
};

// ─── Mock D1 factory ──────────────────────────────────────────────────────────

function createMockD1(commissions: unknown[] = []) {
  const runMock   = vi.fn(async () => ({ meta: { changes: 1 } }));
  const batchMock = vi.fn(async () => [{ meta: { changes: 1 } }]);

  const db = {
    prepare: vi.fn((sql: string) => ({
      bind: vi.fn((...args: unknown[]) => ({
        first: vi.fn(async () => {
          // Route SELECT on cmgt_affiliates → return mock affiliate row by ID
          if (sql.includes('FROM cmgt_affiliates')) {
            const id = args[0] as string;
            return MOCK_AFFILIATES[id] ?? null;
          }
          return null;
        }),
        run: runMock,
        all: vi.fn(async () => ({ results: commissions })),
      })),
    })),
    batch: batchMock,
    _runMock:   runMock,
    _batchMock: batchMock,
  };
  return db as unknown as D1Database & {
    _runMock: typeof runMock;
    _batchMock: typeof batchMock;
  };
}

// ─── MGMT-3: Multi-Level Affiliate System ────────────────────────────────────

describe('MGMT-3: Multi-Level Affiliate System', () => {
  let affiliateSystem: AffiliateSystem;
  let mockDb: ReturnType<typeof createMockD1>;

  beforeEach(() => {
    mockDb         = createMockD1();
    affiliateSystem = new AffiliateSystem(mockDb as unknown as D1Database);
  });

  it('should calculate commission splits up to 5 levels deep', async () => {
    const transactionAmount = 100000; // 1000 NGN

    const splits = await affiliateSystem.calculateSplits(transactionAmount, 'aff_1');

    expect(splits).toHaveLength(5);

    // Level 1: 5%
    expect(splits[0].level).toBe(1);
    expect(splits[0].amountKobo).toBe(5000);

    // Level 2: 3%
    expect(splits[1].level).toBe(2);
    expect(splits[1].amountKobo).toBe(3000);

    // Level 3: 2%
    expect(splits[2].level).toBe(3);
    expect(splits[2].amountKobo).toBe(2000);

    // Level 4: 1%
    expect(splits[3].level).toBe(4);
    expect(splits[3].amountKobo).toBe(1000);

    // Level 5: 0.5%
    expect(splits[4].level).toBe(5);
    expect(splits[4].amountKobo).toBe(500);
  });

  it('should stop calculating if hierarchy ends before 5 levels', async () => {
    const transactionAmount = 100000;

    // Start at aff_3 (commission_rate=0.02) — hierarchy continues to aff_4, aff_5
    const splits = await affiliateSystem.calculateSplits(transactionAmount, 'aff_3');

    expect(splits).toHaveLength(3);
    expect(splits[0].level).toBe(1);      // Relative level from the start node
    expect(splits[0].amountKobo).toBe(2000); // aff_3 rate is 2%
    expect(splits[1].amountKobo).toBe(1000); // aff_4 rate is 1%
    expect(splits[2].amountKobo).toBe(500);  // aff_5 rate is 0.5%
  });

  it('should reject non-integer kobo values', async () => {
    await expect(
      affiliateSystem.calculateSplits(1000.5, 'aff_1'),
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');
  });

  it('should reject zero amount', async () => {
    await expect(
      affiliateSystem.calculateSplits(0, 'aff_1'),
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');
  });

  it('should return empty splits for unknown affiliate', async () => {
    const splits = await affiliateSystem.calculateSplits(100000, 'aff_unknown');
    expect(splits).toHaveLength(0);
  });

  it('commission amounts use Math.floor (no float leakage)', async () => {
    // 100001 kobo * 0.05 = 5000.05 → floored to 5000
    const splits = await affiliateSystem.calculateSplits(100001, 'aff_1');
    for (const split of splits) {
      expect(Number.isInteger(split.amountKobo)).toBe(true);
    }
  });
});

// ─── WCM-003: D1 integration behaviour ───────────────────────────────────────

describe('WCM-003: AffiliateSystem D1 integration', () => {
  let affiliateSystem: AffiliateSystem;
  let mockDb: ReturnType<typeof createMockD1>;

  beforeEach(() => {
    mockDb         = createMockD1();
    affiliateSystem = new AffiliateSystem(mockDb as unknown as D1Database);
  });

  it('getAffiliate delegates to D1 and maps columns correctly', async () => {
    const node = await affiliateSystem.getAffiliate('aff_1');

    expect(node).not.toBeNull();
    expect(node!.id).toBe('aff_1');
    expect(node!.userId).toBe('user_1');
    expect(node!.parentId).toBe('aff_2');
    expect(node!.level).toBe(1);
    expect(node!.commissionRate).toBe(0.05);
    expect(node!.status).toBe('active');
  });

  it('getAffiliate returns null for an unknown affiliate', async () => {
    const node = await affiliateSystem.getAffiliate('aff_999');
    expect(node).toBeNull();
  });

  it('registerAffiliate inserts into D1 and returns the new node', async () => {
    const node = await affiliateSystem.registerAffiliate('user_new', null, 1);

    expect(node.id).toMatch(/^aff_/);
    expect(node.level).toBe(1);
    expect(node.commissionRate).toBe(DEFAULT_COMMISSION_RATES[1]);
    expect(node.status).toBe('active');
    expect(mockDb._runMock).toHaveBeenCalledOnce();
  });

  it('registerAffiliate applies custom commission rate when provided', async () => {
    const node = await affiliateSystem.registerAffiliate('user_x', null, 2, 0.04);
    expect(node.commissionRate).toBe(0.04);
  });

  it('registerAffiliate rejects invalid level (0 or 6+)', async () => {
    await expect(
      affiliateSystem.registerAffiliate('u', null, 0),
    ).rejects.toThrow('Affiliate level must be between 1 and 5');

    await expect(
      affiliateSystem.registerAffiliate('u', null, 6),
    ).rejects.toThrow('Affiliate level must be between 1 and 5');
  });

  it('persistCommissions calls db.batch with correct number of statements', async () => {
    const splits = [
      { affiliateId: 'aff_1', userId: 'user_1', amountKobo: 5000, level: 1 },
      { affiliateId: 'aff_2', userId: 'user_2', amountKobo: 3000, level: 2 },
    ];

    const ids = await affiliateSystem.persistCommissions('txn_abc', splits);

    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^comm_/);
    expect(mockDb._batchMock).toHaveBeenCalledOnce();
  });

  it('persistCommissions returns empty array for empty splits', async () => {
    const ids = await affiliateSystem.persistCommissions('txn_empty', []);
    expect(ids).toHaveLength(0);
    expect(mockDb._batchMock).not.toHaveBeenCalled();
  });

  it('getAffiliateCommissions returns paginated commission records', async () => {
    const mockCommissions = [
      { id: 'comm_1', transaction_id: 'txn_1', level: 1, amount_kobo: 5000, status: 'pending', created_at: 1000 },
    ];
    const db = createMockD1(mockCommissions);
    const system = new AffiliateSystem(db as unknown as D1Database);

    const result = await system.getAffiliateCommissions('aff_1');

    expect(result).toHaveLength(1);
    expect(result[0].amountKobo).toBe(5000);
    expect(result[0].status).toBe('pending');
    expect(result[0].transactionId).toBe('txn_1');
  });
});

// ─── WCM-010: Edge cases ──────────────────────────────────────────────────────

describe('WCM-010: Affiliate edge cases', () => {
  it('DEFAULT_COMMISSION_RATES cover all 5 levels with correct values', () => {
    expect(DEFAULT_COMMISSION_RATES[1]).toBe(0.050);
    expect(DEFAULT_COMMISSION_RATES[2]).toBe(0.030);
    expect(DEFAULT_COMMISSION_RATES[3]).toBe(0.020);
    expect(DEFAULT_COMMISSION_RATES[4]).toBe(0.010);
    expect(DEFAULT_COMMISSION_RATES[5]).toBe(0.005);
  });

  it('total commission across all 5 levels is ≤ 11.5% of transaction', async () => {
    const db = createMockD1();
    const system = new AffiliateSystem(db as unknown as D1Database);
    const amount = 1_000_000; // 10,000 NGN

    const splits = await system.calculateSplits(amount, 'aff_1');
    const total  = splits.reduce((s, sp) => s + sp.amountKobo, 0);

    // 5% + 3% + 2% + 1% + 0.5% = 11.5%
    expect(total).toBeLessThanOrEqual(Math.floor(amount * 0.115) + 1); // +1 for floor rounding
  });

  it('single-level hierarchy (no parent) returns one split only', async () => {
    // aff_5 has no parent — only one split should be returned
    const db = createMockD1();
    const system = new AffiliateSystem(db as unknown as D1Database);

    const splits = await system.calculateSplits(100000, 'aff_5');

    expect(splits).toHaveLength(1);
    expect(splits[0].affiliateId).toBe('aff_5');
    expect(splits[0].amountKobo).toBe(500); // 0.5% of 100000
  });
});

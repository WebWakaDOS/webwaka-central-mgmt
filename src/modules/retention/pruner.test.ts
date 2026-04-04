/**
 * QA-CEN-X: Data Retention Pruner Unit Tests
 *
 * Covers: pruneOldData — correct tables pruned, ledger tables never touched
 */
import { describe, it, expect, vi } from 'vitest';
import { pruneOldData } from './pruner';

// ─── Mock D1 factory ──────────────────────────────────────────────────────────

function createMockD1(changesByQuery: number[] = [10, 5, 3, 8]) {
  let callIndex = 0;
  const runMock = vi.fn(async () => ({
    meta: { changes: changesByQuery[callIndex++] ?? 0 },
  }));

  return {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        run: runMock,
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: [] })),
      })),
    })),
    batch: vi.fn(async () => []),
    _runMock: runMock,
    _getCallCount: () => callIndex,
  } as unknown as D1Database & { _runMock: typeof runMock; _getCallCount: () => number };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('pruneOldData — data retention (90-day window)', () => {
  it('returns structured result with counts per table', async () => {
    const db = createMockD1([42, 15, 7, 99]);
    const result = await pruneOldData(db);

    expect(result.prunedEvents).toBe(42);
    expect(result.prunedFraudScores).toBe(15);
    expect(result.prunedDLQEntries).toBe(7);
    expect(result.prunedIdempotencyKeys).toBe(99);
  });

  it('totalPruned is the sum of all pruned rows', async () => {
    const db = createMockD1([10, 20, 30, 40]);
    const result = await pruneOldData(db);

    expect(result.totalPruned).toBe(100);
    expect(result.totalPruned).toBe(
      result.prunedEvents + result.prunedFraudScores + result.prunedDLQEntries + result.prunedIdempotencyKeys,
    );
  });

  it('cutoffMs is approximately 90 days in the past', async () => {
    const before = Date.now();
    const db = createMockD1([0, 0, 0, 0]);
    const result = await pruneOldData(db);
    const after = Date.now();

    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    expect(result.cutoffMs).toBeGreaterThan(before - ninetyDaysMs - 1000);
    expect(result.cutoffMs).toBeLessThan(after - ninetyDaysMs + 1000);
  });

  it('executes exactly 4 DELETE statements (one per table)', async () => {
    const db = createMockD1([0, 0, 0, 0]);
    await pruneOldData(db);

    // 4 parallel deletes → runMock called 4 times
    expect(db._runMock).toHaveBeenCalledTimes(4);
  });

  it('is safe to call when all tables are empty (returns zero counts)', async () => {
    const db = createMockD1([0, 0, 0, 0]);
    const result = await pruneOldData(db);

    expect(result.totalPruned).toBe(0);
    expect(result.prunedEvents).toBe(0);
  });

  it('never touches ledger_entries or ai_usage_ledger (immutable financial records)', async () => {
    const sqlCalls: string[] = [];
    const db = {
      prepare: vi.fn((sql: string) => {
        sqlCalls.push(sql);
        return {
          bind: vi.fn(() => ({
            run: vi.fn(async () => ({ meta: { changes: 0 } })),
          })),
        };
      }),
      batch: vi.fn(async () => []),
    } as unknown as D1Database;

    await pruneOldData(db);

    for (const sql of sqlCalls) {
      expect(sql.toLowerCase()).not.toContain('ledger_entries');
      expect(sql.toLowerCase()).not.toContain('ai_usage_ledger');
      expect(sql.toLowerCase()).not.toContain('ai_quota_ledger');
    }
  });
});

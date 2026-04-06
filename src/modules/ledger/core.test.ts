/**
 * WCM-001 / WCM-010: Immutable Double-Entry Ledger Unit Tests
 *
 * Covers:
 *   - recordTransaction — double-entry, shared transactionId, kobo validation
 *   - holdInEscrow / releaseFromEscrow — escrow metadata
 *   - Cryptographic hash chaining — previousHash / entryHash propagation
 *   - verifyChainIntegrity — tamper detection
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LedgerService } from './core';

// ─── Mock D1 factory ──────────────────────────────────────────────────────────
//
// The ledger core uses two D1 call patterns:
//   1. getLatestEntryHash → db.prepare(sql).first()          — NO .bind()
//   2. INSERT stmt        → db.prepare(sql).bind(...).run()  — collected into db.batch()
//   3. verifyChainIntegrity → db.prepare(sql).all()          — NO .bind()
//
// The mock exposes .first() and .all() both directly on the prepared statement
// (for the parameterless queries) AND nested under .bind() (for the INSERT helpers
// passed to db.batch()).

function createMockD1(options: {
  latestHash?: string;
  entries?: unknown[];
} = {}) {
  const runMock   = vi.fn(async () => ({ meta: { changes: 1 } }));
  const batchMock = vi.fn(async () => [{ meta: { changes: 1 } }, { meta: { changes: 1 } }]);

  const firstFn = vi.fn(async () =>
    options.latestHash != null ? { entry_hash: options.latestHash } : null,
  );
  const allFn = vi.fn(async () => ({ results: options.entries ?? [] }));

  const db = {
    prepare: vi.fn((_sql: string) => {
      const stmt = {
        // Called directly (no .bind()) — used by getLatestEntryHash and verifyChainIntegrity
        first: firstFn,
        all:   allFn,
        run:   runMock,
        // Called with bound parameters — used by INSERT helpers collected into db.batch()
        bind: vi.fn((..._args: unknown[]) => ({
          first: firstFn,
          all:   allFn,
          run:   runMock,
        })),
      };
      return stmt;
    }),
    batch: batchMock,
    _runMock:   runMock,
    _batchMock: batchMock,
  };
  return db as unknown as D1Database & {
    _runMock: typeof runMock;
    _batchMock: typeof batchMock;
  };
}

// ─── MGMT-4: Immutable Double-Entry Ledger ────────────────────────────────────

describe('MGMT-4: Immutable Double-Entry Ledger', () => {
  let ledgerService: LedgerService;
  let mockDb: ReturnType<typeof createMockD1>;

  beforeEach(() => {
    mockDb        = createMockD1();
    ledgerService = new LedgerService(mockDb as unknown as D1Database);
  });

  it('should record a double-entry transaction', async () => {
    const { debit, credit } = await ledgerService.recordTransaction(
      'user_1',
      'user_2',
      50000,   // 500 NGN
      'NGN',
      { note: 'Test transfer' },
    );

    expect(debit.accountId).toBe('user_1');
    expect(debit.type).toBe('debit');
    expect(debit.amountKobo).toBe(50000);
    expect(debit.transactionId).toBe(credit.transactionId);

    expect(credit.accountId).toBe('user_2');
    expect(credit.type).toBe('credit');
    expect(credit.amountKobo).toBe(50000);
  });

  it('should reject non-integer kobo values', async () => {
    await expect(
      ledgerService.recordTransaction('user_1', 'user_2', 500.5),
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');
  });

  it('should reject zero or negative amounts', async () => {
    await expect(
      ledgerService.recordTransaction('user_1', 'user_2', 0),
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');

    await expect(
      ledgerService.recordTransaction('user_1', 'user_2', -100),
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');
  });

  it('should handle escrow hold and release workflows', async () => {
    const amount = 100000;
    const refId  = 'order_123';

    // Hold in escrow
    const holdEntries = await ledgerService.holdInEscrow('buyer_1', 'escrow_acct', amount, refId);
    expect(holdEntries).toHaveLength(2);
    expect(holdEntries[0].accountId).toBe('buyer_1');
    expect(holdEntries[0].type).toBe('debit');
    expect(holdEntries[1].accountId).toBe('escrow_acct');
    expect(holdEntries[1].type).toBe('credit');
    expect(holdEntries[0].metadata.type).toBe('escrow_hold');

    // Release from escrow
    const releaseEntries = await ledgerService.releaseFromEscrow('escrow_acct', 'seller_1', amount, refId);
    expect(releaseEntries).toHaveLength(2);
    expect(releaseEntries[0].accountId).toBe('escrow_acct');
    expect(releaseEntries[0].type).toBe('debit');
    expect(releaseEntries[1].accountId).toBe('seller_1');
    expect(releaseEntries[1].type).toBe('credit');
    expect(releaseEntries[0].metadata.type).toBe('escrow_release');
  });

  it('persists both ledger entries via db.batch (atomic write)', async () => {
    await ledgerService.recordTransaction('acc_a', 'acc_b', 10000);
    expect(mockDb._batchMock).toHaveBeenCalledOnce();
  });
});

// ─── WCM-001: Cryptographic hash chaining ─────────────────────────────────────

describe('WCM-001: Cryptographic hash chaining', () => {
  it('bootstraps with GENESIS when ledger is empty (no prior entry_hash)', async () => {
    const db = createMockD1({ latestHash: undefined });
    const service = new LedgerService(db as unknown as D1Database);

    const { debit } = await service.recordTransaction('a', 'b', 1000);

    // previousHash should be 'GENESIS' since db returned null for latest
    expect(debit.previousHash).toBe('GENESIS');
  });

  it('uses the previous entry_hash as the chain link', async () => {
    const prevHash = 'abc123def456';
    const db       = createMockD1({ latestHash: prevHash });
    const service  = new LedgerService(db as unknown as D1Database);

    const { debit } = await service.recordTransaction('a', 'b', 1000);

    expect(debit.previousHash).toBe(prevHash);
  });

  it('debit.entryHash is set and non-empty', async () => {
    const db = createMockD1();
    const service = new LedgerService(db as unknown as D1Database);

    const { debit, credit } = await service.recordTransaction('x', 'y', 5000);

    expect(debit.entryHash).toBeDefined();
    expect(debit.entryHash!.length).toBeGreaterThan(0);
    expect(credit.entryHash).toBeDefined();
    expect(credit.entryHash!.length).toBeGreaterThan(0);
  });

  it('credit.previousHash equals debit.entryHash (chain continuity)', async () => {
    const db = createMockD1();
    const service = new LedgerService(db as unknown as D1Database);

    const { debit, credit } = await service.recordTransaction('x', 'y', 5000);

    expect(credit.previousHash).toBe(debit.entryHash);
  });

  it('different transactions produce different entry hashes', async () => {
    const db1 = createMockD1();
    const db2 = createMockD1({ latestHash: 'different_prior_hash' });
    const s1  = new LedgerService(db1 as unknown as D1Database);
    const s2  = new LedgerService(db2 as unknown as D1Database);

    const { debit: d1 } = await s1.recordTransaction('a', 'b', 1000);
    const { debit: d2 } = await s2.recordTransaction('a', 'b', 1000);

    expect(d1.entryHash).not.toBe(d2.entryHash);
  });
});

// ─── WCM-001: Chain integrity verification ────────────────────────────────────

describe('WCM-001: verifyChainIntegrity', () => {
  it('returns valid=true with 0 checked entries when ledger is empty', async () => {
    const db = createMockD1({ entries: [] });
    const service = new LedgerService(db as unknown as D1Database);

    const result = await service.verifyChainIntegrity();

    expect(result.valid).toBe(true);
    expect(result.checkedEntries).toBe(0);
    expect(result.firstInvalidId).toBeUndefined();
  });

  it('detects a tampered entry (wrong entry_hash)', async () => {
    // Simulate a single ledger row with an entry_hash that doesn't match
    // what sha256hex(canonical(...)) would produce — since the hashes won't
    // match the recomputed value, the chain is invalid.
    const tamperedEntry = {
      id: 'led_001',
      transaction_id: 'txn_001',
      account_id: 'account_a',
      type: 'debit',
      amount_kobo: 50000,
      currency: 'NGN',
      created_at: 1000000,
      previous_hash: 'GENESIS',
      entry_hash: 'tampered_hash_that_will_not_match',
    };
    const db = createMockD1({ entries: [tamperedEntry] });
    const service = new LedgerService(db as unknown as D1Database);

    const result = await service.verifyChainIntegrity();

    expect(result.valid).toBe(false);
    expect(result.firstInvalidId).toBe('led_001');
    expect(result.checkedEntries).toBe(0);
  });
});

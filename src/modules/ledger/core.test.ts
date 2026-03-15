import { describe, it, expect, beforeEach } from 'vitest';
import { LedgerService } from './core';

describe('MGMT-4: Immutable Double-Entry Ledger', () => {
  let ledgerService: LedgerService;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {};
    ledgerService = new LedgerService(mockDb);
  });

  it('should record a double-entry transaction', async () => {
    const { debit, credit } = await ledgerService.recordTransaction(
      'user_1',
      'user_2',
      50000, // 500 NGN
      'NGN',
      { note: 'Test transfer' }
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
      ledgerService.recordTransaction('user_1', 'user_2', 500.5)
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');
  });

  it('should handle escrow hold and release workflows', async () => {
    const amount = 100000;
    const refId = 'order_123';

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
});

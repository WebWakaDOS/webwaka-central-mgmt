import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BillingLedger, UsageCategory, LedgerEntryType } from './index';
import { logger } from '../logger';

describe('CORE-8: Platform Billing & Usage Ledger', () => {
  let billingLedger: BillingLedger;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {
      prepare: vi.fn().mockReturnThis(),
      bind: vi.fn().mockReturnThis(),
      run: vi.fn().mockResolvedValue({ success: true }),
      first: vi.fn().mockResolvedValue({ balance: 500000 }) // 5000 NGN
    };

    billingLedger = new BillingLedger(mockDb);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── recordUsage (existing) ───────────────────────────────────────────────

  it('should record usage with integer kobo values', async () => {
    const entry = await billingLedger.recordUsage(
      'tenant-1',
      UsageCategory.AI_TOKENS,
      1500, // 15 NGN
      'OpenRouter GPT-4o-mini usage'
    );

    expect(entry.tenantId).toBe('tenant-1');
    expect(entry.type).toBe(LedgerEntryType.DEBIT);
    expect(entry.category).toBe(UsageCategory.AI_TOKENS);
    expect(entry.amountKobo).toBe(1500);
    expect(entry.description).toBe('OpenRouter GPT-4o-mini usage');
    expect(entry.id).toBeDefined();
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('should reject non-integer kobo values', async () => {
    await expect(
      billingLedger.recordUsage('tenant-1', UsageCategory.AI_TOKENS, 1500.5, 'Invalid amount')
    ).rejects.toThrow('Amount must be a positive integer in kobo');
  });

  it('should reject negative kobo values', async () => {
    await expect(
      billingLedger.recordUsage('tenant-1', UsageCategory.AI_TOKENS, -100, 'Invalid amount')
    ).rejects.toThrow('Amount must be a positive integer in kobo');
  });

  // ─── recordCredit ─────────────────────────────────────────────────────────

  it('should record a credit entry with CREDIT type', async () => {
    const entry = await billingLedger.recordCredit(
      'tenant-1',
      UsageCategory.SUBSCRIPTION_CREDIT,
      500000, // 5000 NGN top-up
      'Wallet top-up via Paystack'
    );

    expect(entry.tenantId).toBe('tenant-1');
    expect(entry.type).toBe(LedgerEntryType.CREDIT);
    expect(entry.category).toBe(UsageCategory.SUBSCRIPTION_CREDIT);
    expect(entry.amountKobo).toBe(500000);
    expect(entry.description).toBe('Wallet top-up via Paystack');
    expect(entry.id).toBeDefined();
    expect(entry.createdAt).toBeInstanceOf(Date);
  });

  it('should include optional metadata on credit entry when provided', async () => {
    const meta = { reference: 'PAY_REF_001', channel: 'paystack' };
    const entry = await billingLedger.recordCredit(
      'tenant-2',
      UsageCategory.SUBSCRIPTION_CREDIT,
      100000,
      'Promotional credit',
      meta
    );

    expect(entry.metadata).toEqual(meta);
  });

  it('should omit metadata from credit entry when not provided', async () => {
    const entry = await billingLedger.recordCredit(
      'tenant-2',
      UsageCategory.SUBSCRIPTION_CREDIT,
      100000,
      'Promo credit'
    );

    expect(entry.metadata).toBeUndefined();
  });

  it('should reject non-integer kobo on recordCredit', async () => {
    await expect(
      billingLedger.recordCredit(
        'tenant-1',
        UsageCategory.SUBSCRIPTION_CREDIT,
        999.99,
        'Bad amount'
      )
    ).rejects.toThrow('Amount must be a positive integer in kobo');
  });

  it('should reject negative kobo on recordCredit', async () => {
    await expect(
      billingLedger.recordCredit(
        'tenant-1',
        UsageCategory.SUBSCRIPTION_CREDIT,
        -500,
        'Bad amount'
      )
    ).rejects.toThrow('Amount must be a positive integer in kobo');
  });

  it('should allow recording both a debit and a credit for the same tenant', async () => {
    const debit = await billingLedger.recordUsage(
      'tenant-1',
      UsageCategory.AI_TOKENS,
      2000,
      'AI usage charge'
    );
    const credit = await billingLedger.recordCredit(
      'tenant-1',
      UsageCategory.SUBSCRIPTION_CREDIT,
      50000,
      'Top-up'
    );

    expect(debit.type).toBe(LedgerEntryType.DEBIT);
    expect(credit.type).toBe(LedgerEntryType.CREDIT);
    expect(debit.tenantId).toBe(credit.tenantId);
    expect(debit.id).not.toBe(credit.id);
  });

  // ─── getTenantBalance stub ────────────────────────────────────────────────

  it('should return 0 and emit a logger.warn flagging the stub', async () => {
    const warnSpy = vi.spyOn(logger, 'warn');

    const balance = await billingLedger.getTenantBalance('tenant-1');

    expect(balance).toBe(0);
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('stub'),
      expect.objectContaining({ tenantId: 'tenant-1' })
    );
  });
});

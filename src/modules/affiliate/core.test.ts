import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AffiliateSystem } from './core';

describe('MGMT-3: Multi-Level Affiliate System', () => {
  let affiliateSystem: AffiliateSystem;
  let mockDb: any;

  beforeEach(() => {
    mockDb = {};
    affiliateSystem = new AffiliateSystem(mockDb);
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
    
    // Start at level 3, should only get 3 splits (levels 3, 4, 5)
    const splits = await affiliateSystem.calculateSplits(transactionAmount, 'aff_3');

    expect(splits).toHaveLength(3);
    expect(splits[0].level).toBe(1); // Relative level from the start node
    expect(splits[0].amountKobo).toBe(2000); // aff_3 rate is 2%
  });

  it('should reject non-integer kobo values', async () => {
    await expect(
      affiliateSystem.calculateSplits(1000.5, 'aff_1')
    ).rejects.toThrow('Transaction amount must be a positive integer in kobo');
  });
});

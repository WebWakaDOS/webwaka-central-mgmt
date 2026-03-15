/**
 * MGMT-3: Multi-Level Affiliate System
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 * 
 * Handles 5-level hierarchy and automated commission splits.
 */

export interface AffiliateNode {
  id: string;
  userId: string;
  parentId: string | null;
  level: number; // 1 to 5
  commissionRate: number; // Percentage (e.g., 0.05 for 5%)
}

export interface CommissionSplit {
  affiliateId: string;
  userId: string;
  amountKobo: number;
  level: number;
}

export class AffiliateSystem {
  private db: any; // Type would be D1Database

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Calculates commission splits for a transaction up to 5 levels deep.
   */
  async calculateSplits(
    transactionAmountKobo: number, 
    directAffiliateId: string
  ): Promise<CommissionSplit[]> {
    if (!Number.isInteger(transactionAmountKobo) || transactionAmountKobo < 0) {
      throw new Error('Transaction amount must be a positive integer in kobo');
    }

    const splits: CommissionSplit[] = [];
    let currentAffiliateId: string | null = directAffiliateId;
    let currentLevel = 1;

    // Traverse up the hierarchy, max 5 levels
    while (currentAffiliateId && currentLevel <= 5) {
      const affiliate = await this.getAffiliate(currentAffiliateId);
      
      if (!affiliate) break;

      const commissionAmount = Math.floor(transactionAmountKobo * affiliate.commissionRate);
      
      if (commissionAmount > 0) {
        splits.push({
          affiliateId: affiliate.id,
          userId: affiliate.userId,
          amountKobo: commissionAmount,
          level: currentLevel
        });
      }

      currentAffiliateId = affiliate.parentId;
      currentLevel++;
    }

    return splits;
  }

  /**
   * Mock method to retrieve an affiliate from the database.
   */
  private async getAffiliate(id: string): Promise<AffiliateNode | null> {
    // In a real implementation, this would query D1
    // return await this.db.prepare('SELECT * FROM affiliates WHERE id = ?').bind(id).first();
    
    // Mock data for testing
    const mockData: Record<string, AffiliateNode> = {
      'aff_1': { id: 'aff_1', userId: 'user_1', parentId: 'aff_2', level: 1, commissionRate: 0.05 },
      'aff_2': { id: 'aff_2', userId: 'user_2', parentId: 'aff_3', level: 2, commissionRate: 0.03 },
      'aff_3': { id: 'aff_3', userId: 'user_3', parentId: 'aff_4', level: 3, commissionRate: 0.02 },
      'aff_4': { id: 'aff_4', userId: 'user_4', parentId: 'aff_5', level: 4, commissionRate: 0.01 },
      'aff_5': { id: 'aff_5', userId: 'user_5', parentId: null, level: 5, commissionRate: 0.005 },
    };

    return mockData[id] || null;
  }
}

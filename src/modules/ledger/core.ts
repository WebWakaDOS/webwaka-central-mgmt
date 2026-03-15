/**
 * MGMT-4: Immutable Double-Entry Ledger
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 * 
 * Handles escrow and payout workflows using CORE-8 billing principles.
 */

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  type: 'credit' | 'debit';
  amountKobo: number;
  currency: string;
  status: 'pending' | 'cleared' | 'failed';
  metadata: Record<string, any>;
  createdAt: Date;
}

export class LedgerService {
  private db: any; // Type would be D1Database

  constructor(db: any) {
    this.db = db;
  }

  /**
   * Records a double-entry transaction (credit one account, debit another).
   */
  async recordTransaction(
    fromAccountId: string,
    toAccountId: string,
    amountKobo: number,
    currency: string = 'NGN',
    metadata: Record<string, any> = {}
  ): Promise<{ debit: LedgerEntry; credit: LedgerEntry }> {
    if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
      throw new Error('Transaction amount must be a positive integer in kobo');
    }

    const transactionId = `txn_${crypto.randomUUID()}`;
    const now = new Date();

    const debitEntry: LedgerEntry = {
      id: `led_${crypto.randomUUID()}`,
      transactionId,
      accountId: fromAccountId,
      type: 'debit',
      amountKobo,
      currency,
      status: 'cleared',
      metadata,
      createdAt: now
    };

    const creditEntry: LedgerEntry = {
      id: `led_${crypto.randomUUID()}`,
      transactionId,
      accountId: toAccountId,
      type: 'credit',
      amountKobo,
      currency,
      status: 'cleared',
      metadata,
      createdAt: now
    };

    // In a real implementation, this would be a D1 transaction
    // await this.db.batch([
    //   this.db.prepare('INSERT INTO ledger ...').bind(...),
    //   this.db.prepare('INSERT INTO ledger ...').bind(...)
    // ]);

    return { debit: debitEntry, credit: creditEntry };
  }

  /**
   * Places funds in escrow.
   */
  async holdInEscrow(
    fromAccountId: string,
    escrowAccountId: string,
    amountKobo: number,
    referenceId: string
  ): Promise<LedgerEntry[]> {
    const { debit, credit } = await this.recordTransaction(
      fromAccountId,
      escrowAccountId,
      amountKobo,
      'NGN',
      { type: 'escrow_hold', referenceId }
    );
    return [debit, credit];
  }

  /**
   * Releases funds from escrow to the final recipient.
   */
  async releaseFromEscrow(
    escrowAccountId: string,
    toAccountId: string,
    amountKobo: number,
    referenceId: string
  ): Promise<LedgerEntry[]> {
    const { debit, credit } = await this.recordTransaction(
      escrowAccountId,
      toAccountId,
      amountKobo,
      'NGN',
      { type: 'escrow_release', referenceId }
    );
    return [debit, credit];
  }
}

/**
 * MGMT-4 / WCM-001: Immutable Double-Entry Ledger
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Implements:
 *   - Double-entry accounting (debit + credit for every transaction)
 *   - Escrow hold and release workflows
 *   - Cryptographic hash chaining for tamper-evident immutability
 *     Each entry stores SHA-256(previousEntryHash | canonicalFields) so the
 *     entire ledger can be verified offline without touching source code.
 *
 * Monetary invariant: all amounts in integer kobo (NGN × 100). Never floats.
 * Immutability invariant: cmgt_ledger_entries rows are NEVER updated or deleted.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

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
  previousHash?: string;
  entryHash?: string;
}

// ─── Hash helpers ─────────────────────────────────────────────────────────────

/**
 * Compute SHA-256 of a UTF-8 string.
 * Uses the Web Crypto API which is available in Cloudflare Workers and
 * modern Node.js environments (v19+).
 * Falls back to a deterministic placeholder when crypto.subtle is unavailable
 * (e.g., older Node test runners without --experimental-global-webcrypto).
 */
async function sha256hex(data: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoded = new TextEncoder().encode(data);
    const buf     = await crypto.subtle.digest('SHA-256', encoded);
    return Array.from(new Uint8Array(buf))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Deterministic fallback for test environments without subtle crypto
  // NOT cryptographically secure — only used in unit test contexts
  let h = 0;
  for (let i = 0; i < data.length; i++) {
    h = Math.imul(31, h) + data.charCodeAt(i) | 0;
  }
  return Math.abs(h).toString(16).padStart(64, '0');
}

/**
 * Canonical string representation of a ledger entry for hashing.
 * Fields are sorted and delimited to prevent collisions.
 */
function canonicalEntry(
  id: string,
  transactionId: string,
  accountId: string,
  type: string,
  amountKobo: number,
  currency: string,
  createdAt: number,
  previousHash: string,
): string {
  return [id, transactionId, accountId, type, amountKobo, currency, createdAt, previousHash].join('|');
}

/**
 * Fetch the entry_hash of the most recently recorded ledger entry.
 * Returns 'GENESIS' if the ledger is empty (first entry bootstraps the chain).
 */
async function getLatestEntryHash(db: D1Database): Promise<string> {
  const row = await db
    .prepare('SELECT entry_hash FROM cmgt_ledger_entries ORDER BY created_at DESC, id DESC LIMIT 1')
    .first<{ entry_hash: string }>();
  return row?.entry_hash ?? 'GENESIS';
}

// ─── LedgerService ────────────────────────────────────────────────────────────

export class LedgerService {
  private db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /**
   * Records a double-entry transaction: debit fromAccount, credit toAccount.
   * Both entries share the same transactionId and are persisted atomically.
   * Each entry is cryptographically chained to the previous one.
   */
  async recordTransaction(
    fromAccountId: string,
    toAccountId: string,
    amountKobo: number,
    currency: string = 'NGN',
    metadata: Record<string, any> = {},
  ): Promise<{ debit: LedgerEntry; credit: LedgerEntry }> {
    if (!Number.isInteger(amountKobo) || amountKobo <= 0) {
      throw new Error('Transaction amount must be a positive integer in kobo');
    }

    const transactionId  = `txn_${crypto.randomUUID()}`;
    const now            = new Date();
    const nowMs          = now.getTime();
    const metaJson       = JSON.stringify(metadata);

    // ── Hash chain: debit entry ───────────────────────────────────────────────
    const debitId       = `led_${crypto.randomUUID()}`;
    const prevHashDebit = await getLatestEntryHash(this.db);
    const debitEntryHash = await sha256hex(
      canonicalEntry(debitId, transactionId, fromAccountId, 'debit', amountKobo, currency, nowMs, prevHashDebit),
    );

    // ── Hash chain: credit entry ──────────────────────────────────────────────
    const creditId        = `led_${crypto.randomUUID()}`;
    const creditEntryHash = await sha256hex(
      canonicalEntry(creditId, transactionId, toAccountId, 'credit', amountKobo, currency, nowMs, debitEntryHash),
    );

    // ── Persist both entries atomically ───────────────────────────────────────
    await this.db.batch([
      this.db
        .prepare(
          `INSERT OR IGNORE INTO cmgt_ledger_entries
             (id, transaction_id, account_id, account_type, type,
              amount_kobo, currency, status, metadata_json,
              previous_hash, entry_hash, created_at)
           VALUES (?, ?, ?, 'custom', ?, ?, ?, 'cleared', ?, ?, ?, ?)`,
        )
        .bind(
          debitId, transactionId, fromAccountId, 'debit',
          amountKobo, currency, metaJson,
          prevHashDebit, debitEntryHash, nowMs,
        ),
      this.db
        .prepare(
          `INSERT OR IGNORE INTO cmgt_ledger_entries
             (id, transaction_id, account_id, account_type, type,
              amount_kobo, currency, status, metadata_json,
              previous_hash, entry_hash, created_at)
           VALUES (?, ?, ?, 'custom', ?, ?, ?, 'cleared', ?, ?, ?, ?)`,
        )
        .bind(
          creditId, transactionId, toAccountId, 'credit',
          amountKobo, currency, metaJson,
          debitEntryHash, creditEntryHash, nowMs,
        ),
    ]);

    const debitEntry: LedgerEntry = {
      id: debitId,
      transactionId,
      accountId: fromAccountId,
      type: 'debit',
      amountKobo,
      currency,
      status: 'cleared',
      metadata,
      createdAt: now,
      previousHash: prevHashDebit,
      entryHash: debitEntryHash,
    };

    const creditEntry: LedgerEntry = {
      id: creditId,
      transactionId,
      accountId: toAccountId,
      type: 'credit',
      amountKobo,
      currency,
      status: 'cleared',
      metadata,
      createdAt: now,
      previousHash: debitEntryHash,
      entryHash: creditEntryHash,
    };

    return { debit: debitEntry, credit: creditEntry };
  }

  /**
   * Places funds in escrow (debit buyer → credit escrow account).
   */
  async holdInEscrow(
    fromAccountId: string,
    escrowAccountId: string,
    amountKobo: number,
    referenceId: string,
  ): Promise<LedgerEntry[]> {
    const { debit, credit } = await this.recordTransaction(
      fromAccountId,
      escrowAccountId,
      amountKobo,
      'NGN',
      { type: 'escrow_hold', referenceId },
    );
    return [debit, credit];
  }

  /**
   * Releases funds from escrow to the final recipient (debit escrow → credit seller).
   */
  async releaseFromEscrow(
    escrowAccountId: string,
    toAccountId: string,
    amountKobo: number,
    referenceId: string,
  ): Promise<LedgerEntry[]> {
    const { debit, credit } = await this.recordTransaction(
      escrowAccountId,
      toAccountId,
      amountKobo,
      'NGN',
      { type: 'escrow_release', referenceId },
    );
    return [debit, credit];
  }

  /**
   * Verify the integrity of the ledger hash chain.
   * Reads all entries in creation order and re-computes each entry_hash,
   * checking it matches the stored value and that previous_hash links correctly.
   *
   * @returns { valid: boolean; checkedEntries: number; firstInvalidId?: string }
   */
  async verifyChainIntegrity(): Promise<{
    valid: boolean;
    checkedEntries: number;
    firstInvalidId?: string;
  }> {
    const { results } = await this.db
      .prepare(
        `SELECT id, transaction_id, account_id, type, amount_kobo, currency,
                created_at, previous_hash, entry_hash
         FROM cmgt_ledger_entries ORDER BY created_at ASC, id ASC`,
      )
      .all<{
        id: string;
        transaction_id: string;
        account_id: string;
        type: string;
        amount_kobo: number;
        currency: string;
        created_at: number;
        previous_hash: string;
        entry_hash: string;
      }>();

    let expectedPrevHash = 'GENESIS';
    let checkedEntries   = 0;

    for (const row of results) {
      const canonical = canonicalEntry(
        row.id,
        row.transaction_id,
        row.account_id,
        row.type,
        row.amount_kobo,
        row.currency,
        row.created_at,
        row.previous_hash,
      );
      const recomputed = await sha256hex(canonical);

      if (row.previous_hash !== expectedPrevHash || row.entry_hash !== recomputed) {
        return { valid: false, checkedEntries, firstInvalidId: row.id };
      }

      expectedPrevHash = row.entry_hash;
      checkedEntries++;
    }

    return { valid: true, checkedEntries };
  }
}

/**
 * QA-CEN-X: Webhook Dead-Letter Queue Unit Tests
 *
 * Covers: enqueueDLQ, retryDueDLQItems, listDLQEntries
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enqueueDLQ, retryDueDLQItems, listDLQEntries } from './dlq';
import type { DLQEntry } from './dlq';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function makeDLQEntry(overrides: Partial<DLQEntry> = {}): DLQEntry {
  return {
    id: 'dlq_test_001',
    event_id: 'evt_001',
    event_type: 'commerce.payout.processed',
    tenant_id: 'tenant_abc',
    target_url: 'https://example.com/webhook',
    payload_json: '{"amount":1000}',
    attempts: 0,
    last_error: null,
    next_retry_at: Date.now() - 1000, // already due
    status: 'pending',
    created_at: Date.now() - 60_000,
    delivered_at: null,
    ...overrides,
  };
}

function createMockD1(options: {
  dlqItems?: DLQEntry[];
  runChanges?: number;
} = {}) {
  const dlqItems = options.dlqItems ?? [];
  const runChanges = options.runChanges ?? 1;
  const runMock = vi.fn(async () => ({ meta: { changes: runChanges } }));

  return {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        run: runMock,
        first: vi.fn(async () => null),
        all: vi.fn(async () => ({ results: dlqItems })),
      })),
    })),
    batch: vi.fn(async () => []),
    _runMock: runMock,
  } as unknown as D1Database & { _runMock: typeof runMock };
}

// ─── enqueueDLQ ───────────────────────────────────────────────────────────────

describe('enqueueDLQ — enqueue a failed webhook delivery', () => {
  it('inserts a row and returns an ID starting with dlq_', async () => {
    const db = createMockD1();
    const id = await enqueueDLQ(db, 'evt_001', 'commerce.payout.processed', 'tenant_abc', 'https://example.com/wh', { amount: 1000 });

    expect(id).toMatch(/^dlq_/);
    expect(db._runMock).toHaveBeenCalledOnce();
  });

  it('works without a tenantId (undefined → null)', async () => {
    const db = createMockD1();
    const id = await enqueueDLQ(db, 'evt_002', 'ai.usage.recorded', undefined, 'https://example.com/wh', {});

    expect(id).toMatch(/^dlq_/);
  });

  it('accepts a pre-serialised JSON string as payload', async () => {
    const db = createMockD1();
    const id = await enqueueDLQ(db, 'evt_003', 'test.event', 'tid', 'https://x.com', '{"raw":true}');

    expect(id).toMatch(/^dlq_/);
  });
});

// ─── retryDueDLQItems ────────────────────────────────────────────────────────

describe('retryDueDLQItems — exponential backoff retry', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('delivers an item successfully and marks it delivered', async () => {
    const mockFetch = vi.fn(async () => new Response('ok', { status: 200 }));
    vi.stubGlobal('fetch', mockFetch);

    const item = makeDLQEntry();
    const db = createMockD1({ dlqItems: [item] });

    const result = await retryDueDLQItems(db);

    expect(result.processed).toBe(1);
    expect(result.delivered).toBe(1);
    expect(result.exhausted).toBe(0);
    expect(result.rescheduled).toBe(0);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('reschedules an item that fails (attempts < MAX)', async () => {
    const mockFetch = vi.fn(async () => new Response('Server Error', { status: 503 }));
    vi.stubGlobal('fetch', mockFetch);

    const item = makeDLQEntry({ attempts: 0 });
    const db = createMockD1({ dlqItems: [item] });

    const result = await retryDueDLQItems(db);

    expect(result.delivered).toBe(0);
    expect(result.rescheduled).toBe(1);
    expect(result.exhausted).toBe(0);
  });

  it('marks an item exhausted after reaching max attempts (4 → attempt 5)', async () => {
    const mockFetch = vi.fn(async () => new Response('Server Error', { status: 503 }));
    vi.stubGlobal('fetch', mockFetch);

    const item = makeDLQEntry({ attempts: 4 }); // next attempt is the 5th
    const db = createMockD1({ dlqItems: [item] });

    const result = await retryDueDLQItems(db);

    expect(result.exhausted).toBe(1);
    expect(result.rescheduled).toBe(0);
    expect(result.delivered).toBe(0);
  });

  it('reschedules when fetch throws a network error', async () => {
    const mockFetch = vi.fn(async () => { throw new Error('ECONNREFUSED'); });
    vi.stubGlobal('fetch', mockFetch);

    const item = makeDLQEntry({ attempts: 0 });
    const db = createMockD1({ dlqItems: [item] });

    const result = await retryDueDLQItems(db);

    expect(result.rescheduled).toBe(1);
    expect(result.delivered).toBe(0);
  });

  it('returns zeroes when there are no due items', async () => {
    const db = createMockD1({ dlqItems: [] });

    const result = await retryDueDLQItems(db);

    expect(result.processed).toBe(0);
    expect(result.delivered).toBe(0);
    expect(result.exhausted).toBe(0);
    expect(result.rescheduled).toBe(0);
  });

  it('handles a batch of multiple items correctly', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce(new Response('ok', { status: 200 })) // first → delivered
      .mockRejectedValueOnce(new Error('timeout'));                  // second → rescheduled

    vi.stubGlobal('fetch', mockFetch);

    const items = [makeDLQEntry({ id: 'dlq_a', attempts: 0 }), makeDLQEntry({ id: 'dlq_b', attempts: 0 })];
    const db = createMockD1({ dlqItems: items });

    const result = await retryDueDLQItems(db);

    expect(result.processed).toBe(2);
    expect(result.delivered).toBe(1);
    expect(result.rescheduled).toBe(1);
  });
});

// ─── listDLQEntries ──────────────────────────────────────────────────────────

describe('listDLQEntries — pagination and filtering', () => {
  it('returns all entries when no status filter is given', async () => {
    const items = [makeDLQEntry({ id: 'dlq_1' }), makeDLQEntry({ id: 'dlq_2' })];
    const db = createMockD1({ dlqItems: items });

    const result = await listDLQEntries(db);

    expect(result).toHaveLength(2);
  });

  it('returns entries filtered by status', async () => {
    const items = [makeDLQEntry({ id: 'dlq_1', status: 'exhausted' })];
    const db = createMockD1({ dlqItems: items });

    const result = await listDLQEntries(db, 'exhausted');

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe('exhausted');
  });
});

/**
 * QA-CEN-X: Tenant Suspension Hook Unit Tests
 *
 * Covers: suspendTenant, unsuspendTenant, isTenantSuspended, getTenantSuspensionLog
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  suspendTenant,
  unsuspendTenant,
  isTenantSuspended,
  getTenantSuspensionLog,
} from './suspension';

// ─── Mock factories ───────────────────────────────────────────────────────────

function createMockKV(initialStore: Record<string, string> = {}) {
  const store: Record<string, string> = { ...initialStore };
  return {
    get: vi.fn(async (key: string) => store[key] ?? null),
    put: vi.fn(async (key: string, value: string) => { store[key] = value; }),
    _store: store,
  } as unknown as KVNamespace & { _store: typeof store };
}

function createMockD1(logRows: unknown[] = []) {
  const runMock = vi.fn(async () => ({ meta: { changes: 1 } }));
  return {
    prepare: vi.fn((_sql: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        run: runMock,
        all: vi.fn(async () => ({ results: logRows })),
        first: vi.fn(async () => null),
      })),
    })),
    batch: vi.fn(async () => []),
    _runMock: runMock,
  } as unknown as D1Database & { _runMock: typeof runMock };
}

// ─── isTenantSuspended ────────────────────────────────────────────────────────

describe('isTenantSuspended', () => {
  it('returns false when no KV record exists', async () => {
    const kv = createMockKV();
    expect(await isTenantSuspended(kv, 'unknown_tenant')).toBe(false);
  });

  it('returns false when tenant status is active', async () => {
    const kv = createMockKV({
      'tenant:tenant_abc': JSON.stringify({ status: 'active' }),
    });
    expect(await isTenantSuspended(kv, 'tenant_abc')).toBe(false);
  });

  it('returns true when tenant status is suspended', async () => {
    const kv = createMockKV({
      'tenant:tenant_xyz': JSON.stringify({ status: 'suspended' }),
    });
    expect(await isTenantSuspended(kv, 'tenant_xyz')).toBe(true);
  });

  it('returns false when KV value is malformed JSON', async () => {
    const kv = createMockKV({
      'tenant:bad': 'not-json',
    });
    expect(await isTenantSuspended(kv, 'bad')).toBe(false);
  });
});

// ─── suspendTenant ────────────────────────────────────────────────────────────

describe('suspendTenant', () => {
  it('updates KV status to suspended', async () => {
    const kv = createMockKV({
      'tenant:t1': JSON.stringify({ status: 'active', enabledModules: [] }),
    });
    const db = createMockD1();

    await suspendTenant(kv, db, 't1', 'Overdue invoice');

    const stored = JSON.parse(kv._store['tenant:t1']);
    expect(stored.status).toBe('suspended');
    expect(stored.suspensionReason).toBe('Overdue invoice');
    expect(stored.suspendedAt).toBeDefined();
  });

  it('writes an audit log entry to D1', async () => {
    const kv = createMockKV({
      'tenant:t2': JSON.stringify({ status: 'active' }),
    });
    const db = createMockD1();

    await suspendTenant(kv, db, 't2', 'Fraud detected', 'admin_007');

    expect(db._runMock).toHaveBeenCalledOnce();
  });

  it('returns correct SuspensionResult', async () => {
    const kv = createMockKV({ 'tenant:t3': JSON.stringify({ status: 'active' }) });
    const db = createMockD1();

    const result = await suspendTenant(kv, db, 't3', 'Policy violation');

    expect(result.tenantId).toBe('t3');
    expect(result.action).toBe('suspend');
    expect(result.reason).toBe('Policy violation');
    expect(result.logId).toMatch(/^susp_/);
  });

  it('creates a stub KV entry when tenant has no prior config', async () => {
    const kv = createMockKV(); // empty — no prior tenant record
    const db = createMockD1();

    await suspendTenant(kv, db, 'new_tenant', 'Proactive suspension');

    const stored = JSON.parse(kv._store['tenant:new_tenant']);
    expect(stored.status).toBe('suspended');
    expect(stored.tenantId).toBe('new_tenant');
  });

  it('is idempotent — re-suspending an already suspended tenant works safely', async () => {
    const kv = createMockKV({
      'tenant:t4': JSON.stringify({ status: 'suspended' }),
    });
    const db = createMockD1();

    // Should not throw
    await expect(suspendTenant(kv, db, 't4', 'Re-suspend')).resolves.toBeDefined();
    expect(JSON.parse(kv._store['tenant:t4']).status).toBe('suspended');
  });
});

// ─── unsuspendTenant ──────────────────────────────────────────────────────────

describe('unsuspendTenant', () => {
  it('updates KV status back to active', async () => {
    const kv = createMockKV({
      'tenant:t5': JSON.stringify({ status: 'suspended', suspendedAt: 123, suspensionReason: 'test' }),
    });
    const db = createMockD1();

    await unsuspendTenant(kv, db, 't5', 'Issue resolved');

    const stored = JSON.parse(kv._store['tenant:t5']);
    expect(stored.status).toBe('active');
    expect(stored.suspendedAt).toBeUndefined();
    expect(stored.suspensionReason).toBeUndefined();
  });

  it('writes an audit log entry to D1', async () => {
    const kv = createMockKV({ 'tenant:t6': JSON.stringify({ status: 'suspended' }) });
    const db = createMockD1();

    await unsuspendTenant(kv, db, 't6', 'Reinstated');

    expect(db._runMock).toHaveBeenCalledOnce();
  });

  it('returns correct SuspensionResult with action = unsuspend', async () => {
    const kv = createMockKV({ 'tenant:t7': JSON.stringify({ status: 'suspended' }) });
    const db = createMockD1();

    const result = await unsuspendTenant(kv, db, 't7', 'Appeal approved', 'admin_003');

    expect(result.action).toBe('unsuspend');
    expect(result.tenantId).toBe('t7');
    expect(result.logId).toMatch(/^unsusp_/);
  });

  it('does not fail when tenant has no KV record', async () => {
    const kv = createMockKV(); // no record
    const db = createMockD1();

    // Should not throw even if KV has no entry
    await expect(unsuspendTenant(kv, db, 'ghost_tenant', 'Cleanup')).resolves.toBeDefined();
  });
});

// ─── suspend / unsuspend round-trip ──────────────────────────────────────────

describe('suspend → unsuspend round-trip', () => {
  it('tenant is suspended then reinstated; isTenantSuspended reflects both states', async () => {
    const kv = createMockKV({
      'tenant:round_trip': JSON.stringify({ status: 'active', enabledModules: [] }),
    });
    const db = createMockD1();

    // Initially active
    expect(await isTenantSuspended(kv, 'round_trip')).toBe(false);

    await suspendTenant(kv, db, 'round_trip', 'Test suspension');
    expect(await isTenantSuspended(kv, 'round_trip')).toBe(true);

    await unsuspendTenant(kv, db, 'round_trip', 'Test reinstatement');
    expect(await isTenantSuspended(kv, 'round_trip')).toBe(false);
  });
});

// ─── getTenantSuspensionLog ───────────────────────────────────────────────────

describe('getTenantSuspensionLog', () => {
  it('returns rows from D1 for the given tenant', async () => {
    const logRows = [
      { id: 'susp_1', action: 'suspend', reason: 'Fraud', suspended_by: 'system', created_at: 1000 },
      { id: 'unsusp_1', action: 'unsuspend', reason: 'Resolved', suspended_by: 'admin', created_at: 2000 },
    ];
    const db = createMockD1(logRows);

    const log = await getTenantSuspensionLog(db, 'tenant_abc');

    expect(log).toHaveLength(2);
    expect(log[0].action).toBe('suspend');
    expect(log[1].action).toBe('unsuspend');
  });

  it('returns empty array when no log entries exist', async () => {
    const db = createMockD1([]);
    const log = await getTenantSuspensionLog(db, 'new_tenant');
    expect(log).toHaveLength(0);
  });
});

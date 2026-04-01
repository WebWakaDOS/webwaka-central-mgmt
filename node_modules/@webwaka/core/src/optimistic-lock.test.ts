import { describe, it, expect, vi } from 'vitest';
import { updateWithVersionLock } from './optimistic-lock';

function makeMockDb(changes: number) {
  const mockRun = vi.fn().mockResolvedValue({ meta: { changes } });
  const mockBind = vi.fn().mockReturnValue({ run: mockRun });
  const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
  return { prepare: mockPrepare, mockRun, mockBind, mockPrepare };
}

describe('updateWithVersionLock', () => {
  it('returns success: true when row is updated (changes = 1)', async () => {
    const { prepare } = makeMockDb(1);
    const result = await updateWithVersionLock(
      { prepare } as any,
      'orders',
      { status: 'completed' },
      { id: 'order-1', tenantId: 'tenant-1', expectedVersion: 3 }
    );
    expect(result.success).toBe(true);
    expect(result.conflict).toBe(false);
  });

  it('returns conflict: true when no rows are updated (version mismatch)', async () => {
    const { prepare } = makeMockDb(0);
    const result = await updateWithVersionLock(
      { prepare } as any,
      'orders',
      { status: 'completed' },
      { id: 'order-1', tenantId: 'tenant-1', expectedVersion: 3 }
    );
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(true);
  });

  it('returns error when db throws', async () => {
    const mockRun = vi.fn().mockRejectedValue(new Error('D1 error'));
    const mockBind = vi.fn().mockReturnValue({ run: mockRun });
    const mockPrepare = vi.fn().mockReturnValue({ bind: mockBind });
    const mockDb = { prepare: mockPrepare } as any;

    const result = await updateWithVersionLock(
      mockDb,
      'orders',
      { status: 'completed' },
      { id: 'order-1', tenantId: 'tenant-1', expectedVersion: 1 }
    );
    expect(result.success).toBe(false);
    expect(result.conflict).toBe(false);
    expect(result.error).toBe('D1 error');
  });

  it('builds SET clause from multiple update fields', async () => {
    const { prepare, mockBind } = makeMockDb(1);
    await updateWithVersionLock(
      { prepare } as any,
      'products',
      { name: 'Widget', priceKobo: 5000, stock: 10 },
      { id: 'prod-1', tenantId: 'tenant-2', expectedVersion: 5 }
    );
    const sql = (prepare as any).mock.calls[0][0] as string;
    expect(sql).toContain('name = ?');
    expect(sql).toContain('priceKobo = ?');
    expect(sql).toContain('stock = ?');
    expect(sql).toContain('version = version + 1');
    // bind args: 3 update values + updatedAt + id + tenantId + expectedVersion
    const bindArgs = mockBind.mock.calls[0];
    expect(bindArgs).toContain('Widget');
    expect(bindArgs).toContain(5000);
    expect(bindArgs).toContain(10);
    expect(bindArgs).toContain('prod-1');
    expect(bindArgs).toContain('tenant-2');
    expect(bindArgs).toContain(5);
  });
});

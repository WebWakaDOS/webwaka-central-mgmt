import { describe, it, expect } from 'vitest';
import { parsePagination, metaResponse, applyTenantScope } from './query-helpers';

describe('parsePagination', () => {
  it('returns default limit and offset when no params provided', () => {
    const result = parsePagination({});
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });

  it('parses valid limit and offset', () => {
    const result = parsePagination({ limit: '50', offset: '100' });
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(100);
  });

  it('clamps limit to maxLimit', () => {
    const result = parsePagination({ limit: '500' }, 100);
    expect(result.limit).toBe(100);
  });

  it('clamps limit to minimum of 1 for non-zero invalid values', () => {
    // parseInt('0') = 0, which is falsy, so || 20 kicks in → 20
    // The minimum-1 clamp applies to values like parseInt('-5') = -5 → max(-5,1) = 1
    const result = parsePagination({ limit: '-5' });
    expect(result.limit).toBe(1);
  });

  it('clamps offset to minimum of 0', () => {
    const result = parsePagination({ offset: '-5' });
    expect(result.offset).toBe(0);
  });

  it('handles non-numeric values gracefully', () => {
    const result = parsePagination({ limit: 'abc', offset: 'xyz' });
    expect(result.limit).toBe(20);
    expect(result.offset).toBe(0);
  });
});

describe('metaResponse', () => {
  it('returns data and correct meta fields', () => {
    const data = [{ id: 1 }, { id: 2 }];
    const result = metaResponse(data, 50, 20, 0);
    expect(result.data).toEqual(data);
    expect(result.meta.total).toBe(50);
    expect(result.meta.limit).toBe(20);
    expect(result.meta.offset).toBe(0);
    expect(result.meta.has_more).toBe(true);
  });

  it('sets has_more to false when on last page', () => {
    const result = metaResponse([], 20, 20, 0);
    expect(result.meta.has_more).toBe(false);
  });

  it('sets has_more to false when offset + limit >= total', () => {
    const result = metaResponse([], 25, 10, 20);
    expect(result.meta.has_more).toBe(false);
  });

  it('sets has_more to true when more pages exist', () => {
    const result = metaResponse([], 100, 10, 10);
    expect(result.meta.has_more).toBe(true);
  });
});

describe('applyTenantScope', () => {
  it('appends WHERE clause when no WHERE exists', () => {
    const { query, params } = applyTenantScope(
      'SELECT * FROM orders',
      [],
      'tenant-1'
    );
    expect(query).toContain('WHERE operator_id = ?');
    expect(params).toContain('tenant-1');
  });

  it('appends AND clause when WHERE already exists', () => {
    const { query, params } = applyTenantScope(
      'SELECT * FROM orders WHERE status = ?',
      ['active'],
      'tenant-2'
    );
    expect(query).toContain('AND operator_id = ?');
    expect(params).toEqual(['active', 'tenant-2']);
  });

  it('uses custom column name when provided', () => {
    const { query } = applyTenantScope(
      'SELECT * FROM items',
      [],
      'tenant-3',
      'tenant_id'
    );
    expect(query).toContain('WHERE tenant_id = ?');
  });
});

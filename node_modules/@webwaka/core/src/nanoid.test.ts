import { describe, it, expect } from 'vitest';
import { nanoid, genId } from './nanoid';

describe('nanoid', () => {
  it('generates an ID of the default length (21 chars)', () => {
    const id = nanoid();
    expect(id).toHaveLength(21);
  });

  it('generates an ID with a custom length', () => {
    const id = nanoid('', 10);
    expect(id).toHaveLength(10);
  });

  it('prepends prefix with underscore separator', () => {
    const id = nanoid('usr', 21);
    expect(id.startsWith('usr_')).toBe(true);
    // prefix + '_' + 21 chars
    expect(id).toHaveLength(4 + 21);
  });

  it('generates only alphanumeric characters in the ID part', () => {
    const id = nanoid('', 100);
    expect(id).toMatch(/^[A-Za-z0-9]+$/);
  });

  it('generates unique IDs on each call', () => {
    const ids = new Set(Array.from({ length: 100 }, () => nanoid()));
    expect(ids.size).toBe(100);
  });

  it('genId is an alias for nanoid', () => {
    const id = genId('test', 10);
    expect(id.startsWith('test_')).toBe(true);
    expect(id).toHaveLength(5 + 10);
  });

  it('returns just the id when prefix is empty string', () => {
    const id = nanoid('', 5);
    expect(id).toHaveLength(5);
    expect(id).not.toContain('_');
  });
});

import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin } from './pin';

describe('hashPin', () => {
  it('returns a hash and a salt', async () => {
    const result = await hashPin('1234');
    expect(result).toHaveProperty('hash');
    expect(result).toHaveProperty('salt');
    expect(typeof result.hash).toBe('string');
    expect(typeof result.salt).toBe('string');
    expect(result.hash.length).toBeGreaterThan(0);
    expect(result.salt.length).toBeGreaterThan(0);
  });

  it('produces a deterministic hash when salt is provided', async () => {
    const salt = 'fixed-salt-for-test';
    const result1 = await hashPin('5678', salt);
    const result2 = await hashPin('5678', salt);
    expect(result1.hash).toBe(result2.hash);
    expect(result1.salt).toBe(salt);
  });

  it('produces different hashes for different PINs with the same salt', async () => {
    const salt = 'same-salt';
    const r1 = await hashPin('1111', salt);
    const r2 = await hashPin('2222', salt);
    expect(r1.hash).not.toBe(r2.hash);
  });

  it('generates a random salt when none is provided', async () => {
    const r1 = await hashPin('9999');
    const r2 = await hashPin('9999');
    // Different salts → different hashes
    expect(r1.salt).not.toBe(r2.salt);
    expect(r1.hash).not.toBe(r2.hash);
  });
});

describe('verifyPin', () => {
  it('returns true for a correct PIN', async () => {
    const { hash, salt } = await hashPin('4321');
    const valid = await verifyPin('4321', hash, salt);
    expect(valid).toBe(true);
  });

  it('returns false for an incorrect PIN', async () => {
    const { hash, salt } = await hashPin('4321');
    const valid = await verifyPin('9999', hash, salt);
    expect(valid).toBe(false);
  });

  it('returns false when salt is wrong', async () => {
    const { hash } = await hashPin('1234', 'correct-salt');
    const valid = await verifyPin('1234', hash, 'wrong-salt');
    expect(valid).toBe(false);
  });
});

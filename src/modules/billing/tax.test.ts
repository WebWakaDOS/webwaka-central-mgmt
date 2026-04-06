/**
 * QA-CEN-2: Tax Splitting Unit Tests
 * QA-CEN-3: Multi-Currency Unit Tests
 *
 * Covers: calculateTaxes, convertToNGNKobo, isSupportedCurrency
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  calculateTaxes,
  convertToNGNKobo,
  isSupportedCurrency,
  VAT_RATE,
  WHT_RATE,
  DEFAULT_FX_TO_NGN,
} from './tax';

// ─── Mock D1 factory ──────────────────────────────────────────────────────────

function createMockD1(fxRateToNGN?: number) {
  return {
    prepare: (_sql: string) => ({
      bind: (..._args: unknown[]) => ({
        first: async () =>
          fxRateToNGN != null ? { rate_to_ngn: fxRateToNGN } : null,
        run: async () => ({ meta: { changes: 0 } }),
        all: async () => ({ results: [] }),
      }),
    }),
    batch: async () => [],
  } as unknown as D1Database;
}

// ─── calculateTaxes ───────────────────────────────────────────────────────────

describe('QA-CEN-2: calculateTaxes — tax splitting (VAT 7.5%, WHT 5%)', () => {
  it('splits ₦100,000 gross into correct VAT, WHT, and net', () => {
    const result = calculateTaxes(10_000_000); // ₦100,000 in kobo

    expect(result.grossKobo).toBe(10_000_000);
    expect(result.vatKobo).toBe(750_000);    // 7.5%
    expect(result.whtKobo).toBe(500_000);    // 5.0%
    expect(result.netKobo).toBe(8_750_000);  // 87.5%
    expect(result.currency).toBe('NGN');
  });

  it('VAT rate is exactly 7.5%', () => {
    const { grossKobo, vatKobo } = calculateTaxes(100_000);
    expect(vatKobo / grossKobo).toBeCloseTo(VAT_RATE, 10);
  });

  it('WHT rate is exactly 5.0%', () => {
    const { grossKobo, whtKobo } = calculateTaxes(100_000);
    expect(whtKobo / grossKobo).toBeCloseTo(WHT_RATE, 10);
  });

  it('net = gross - vat - wht', () => {
    const { grossKobo, vatKobo, whtKobo, netKobo } = calculateTaxes(7_777_777);
    expect(netKobo).toBe(grossKobo - vatKobo - whtKobo);
  });

  it('net + vat + wht always equals gross (no rounding leak)', () => {
    // Check several values for rounding consistency
    for (const gross of [1_000, 9_999, 1_234_567, 50_000_000]) {
      const { grossKobo, vatKobo, whtKobo, netKobo } = calculateTaxes(gross);
      expect(netKobo + vatKobo + whtKobo).toBe(grossKobo);
    }
  });

  it('accepts GHS currency tag', () => {
    const result = calculateTaxes(1_000_000, 'GHS');
    expect(result.currency).toBe('GHS');
    expect(result.vatKobo).toBe(75_000);
    expect(result.whtKobo).toBe(50_000);
    expect(result.netKobo).toBe(875_000);
  });

  it('accepts KES currency tag', () => {
    const result = calculateTaxes(500_000, 'KES');
    expect(result.currency).toBe('KES');
  });

  it('rejects zero amount', () => {
    expect(() => calculateTaxes(0)).toThrow('grossKobo must be a positive integer');
  });

  it('rejects negative amount', () => {
    expect(() => calculateTaxes(-5000)).toThrow('grossKobo must be a positive integer');
  });

  it('rejects non-integer amount', () => {
    expect(() => calculateTaxes(1000.5)).toThrow('grossKobo must be a positive integer');
  });

  it('handles minimum kobo (1 kobo)', () => {
    const result = calculateTaxes(1);
    expect(result.grossKobo).toBe(1);
    // VAT = round(1 * 0.075) = 0, WHT = round(1 * 0.05) = 0
    expect(result.vatKobo + result.whtKobo + result.netKobo).toBe(1);
  });

  it('handles large amounts without overflow', () => {
    const gross = 1_000_000_000; // ₦10,000,000
    const result = calculateTaxes(gross);
    expect(result.netKobo + result.vatKobo + result.whtKobo).toBe(gross);
  });
});

// ─── isSupportedCurrency ──────────────────────────────────────────────────────

describe('QA-CEN-3: isSupportedCurrency — currency validation', () => {
  it('accepts NGN', () => expect(isSupportedCurrency('NGN')).toBe(true));
  it('accepts GHS', () => expect(isSupportedCurrency('GHS')).toBe(true));
  it('accepts KES', () => expect(isSupportedCurrency('KES')).toBe(true));
  it('rejects USD', () => expect(isSupportedCurrency('USD')).toBe(false));
  it('rejects empty string', () => expect(isSupportedCurrency('')).toBe(false));
  it('rejects lowercase ngn', () => expect(isSupportedCurrency('ngn')).toBe(false));
});

// ─── convertToNGNKobo ─────────────────────────────────────────────────────────

describe('QA-CEN-3: convertToNGNKobo — multi-currency FX conversion', () => {
  it('returns same value for NGN (no conversion)', async () => {
    const db = createMockD1();
    const result = await convertToNGNKobo(5_000_000, 'NGN', db);
    expect(result).toBe(5_000_000);
  });

  it('converts GHS using live rate from D1', async () => {
    const db = createMockD1(90); // 1 GHS = 90 NGN
    const result = await convertToNGNKobo(1_000_000, 'GHS', db);
    expect(result).toBe(90_000_000); // 1M GHS kobo × 90 = 90M NGN kobo
  });

  it('converts KES using live rate from D1', async () => {
    const db = createMockD1(5.5); // 1 KES = 5.5 NGN
    const result = await convertToNGNKobo(2_000_000, 'KES', db);
    expect(result).toBe(11_000_000);
  });

  it('falls back to DEFAULT_FX_TO_NGN when D1 has no row', async () => {
    const db = createMockD1(undefined); // no row in cmgt_fx_rates
    const result = await convertToNGNKobo(1_000_000, 'GHS', db);
    // Should use DEFAULT_FX_TO_NGN.GHS = 90
    expect(result).toBe(90_000_000);
  });

  it('default FX rates match documented values', () => {
    expect(DEFAULT_FX_TO_NGN.NGN).toBe(1);
    expect(DEFAULT_FX_TO_NGN.GHS).toBe(90);
    expect(DEFAULT_FX_TO_NGN.KES).toBe(5.5);
  });

  it('result is always an integer (Math.round applied)', async () => {
    const db = createMockD1(5.5);
    const result = await convertToNGNKobo(3, 'KES', db); // 3 * 5.5 = 16.5 → 17
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBe(17);
  });
});

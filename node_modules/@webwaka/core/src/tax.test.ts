import { describe, it, expect } from 'vitest';
import { TaxEngine, createTaxEngine } from './tax.js';

describe('TaxEngine.compute()', () => {
  it('applies VAT to all items when none are exempt', () => {
    const engine = createTaxEngine({
      vatRate: 0.075,
      vatRegistered: true,
      exemptCategories: [],
    });

    const result = engine.compute([
      { category: 'food', amountKobo: 10_000 },
      { category: 'electronics', amountKobo: 50_000 },
    ]);

    expect(result.subtotalKobo).toBe(60_000);
    expect(result.vatKobo).toBe(Math.round(10_000 * 0.075) + Math.round(50_000 * 0.075));
    expect(result.totalKobo).toBe(result.subtotalKobo + result.vatKobo);
    expect(result.vatBreakdown).toHaveLength(2);
  });

  it('skips VAT for exempt categories', () => {
    const engine = createTaxEngine({
      vatRate: 0.075,
      vatRegistered: true,
      exemptCategories: ['food', 'medicine'],
    });

    const result = engine.compute([
      { category: 'food', amountKobo: 10_000 },
      { category: 'electronics', amountKobo: 20_000 },
      { category: 'medicine', amountKobo: 5_000 },
    ]);

    const foodBreakdown = result.vatBreakdown.find((b) => b.category === 'food');
    const medicineBreakdown = result.vatBreakdown.find((b) => b.category === 'medicine');
    const electronicsBreakdown = result.vatBreakdown.find((b) => b.category === 'electronics');

    expect(foodBreakdown?.vatKobo).toBe(0);
    expect(medicineBreakdown?.vatKobo).toBe(0);
    expect(electronicsBreakdown?.vatKobo).toBe(Math.round(20_000 * 0.075));
    expect(result.subtotalKobo).toBe(35_000);
  });

  it('skips all VAT when vatRegistered is false', () => {
    const engine = createTaxEngine({
      vatRate: 0.075,
      vatRegistered: false,
      exemptCategories: [],
    });

    const result = engine.compute([
      { category: 'electronics', amountKobo: 100_000 },
    ]);

    expect(result.vatKobo).toBe(0);
    expect(result.totalKobo).toBe(100_000);
  });

  it('rounds kobo values correctly', () => {
    const engine = new TaxEngine({
      vatRate: 0.075,
      vatRegistered: true,
      exemptCategories: [],
    });

    const result = engine.compute([{ category: 'misc', amountKobo: 1 }]);
    expect(result.vatKobo).toBe(Math.round(1 * 0.075));
  });

  it('returns zero totals for empty items', () => {
    const engine = createTaxEngine({
      vatRate: 0.075,
      vatRegistered: true,
      exemptCategories: [],
    });

    const result = engine.compute([]);
    expect(result.subtotalKobo).toBe(0);
    expect(result.vatKobo).toBe(0);
    expect(result.totalKobo).toBe(0);
    expect(result.vatBreakdown).toHaveLength(0);
  });
});

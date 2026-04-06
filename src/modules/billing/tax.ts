/**
 * Automated Tax Splitting — VAT & WHT
 * Blueprint Reference: Part 10.1 (Central Management & Economics)
 *
 * Phase 1 — Financial Integrity
 *
 * Implements:
 *   - VAT  (Value Added Tax):     7.5% of gross
 *   - WHT  (Withholding Tax):     5.0% of gross
 *   - Net payout to vendor:       gross − VAT − WHT (87.5%)
 *   - Multi-currency support:     NGN (base), GHS, KES via cmgt_fx_rates table
 */

export const VAT_RATE = 0.075;   // 7.5%
export const WHT_RATE = 0.050;   // 5.0%

export const SUPPORTED_CURRENCIES = ['NGN', 'GHS', 'KES'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

/** Approximate fallback rates — used if cmgt_fx_rates table has no row for the currency. */
export const DEFAULT_FX_TO_NGN: Record<SupportedCurrency, number> = {
  NGN: 1,
  GHS: 90,
  KES: 5.5,
};

export interface TaxBreakdown {
  grossKobo: number;   // Original gross amount
  vatKobo: number;     // 7.5% VAT
  whtKobo: number;     // 5.0% WHT
  netKobo: number;     // Amount to vendor (gross − vat − wht)
  currency: SupportedCurrency;
}

/**
 * Calculate VAT (7.5%) and WHT (5%) for a gross amount.
 * All values are integer kobo (or equivalent smallest currency unit).
 *
 * @param grossKobo  Gross payout amount in the smallest unit of `currency`.
 * @param currency   The payment currency (defaults to NGN).
 */
export function calculateTaxes(
  grossKobo: number,
  currency: SupportedCurrency = 'NGN',
): TaxBreakdown {
  if (!Number.isInteger(grossKobo) || grossKobo <= 0) {
    throw new Error('grossKobo must be a positive integer');
  }

  const vatKobo = Math.round(grossKobo * VAT_RATE);
  const whtKobo = Math.round(grossKobo * WHT_RATE);
  const netKobo = grossKobo - vatKobo - whtKobo;

  return { grossKobo, vatKobo, whtKobo, netKobo, currency };
}

/**
 * Convert an amount from a foreign currency to NGN kobo using live rates
 * stored in the `cmgt_fx_rates` D1 table. Falls back to DEFAULT_FX_TO_NGN if no row.
 *
 * @param amountSmallestUnit  Amount in the smallest unit of `fromCurrency`.
 * @param fromCurrency        Source currency code.
 * @param db                  D1 database binding.
 */
export async function convertToNGNKobo(
  amountSmallestUnit: number,
  fromCurrency: SupportedCurrency,
  db: D1Database,
): Promise<number> {
  if (fromCurrency === 'NGN') return amountSmallestUnit;

  const row = await db
    .prepare('SELECT rate_to_ngn FROM cmgt_fx_rates WHERE currency = ?')
    .bind(fromCurrency)
    .first<{ rate_to_ngn: number }>();

  const rate = row?.rate_to_ngn ?? DEFAULT_FX_TO_NGN[fromCurrency] ?? 1;
  return Math.round(amountSmallestUnit * rate);
}

/**
 * Validate that a currency string is one we support.
 */
export function isSupportedCurrency(c: string): c is SupportedCurrency {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(c);
}

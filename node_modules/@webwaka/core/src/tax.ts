export interface TaxConfig {
  vatRate: number;
  vatRegistered: boolean;
  exemptCategories: string[];
}

export interface TaxLineItem {
  category: string;
  amountKobo: number;
}

export interface TaxResult {
  subtotalKobo: number;
  vatKobo: number;
  totalKobo: number;
  vatBreakdown: { category: string; vatKobo: number }[];
}

export class TaxEngine {
  private config: TaxConfig;

  constructor(config: TaxConfig) {
    this.config = config;
  }

  compute(items: TaxLineItem[]): TaxResult {
    let subtotalKobo = 0;
    let vatKobo = 0;
    const vatBreakdown: { category: string; vatKobo: number }[] = [];

    for (const item of items) {
      subtotalKobo += item.amountKobo;

      const isExempt =
        !this.config.vatRegistered ||
        this.config.exemptCategories.includes(item.category);

      const itemVat = isExempt
        ? 0
        : Math.round(item.amountKobo * this.config.vatRate);

      vatKobo += itemVat;
      vatBreakdown.push({ category: item.category, vatKobo: itemVat });
    }

    return {
      subtotalKobo,
      vatKobo,
      totalKobo: subtotalKobo + vatKobo,
      vatBreakdown,
    };
  }
}

export function createTaxEngine(config: TaxConfig): TaxEngine {
  return new TaxEngine(config);
}

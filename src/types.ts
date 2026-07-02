/** Lightweight price-series type shared by factor / attribution / backtest. */
export interface PriceSeries {
  symbol: string;
  closes: number[];
  dates?: Array<number | Date>;
}

export function priceReturns(ps: PriceSeries): number[] {
  const c = ps.closes;
  const out: number[] = [];
  for (let i = 1; i < c.length; i++) out.push(c[i] / c[i - 1] - 1);
  return out;
}

export function priceLast(ps: PriceSeries): number {
  return ps.closes[ps.closes.length - 1];
}

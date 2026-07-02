/** Fixed-coupon bond analytics: price/YTM, duration, convexity, DV01. */
export interface Bond {
  face: number;
  couponRate: number; // annual, fraction of face
  yearsToMaturity: number;
  freq: number; // coupon payments per year
}

export function bond(
  face = 100,
  couponRate = 0.05,
  yearsToMaturity = 5,
  freq = 2
): Bond {
  return { face, couponRate, yearsToMaturity, freq };
}

/** [time_in_years, cashflow] pairs; final period includes face. */
export function cashflows(b: Bond): Array<[number, number]> {
  const n = Math.max(Math.round(b.yearsToMaturity * b.freq), 1);
  const c = (b.face * b.couponRate) / b.freq;
  const out: Array<[number, number]> = [];
  for (let i = 1; i <= n; i++) out.push([i / b.freq, c + (i === n ? b.face : 0)]);
  return out;
}

export function priceFromYield(b: Bond, ytm: number): number {
  const m = b.freq;
  let pv = 0;
  for (const [t, cf] of cashflows(b)) pv += cf / (1 + ytm / m) ** (t * m);
  return pv;
}

/** Solve YTM by bisection; returns null if the price is outside the bracket. */
export function yieldToMaturity(b: Bond, price: number, lo = -0.9, hi = 5.0, tol = 1e-8): number | null {
  let fLo = priceFromYield(b, lo) - price;
  const fHi = priceFromYield(b, hi) - price;
  if (fLo * fHi > 0) return null;
  let a = lo;
  let bb = hi;
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (a + bb);
    const fm = priceFromYield(b, mid) - price;
    if (Math.abs(fm) < tol) return mid;
    if (fLo * fm < 0) bb = mid;
    else {
      a = mid;
      fLo = fm;
    }
  }
  return 0.5 * (a + bb);
}

export interface BondRisk {
  price: number;
  ytm: number;
  macaulayDuration: number;
  modifiedDuration: number;
  convexity: number;
  dv01: number; // dollar value of 1bp, per unit face
}

export function analyze(b: Bond, ytm: number): BondRisk {
  const m = b.freq;
  const price = priceFromYield(b, ytm);
  let weightedT = 0;
  let convex = 0;
  for (const [t, cf] of cashflows(b)) {
    const disc = cf / (1 + ytm / m) ** (t * m);
    weightedT += t * disc;
    convex += (t * (t + 1 / m) * cf) / (1 + ytm / m) ** (t * m + 2);
  }
  const macaulay = price ? weightedT / price : 0;
  const modified = macaulay / (1 + ytm / m);
  const convexity = price ? convex / price : 0;
  const dv01 = modified * price * 1e-4;
  return { price, ytm, macaulayDuration: macaulay, modifiedDuration: modified, convexity, dv01 };
}

/** dP ≈ -ModDur*P*dy + 0.5*Convexity*P*dy^2. */
export function priceChangeEstimate(r: BondRisk, dy: number): number {
  return -r.modifiedDuration * r.price * dy + 0.5 * r.convexity * r.price * dy * dy;
}

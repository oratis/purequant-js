/** Black-Scholes-Merton European option pricing, Greeks and implied vol. */
export type OptionRight = "call" | "put";

/** Error function via Abramowitz & Stegun 7.1.26 (|err| < 1.5e-7). */
function erf(x: number): number {
  const s = Math.sign(x);
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y =
    1 -
    (((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t) *
      Math.exp(-ax * ax);
  return s * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function normPdf(x: number): number {
  return Math.exp((-x * x) / 2) / Math.sqrt(2 * Math.PI);
}

function d1d2(spot: number, strike: number, t: number, r: number, sigma: number, q = 0) {
  const vt = sigma * Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + (r - q + (sigma * sigma) / 2) * t) / vt;
  const d2 = d1 - vt;
  return { d1, d2 };
}

export function bsmPrice(
  spot: number,
  strike: number,
  t: number,
  r: number,
  sigma: number,
  right: OptionRight,
  q = 0
): number {
  if (t <= 0 || sigma <= 0) {
    const intrinsic = right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
    return intrinsic;
  }
  const { d1, d2 } = d1d2(spot, strike, t, r, sigma, q);
  const df = Math.exp(-r * t);
  const dq = Math.exp(-q * t);
  if (right === "call") return spot * dq * normCdf(d1) - strike * df * normCdf(d2);
  return strike * df * normCdf(-d2) - spot * dq * normCdf(-d1);
}

export interface Greeks {
  delta: number;
  gamma: number;
  vega: number; // per 1.00 (100%) change in vol
  theta: number; // per year
  rho: number;
}

export function bsmGreeks(
  spot: number,
  strike: number,
  t: number,
  r: number,
  sigma: number,
  right: OptionRight,
  q = 0
): Greeks {
  const { d1, d2 } = d1d2(spot, strike, t, r, sigma, q);
  const df = Math.exp(-r * t);
  const dq = Math.exp(-q * t);
  const pdf = normPdf(d1);
  const gamma = (dq * pdf) / (spot * sigma * Math.sqrt(t));
  const vega = spot * dq * pdf * Math.sqrt(t);
  if (right === "call") {
    const delta = dq * normCdf(d1);
    const theta = -(spot * dq * pdf * sigma) / (2 * Math.sqrt(t)) - r * strike * df * normCdf(d2) + q * spot * dq * normCdf(d1);
    const rho = strike * t * df * normCdf(d2);
    return { delta, gamma, vega, theta, rho };
  }
  const delta = dq * (normCdf(d1) - 1);
  const theta = -(spot * dq * pdf * sigma) / (2 * Math.sqrt(t)) + r * strike * df * normCdf(-d2) - q * spot * dq * normCdf(-d1);
  const rho = -strike * t * df * normCdf(-d2);
  return { delta, gamma, vega, theta, rho };
}

/** Implied volatility by bisection; returns null if the price is unattainable. */
export function impliedVol(
  price: number,
  spot: number,
  strike: number,
  t: number,
  r: number,
  right: OptionRight,
  q = 0
): number | null {
  const intrinsic = right === "call" ? Math.max(spot - strike, 0) : Math.max(strike - spot, 0);
  if (price < intrinsic - 1e-9 || t <= 0) return null;
  let lo = 1e-4;
  let hi = 5.0;
  const f = (s: number) => bsmPrice(spot, strike, t, r, s, right, q) - price;
  if (f(lo) * f(hi) > 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if (Math.abs(fm) < 1e-8) return mid;
    if (f(lo) * fm < 0) hi = mid;
    else lo = mid;
  }
  return 0.5 * (lo + hi);
}

/** Year fraction (ACT/365) between two millisecond timestamps or Date objects. */
export function yearFraction(expiry: Date | number, asOf: Date | number): number {
  const e = expiry instanceof Date ? expiry.getTime() : expiry;
  const a = asOf instanceof Date ? asOf.getTime() : asOf;
  return Math.max((e - a) / (365 * 24 * 3600 * 1000), 0);
}

/** Hedging & statistical-arbitrage: hedge ratios, effectiveness, pairs/cointegration. */
import { annualizeVol, correlation, covariance, mean, ols, std, variance } from "./stats.js";
import type { PriceSeries } from "./types.js";

/** Optimal hedge ratio h* = Cov(asset, hedge) / Var(hedge). */
export function minVarianceHedgeRatio(assetReturns: number[], hedgeReturns: number[]): number {
  const n = Math.min(assetReturns.length, hedgeReturns.length);
  const a = assetReturns.slice(-n);
  const h = hedgeReturns.slice(-n);
  const vh = variance(h);
  if (vh === 0) return 0;
  return covariance(a, h) / vh;
}

export interface HedgeEffectiveness {
  volUnhedged: number;
  volHedged: number;
  varianceReduction: number;
  caveat: string;
}

/**
 * Variance reduction from applying a hedge ratio. NOTE: in-sample — it overstates
 * out-of-sample effectiveness; fit the ratio and measure on different windows.
 */
export function hedgeEffectiveness(
  assetReturns: number[],
  hedgeReturns: number[],
  hedgeRatio: number
): HedgeEffectiveness {
  const n = Math.min(assetReturns.length, hedgeReturns.length);
  const a = assetReturns.slice(-n);
  const h = hedgeReturns.slice(-n);
  const hedged = a.map((v, i) => v - hedgeRatio * h[i]);
  const varUnhedged = variance(a);
  const varHedged = variance(hedged);
  const reduction = varUnhedged > 0 ? 1 - varHedged / varUnhedged : 0;
  return {
    volUnhedged: annualizeVol(std(a)),
    volHedged: annualizeVol(std(hedged)),
    varianceReduction: reduction,
    caveat: "in-sample; overstates out-of-sample effectiveness",
  };
}

/** OU mean-reversion half-life from a spread series (null if not mean-reverting). */
export function halfLife(spread: number[]): number | null {
  if (spread.length < 10) return null;
  const y: number[] = [];
  for (let i = 1; i < spread.length; i++) y.push(spread[i] - spread[i - 1]);
  const x = spread.slice(0, -1);
  const res = ols(y, [x], true);
  const b = res.beta[0];
  if (b >= 0) return null;
  return -Math.log(2) / b;
}

/** Cheap ADF-like t-stat of the lagged-level coefficient (more negative = more mean-reverting). */
export function stationarityStat(resid: number[]): number {
  if (resid.length < 10) return 0;
  const y: number[] = [];
  for (let i = 1; i < resid.length; i++) y.push(resid[i] - resid[i - 1]);
  const x = resid.slice(0, -1);
  const res = ols(y, [x], true);
  const rho = res.beta[0];
  const n = y.length;
  const sx = std(x);
  const se = sx > 0 ? std(res.resid) / (sx * Math.sqrt(n)) : 1e-9;
  return se ? rho / se : 0;
}

export interface PairCandidate {
  a: string;
  b: string;
  hedgeRatio: number; // units of b per unit of a (log-price OLS)
  correlation: number;
  spreadZscore: number;
  halfLife: number | null;
  adfLikeStat: number;
}

/** Screen symbol pairs for mean-reverting spread candidates via log-price OLS. */
export function findPairs(
  prices: Record<string, PriceSeries>,
  symbols: string[],
  minCorr = 0.7,
  entryZ = 2.0
): PairCandidate[] {
  const syms = symbols.filter((s) => prices[s] && prices[s].closes.length > 30);
  const out: PairCandidate[] = [];
  for (let i = 0; i < syms.length; i++) {
    for (let j = i + 1; j < syms.length; j++) {
      const sa = syms[i];
      const sb = syms[j];
      const ca = prices[sa].closes.map((x) => Math.log(x));
      const cb = prices[sb].closes.map((x) => Math.log(x));
      const n = Math.min(ca.length, cb.length);
      const la = ca.slice(-n);
      const lb = cb.slice(-n);
      const ra: number[] = [];
      const rb: number[] = [];
      for (let k = 1; k < n; k++) {
        ra.push(la[k] - la[k - 1]);
        rb.push(lb[k] - lb[k - 1]);
      }
      const corr = correlation(ra, rb);
      if (Math.abs(corr) < minCorr) continue;
      const reg = ols(la, [lb], true); // log_a = alpha + beta*log_b
      const beta = reg.beta[0];
      const spread = la.map((v, k) => v - (reg.intercept + beta * lb[k]));
      const sd = std(spread);
      const z = sd > 0 ? (spread[spread.length - 1] - mean(spread)) / sd : 0;
      out.push({
        a: sa,
        b: sb,
        hedgeRatio: beta,
        correlation: corr,
        spreadZscore: z,
        halfLife: halfLife(spread),
        adfLikeStat: stationarityStat(spread),
      });
    }
  }
  // Prioritise: currently stretched (|z| >= entryZ) and mean-reverting.
  out.sort((x, y) => {
    const sx = (Math.abs(x.spreadZscore) >= entryZ ? 1 : 0) * 1e6 - x.adfLikeStat * 100 + Math.abs(x.spreadZscore);
    const sy = (Math.abs(y.spreadZscore) >= entryZ ? 1 : 0) * 1e6 - y.adfLikeStat * 100 + Math.abs(y.spreadZscore);
    return sy - sx;
  });
  return out;
}

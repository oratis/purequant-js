/** Portfolio risk metrics: volatility, VaR/CVaR, drawdown, beta, risk contributions. */
import { dot, matvec } from "./linalg.js";
import { TRADING_DAYS, annualizeVol, covMatrix, covariance, mean, quantile, std, variance } from "./stats.js";

export function annVolatility(returns: number[], periods = TRADING_DAYS): number {
  if (returns.length < 2) return 0;
  return annualizeVol(std(returns), periods);
}

/** Historical VaR as a positive loss fraction at the given confidence. */
export function historicalVar(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const q = quantile(returns, 1 - confidence);
  return Math.max(-q, 0);
}

/** Parametric (normal) VaR as a positive loss fraction. */
export function parametricVar(returns: number[], confidence = 0.95): number {
  if (returns.length < 2) return 0;
  const z = normPpf(1 - confidence);
  const v = mean(returns) + z * std(returns);
  return Math.max(-v, 0);
}

/** Conditional VaR / expected shortfall as a positive loss fraction. */
export function cvar(returns: number[], confidence = 0.95): number {
  if (returns.length === 0) return 0;
  const q = quantile(returns, 1 - confidence);
  const tail = returns.filter((r) => r <= q);
  if (tail.length === 0) return Math.max(-q, 0);
  return Math.max(-mean(tail), 0);
}

/** Max peak-to-trough drawdown of the equity curve implied by a return series. */
export function maxDrawdown(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? (peak - equity) / peak : 0;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

export function currentDrawdown(returns: number[]): number {
  let equity = 1;
  let peak = 1;
  for (const r of returns) {
    equity *= 1 + r;
    if (equity > peak) peak = equity;
  }
  return peak > 0 ? (peak - equity) / peak : 0;
}

export function assetBeta(assetReturns: number[], benchReturns: number[]): number {
  const n = Math.min(assetReturns.length, benchReturns.length);
  const a = assetReturns.slice(-n);
  const b = benchReturns.slice(-n);
  const vb = variance(b);
  if (vb === 0) return 0;
  return covariance(a, b) / vb;
}

export function portfolioBeta(
  weights: Record<string, number>,
  rets: Record<string, number[]>,
  benchReturns: number[]
): number {
  let beta = 0;
  for (const [sym, w] of Object.entries(weights)) {
    if (rets[sym]) beta += w * assetBeta(rets[sym], benchReturns);
  }
  return beta;
}

export interface RiskContribution {
  totalVol: number; // annualised portfolio volatility
  contributions: Record<string, number>; // symbol -> share of risk (sums ~1)
}

/** Euler/component risk contributions: RC_i = w_i * (Cov w)_i / sigma_p^2. */
export function riskContributions(
  weights: Record<string, number>,
  rets: Record<string, number[]>
): RiskContribution {
  const syms = Object.keys(weights).filter((s) => rets[s] && weights[s] !== 0);
  if (syms.length === 0) return { totalVol: 0, contributions: {} };
  const n = Math.min(...syms.map((s) => rets[s].length));
  const series = syms.map((s) => rets[s].slice(-n));
  const cov = covMatrix(series);
  const w = syms.map((s) => weights[s]);
  const covW = matvec(cov, w);
  const varP = dot(w, covW);
  if (varP <= 0) return { totalVol: 0, contributions: Object.fromEntries(syms.map((s) => [s, 0])) };
  const contributions: Record<string, number> = {};
  syms.forEach((s, i) => (contributions[s] = (w[i] * covW[i]) / varP));
  return { totalVol: annualizeVol(Math.sqrt(varP)), contributions };
}

// --- normal inverse CDF (Acklam's approximation) for parametric VaR ---
function normPpf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.6968302866538, 220.946098424521, -275.928510446969, 138.357751867269, -30.6647980661472, 2.50662827745924];
  const b = [-54.4760987982241, 161.585836858041, -155.698979859887, 66.8013118877197, -13.2806815528857];
  const c = [-0.00778489400243029, -0.322396458041136, -2.40075827716184, -2.54973253934373, 4.37466414146497, 2.93816398269878];
  const d = [0.00778469570904146, 0.32246712907004, 2.445134137143, 3.75440866190742];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pl) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

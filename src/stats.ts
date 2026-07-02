/** Descriptive statistics, OLS and covariance helpers. Pure, no dependencies. */
import { Matrix, Vector, makePsd, matvec, solve, transpose } from "./linalg.js";

export const TRADING_DAYS = 252;

export function mean(x: Vector): number {
  if (x.length === 0) throw new Error("mean of empty sequence");
  return x.reduce((a, b) => a + b, 0) / x.length;
}

export function variance(x: Vector, ddof = 1): number {
  const n = x.length;
  if (n - ddof <= 0) throw new Error("not enough data for variance");
  const mu = mean(x);
  return x.reduce((a, v) => a + (v - mu) ** 2, 0) / (n - ddof);
}

export function std(x: Vector, ddof = 1): number {
  return Math.sqrt(variance(x, ddof));
}

export function covariance(x: Vector, y: Vector, ddof = 1): number {
  if (x.length !== y.length) throw new Error("covariance length mismatch");
  const n = x.length;
  if (n - ddof <= 0) throw new Error("not enough data for covariance");
  const mx = mean(x);
  const my = mean(y);
  let s = 0;
  for (let i = 0; i < n; i++) s += (x[i] - mx) * (y[i] - my);
  return s / (n - ddof);
}

export function correlation(x: Vector, y: Vector): number {
  const sx = std(x);
  const sy = std(y);
  if (sx === 0 || sy === 0) return 0;
  return covariance(x, y) / (sx * sy);
}

export function zscore(x: Vector): Vector {
  const mu = mean(x);
  const sd = std(x);
  if (sd === 0) return x.map(() => 0);
  return x.map((v) => (v - mu) / sd);
}

/** Linear-interpolated quantile, q in [0,1]. */
export function quantile(x: Vector, q: number): number {
  if (x.length === 0) throw new Error("quantile of empty sequence");
  const s = [...x].sort((a, b) => a - b);
  if (s.length === 1) return s[0];
  const pos = q * (s.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** Average ranks scaled to [0, 1] (ties share the mean rank). For Rank-IC. */
export function rank(x: Vector): Vector {
  const n = x.length;
  const order = [...Array(n).keys()].sort((a, b) => x[a] - x[b]);
  const ranks = new Array(n).fill(0);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && x[order[j + 1]] === x[order[i]]) j++;
    const avg = (i + j) / 2;
    for (let k = i; k <= j; k++) ranks[order[k]] = avg;
    i = j + 1;
  }
  return n > 1 ? ranks.map((r) => r / (n - 1)) : [0];
}

/** Clip values to the [lower, upper] quantile range. */
export function winsorize(x: Vector, lower = 0.01, upper = 0.99): Vector {
  const lo = quantile(x, lower);
  const hi = quantile(x, upper);
  return x.map((v) => Math.min(Math.max(v, lo), hi));
}

export function covMatrix(series: Matrix, ddof = 1): Matrix {
  const n = series.length;
  const out: Matrix = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      const c = covariance(series[i], series[j], ddof);
      out[i][j] = c;
      out[j][i] = c;
    }
  return out;
}

export function annualizeVol(dailyStd: number, periods = TRADING_DAYS): number {
  return dailyStd * Math.sqrt(periods);
}

export interface OLSResult {
  beta: Vector; // slopes for each regressor
  intercept: number;
  resid: Vector;
  r2: number;
}

/** Ordinary least squares via the normal equations (with a tiny ridge for stability). */
export function ols(y: Vector, x: Matrix, addIntercept = true): OLSResult {
  // x is a list of regressor columns (each same length as y).
  const cols = addIntercept ? [y.map(() => 1), ...x] : [...x];
  const X = transpose(cols); // rows = observations
  const Xt = cols; // already column-major = X^T rows
  const XtX = Xt.map((ci) => Xt.map((cj) => ci.reduce((a, _, k) => a + ci[k] * cj[k], 0)));
  const Xty = Xt.map((ci) => ci.reduce((a, _, k) => a + ci[k] * y[k], 0));
  const coef = solve(makePsd(XtX, 1e-12), Xty);
  const fitted = X.map((row) => row.reduce((a, v, i) => a + v * coef[i], 0));
  const resid = y.map((v, i) => v - fitted[i]);
  const my = mean(y);
  const ssTot = y.reduce((a, v) => a + (v - my) ** 2, 0);
  const ssRes = resid.reduce((a, v) => a + v * v, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const intercept = addIntercept ? coef[0] : 0;
  const beta = addIntercept ? coef.slice(1) : coef;
  return { beta, intercept, resid, r2 };
}

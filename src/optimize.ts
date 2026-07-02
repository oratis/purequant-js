/** Portfolio optimization: minimum-variance and risk-parity weights. */
import { Matrix, dot, matvec, solve } from "./linalg.js";
import { makePsd } from "./linalg.js";

function toWeights(syms: string[], w: number[]): Record<string, number> {
  return Object.fromEntries(syms.map((s, i) => [s, w[i]]));
}

/** Closed-form global minimum-variance weights: w = Σ⁻¹1 / (1ᵀΣ⁻¹1). */
export function minVariance(cov: Matrix, symbols: string[]): Record<string, number> {
  const n = cov.length;
  const ones = new Array(n).fill(1);
  const z = solve(makePsd(cov, 1e-10), ones);
  const s = z.reduce((a, b) => a + b, 0);
  const w = z.map((v) => v / s);
  return toWeights(symbols, w);
}

/**
 * Risk-parity weights via a fixed-point iteration so each asset contributes an
 * equal (or ``budgets``-weighted) share of portfolio variance.
 */
export function riskParity(
  cov: Matrix,
  symbols: string[],
  budgets?: number[],
  iters = 2000
): Record<string, number> {
  const n = cov.length;
  const b = budgets ?? new Array(n).fill(1 / n);
  const bsum = b.reduce((a, x) => a + x, 0);
  const bn = b.map((x) => x / bsum);
  let w = new Array(n).fill(1 / n);
  // Multiplicative update: scale each weight toward its target risk share.
  // RC_share_i = w_i (Σw)_i / (wᵀΣw); nudge w_i by sqrt(target/actual).
  for (let k = 0; k < iters; k++) {
    const sw = matvec(cov, w);
    const varP = Math.max(dot(w, sw), 1e-18);
    let maxErr = 0;
    const wNew = w.map((wi, i) => {
      const share = Math.max((wi * sw[i]) / varP, 1e-15);
      maxErr = Math.max(maxErr, Math.abs(share - bn[i]));
      return wi * Math.sqrt(bn[i] / share);
    });
    const s = wNew.reduce((a, x) => a + x, 0);
    w = wNew.map((x) => x / s);
    if (maxErr < 1e-10) break;
  }
  return toWeights(symbols, w);
}

/** Portfolio variance wᵀΣw for a weight vector. */
export function portfolioVariance(cov: Matrix, w: number[]): number {
  return dot(w, matvec(cov, w));
}

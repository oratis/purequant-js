/** Multi-factor equity scoring: cross-sectional standardisation, sector-neutralise, IC. */
import { correlation, mean, rank, winsorize, zscore } from "./stats.js";
import { annualizeVol, std } from "./stats.js";
import type { PriceSeries } from "./types.js";

/** Default factor weights for the composite score (higher raw value = better). */
export const DEFAULT_WEIGHTS: Record<string, number> = {
  value_ey: 1.0, // earnings yield = 1/PE
  value_bp: 0.7, // book-to-price = 1/PB
  quality_roe: 1.0,
  quality_lowlev: 0.5, // -debt/equity
  growth: 0.8,
  momentum: 1.0, // 12-1 price momentum
  lowvol: 0.6, // -realised vol
};

type Panel = Record<string, Record<string, number>>;

export function computeRawFactors(
  symbols: string[],
  fundamentals: Record<string, Record<string, number>>,
  prices: Record<string, PriceSeries>,
  momLookback = 252,
  momSkip = 21,
  volWindow = 63
): Panel {
  const out: Panel = {};
  for (const s of symbols) {
    const f = fundamentals[s] ?? {};
    const row: Record<string, number> = {};
    const pe = f.pe;
    const pb = f.pb;
    row.value_ey = pe && pe > 0 ? 1 / pe : 0;
    row.value_bp = pb && pb > 0 ? 1 / pb : 0;
    row.quality_roe = f.roe ?? 0;
    row.quality_lowlev = -(f.debt_to_equity ?? 0);
    row.growth = f.earnings_growth ?? 0;
    const ps = prices[s];
    const c = ps?.closes ?? [];
    row.momentum = c.length > momLookback ? c[c.length - momSkip] / c[c.length - momLookback] - 1 : 0;
    if (c.length > volWindow) {
      const rets: number[] = [];
      for (let i = c.length - volWindow; i < c.length; i++) if (i >= 1) rets.push(c[i] / c[i - 1] - 1);
      row.lowvol = rets.length > 1 ? -annualizeVol(std(rets)) : 0;
    } else row.lowvol = 0;
    out[s] = row;
  }
  return out;
}

function standardizeCrossSection(panel: Panel, factor: string, winsor = true): Record<string, number> {
  const syms = Object.keys(panel);
  let vals = syms.map((s) => panel[s][factor] ?? 0);
  // z-score needs cross-sectional spread; 0/1 names -> neutral zeros.
  if (vals.length < 2) return Object.fromEntries(syms.map((s) => [s, 0]));
  if (winsor && vals.length >= 5) vals = winsorize(vals);
  const z = zscore(vals);
  return Object.fromEntries(syms.map((s, i) => [s, z[i]]));
}

function neutralize(zmap: Record<string, number>, groups: Record<string, string>): Record<string, number> {
  const byGroup: Record<string, string[]> = {};
  for (const [s, g] of Object.entries(groups)) (byGroup[g] ??= []).push(s);
  const out: Record<string, number> = {};
  for (const members of Object.values(byGroup)) {
    const vals = members.filter((s) => s in zmap).map((s) => zmap[s]);
    const gmean = vals.length ? mean(vals) : 0;
    for (const s of members) if (s in zmap) out[s] = zmap[s] - gmean;
  }
  const syms = Object.keys(out);
  const z = syms.length > 1 ? zscore(syms.map((s) => out[s])) : syms.map(() => 0);
  return Object.fromEntries(syms.map((s, i) => [s, z[i]]));
}

export interface ScoredStock {
  symbol: string;
  score: number;
  rank: number;
  factorScores: Record<string, number>;
}

export interface FactorModelOptions {
  weights?: Record<string, number>;
  neutralizeBySector?: boolean;
}

/** Score a cross-section of stocks by a weighted composite of standardised factors. */
export function score(
  symbols: string[],
  fundamentals: Record<string, Record<string, number>>,
  prices: Record<string, PriceSeries>,
  sectors?: Record<string, string>,
  options: FactorModelOptions = {}
): ScoredStock[] {
  const weights = options.weights ?? DEFAULT_WEIGHTS;
  const neutralizeBySector = options.neutralizeBySector ?? true;
  const panel = computeRawFactors(symbols, fundamentals, prices);
  const syms = Object.keys(panel);
  const zByFactor: Record<string, Record<string, number>> = {};
  for (const factor of Object.keys(weights)) {
    let zmap = standardizeCrossSection(panel, factor);
    if (neutralizeBySector && sectors) {
      const groups = Object.fromEntries(syms.map((s) => [s, sectors[s] ?? "Unknown"]));
      zmap = neutralize(zmap, groups);
    }
    zByFactor[factor] = zmap;
  }
  const results: ScoredStock[] = syms.map((s) => {
    const fs: Record<string, number> = {};
    let sc = 0;
    for (const f of Object.keys(weights)) {
      fs[f] = zByFactor[f][s] ?? 0;
      sc += weights[f] * fs[f];
    }
    return { symbol: s, score: sc, rank: 0, factorScores: fs };
  });
  results.sort((a, b) => b.score - a.score);
  results.forEach((r, i) => (r.rank = i + 1));
  return results;
}

export function select(scored: ScoredStock[], topN?: number, topQuantile?: number): ScoredStock[] {
  if (topN != null) return scored.slice(0, topN);
  if (topQuantile != null) return scored.slice(0, Math.max(1, Math.floor(scored.length * topQuantile)));
  return scored;
}

export interface ICResult {
  ic: number;
  rankIc: number;
  n: number;
}

/** Cross-sectional IC between a factor snapshot and forward returns. */
export function informationCoefficient(
  factorValues: Record<string, number>,
  forwardReturns: Record<string, number>
): ICResult {
  const syms = Object.keys(factorValues).filter((s) => s in forwardReturns);
  if (syms.length < 3) return { ic: 0, rankIc: 0, n: syms.length };
  const fv = syms.map((s) => factorValues[s]);
  const fr = syms.map((s) => forwardReturns[s]);
  return { ic: correlation(fv, fr), rankIc: correlation(rank(fv), rank(fr)), n: syms.length };
}

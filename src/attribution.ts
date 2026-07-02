/** Return attribution: factor (regression) and Brinson sector attribution. */
import { TRADING_DAYS, mean, ols } from "./stats.js";
import type { PriceSeries } from "./types.js";

function longShortSpread(rets: Record<string, number[]>, ranking: string[], frac = 0.34): number[] {
  const avail = ranking.filter((s) => s in rets);
  if (avail.length < 3) return [];
  const k = Math.max(1, Math.floor(avail.length * frac));
  const longs = avail.slice(0, k);
  const shorts = avail.slice(-k);
  const n = Math.min(
    Math.min(...longs.map((s) => rets[s].length)),
    Math.min(...shorts.map((s) => rets[s].length))
  );
  const out: number[] = [];
  for (let t = 0; t < n; t++) {
    const lr = longs.reduce((a, s) => a + rets[s][t], 0) / longs.length;
    const sr = shorts.reduce((a, s) => a + rets[s][t], 0) / shorts.length;
    out.push(lr - sr);
  }
  return out;
}

/** Build market / value / momentum style-factor return series from the universe. */
export function buildStyleFactorReturns(
  rets: Record<string, number[]>,
  fundamentals: Record<string, Record<string, number>>,
  prices: Record<string, PriceSeries>,
  benchReturns: number[],
  momLookback = 126
): Record<string, number[]> {
  const syms = Object.keys(rets).filter((s) => s in fundamentals);
  const factors: Record<string, number[]> = {};
  if (benchReturns.length) factors.market = [...benchReturns];
  const ey = Object.fromEntries(syms.map((s) => [s, fundamentals[s].pe ? 1 / fundamentals[s].pe : 0]));
  const valueRank = [...syms].sort((a, b) => ey[b] - ey[a]);
  const vs = longShortSpread(rets, valueRank);
  if (vs.length) factors.value = vs;
  const mom = Object.fromEntries(
    syms.map((s) => {
      const c = prices[s]?.closes ?? [];
      return [s, c.length > momLookback ? c[c.length - 1] / c[c.length - momLookback] - 1 : 0];
    })
  );
  const momRank = [...syms].sort((a, b) => mom[b] - mom[a]);
  const ms = longShortSpread(rets, momRank);
  if (ms.length) factors.momentum = ms;
  return factors;
}

export interface FactorAttribution {
  exposures: Record<string, number>;
  contributions: Record<string, number>; // annualised
  alphaAnnual: number;
  r2: number;
}

/** Decompose a portfolio return series into factor exposures + alpha via OLS. */
export function factorAttribution(
  portReturns: number[],
  factorReturns: Record<string, number[]>
): FactorAttribution {
  const names = Object.keys(factorReturns).filter((k) => factorReturns[k].length);
  const n = Math.min(portReturns.length, ...names.map((k) => factorReturns[k].length));
  if (n < 5 || names.length === 0) return { exposures: {}, contributions: {}, alphaAnnual: 0, r2: 0 };
  const y = portReturns.slice(-n);
  const cols = names.map((k) => factorReturns[k].slice(-n));
  const res = ols(y, cols, true);
  const exposures: Record<string, number> = {};
  const contributions: Record<string, number> = {};
  names.forEach((nm, i) => {
    exposures[nm] = res.beta[i];
    contributions[nm] = res.beta[i] * mean(cols[i]) * TRADING_DAYS;
  });
  return { exposures, contributions, alphaAnnual: res.intercept * TRADING_DAYS, r2: res.r2 };
}

export interface BrinsonResult {
  allocation: Record<string, number>;
  selection: Record<string, number>;
  interaction: Record<string, number>;
  totalActive: number;
  allocationTotal: number;
  selectionTotal: number;
  interactionTotal: number;
}

/** Brinson-Hood-Beebower allocation / selection / interaction attribution by sector. */
export function brinson(
  portWeights: Record<string, number>,
  portSectorReturns: Record<string, number>,
  benchWeights: Record<string, number>,
  benchSectorReturns: Record<string, number>
): BrinsonResult {
  const sectors = new Set([...Object.keys(portWeights), ...Object.keys(benchWeights)]);
  let rbTotal = 0;
  let rpTotal = 0;
  for (const s of sectors) {
    rbTotal += (benchWeights[s] ?? 0) * (benchSectorReturns[s] ?? 0);
    rpTotal += (portWeights[s] ?? 0) * (portSectorReturns[s] ?? 0);
  }
  const allocation: Record<string, number> = {};
  const selection: Record<string, number> = {};
  const interaction: Record<string, number> = {};
  for (const s of sectors) {
    const wp = portWeights[s] ?? 0;
    const wb = benchWeights[s] ?? 0;
    const rp = portSectorReturns[s] ?? 0;
    const rb = benchSectorReturns[s] ?? 0;
    allocation[s] = (wp - wb) * (rb - rbTotal);
    selection[s] = wb * (rp - rb);
    interaction[s] = (wp - wb) * (rp - rb);
  }
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return {
    allocation,
    selection,
    interaction,
    totalActive: rpTotal - rbTotal,
    allocationTotal: sum(allocation),
    selectionTotal: sum(selection),
    interactionTotal: sum(interaction),
  };
}

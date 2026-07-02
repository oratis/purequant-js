/** Lightweight backtests: performance stats, rebalanced fixed-weight, momentum. */
import { TRADING_DAYS, annualizeVol, mean, std } from "./stats.js";
import type { PriceSeries } from "./types.js";

export interface PerfStats {
  totalReturn: number;
  cagr: number;
  annVol: number;
  sharpe: number;
  maxDrawdown: number;
  calmar: number;
  nDays: number;
}

export function performanceStats(returns: number[], rfDaily = 0): PerfStats {
  if (returns.length === 0)
    return { totalReturn: 0, cagr: 0, annVol: 0, sharpe: 0, maxDrawdown: 0, calmar: 0, nDays: 0 };
  let equity = 1;
  let peak = 1;
  let mdd = 0;
  for (const r of returns) {
    equity *= 1 + r;
    peak = Math.max(peak, equity);
    mdd = Math.max(mdd, (peak - equity) / peak);
  }
  const n = returns.length;
  const total = equity - 1;
  const cagr = n > 0 ? equity ** (TRADING_DAYS / n) - 1 : 0;
  const sd = n > 1 ? std(returns) : 0;
  const vol = n > 1 ? annualizeVol(sd) : 0;
  const excess = mean(returns.map((r) => r - rfDaily));
  const sharpe = n > 1 && sd > 0 ? (excess / sd) * Math.sqrt(TRADING_DAYS) : 0;
  const calmar = mdd > 0 ? cagr / mdd : 0;
  return { totalReturn: total, cagr, annVol: vol, sharpe, maxDrawdown: mdd, calmar, nDays: n };
}

export interface BacktestResult {
  returns: number[];
  equityCurve: number[];
  stats: PerfStats;
  turnover: number;
  nRebalances: number;
}

/** Backtest fixed target weights, rebalanced every N days, with proportional costs. */
export function backtestRebalanced(
  weights: Record<string, number>,
  rets: Record<string, number[]>,
  rebalanceEvery = 21,
  costBps = 5.0
): BacktestResult {
  const syms = Object.keys(weights).filter((s) => rets[s] && weights[s] !== 0);
  if (syms.length === 0)
    return { returns: [], equityCurve: [1], stats: performanceStats([]), turnover: 0, nRebalances: 0 };
  const n = Math.min(...syms.map((s) => rets[s].length));
  const target: Record<string, number> = Object.fromEntries(syms.map((s) => [s, weights[s]]));
  const wsum = syms.reduce((a, s) => a + target[s], 0);
  let w: Record<string, number> = { ...target };
  const portRets: number[] = [];
  const equity = [1];
  let totalTurnover = 0;
  let nReb = 0;
  const cost = costBps / 10000;
  for (let t = 0; t < n; t++) {
    let dayRet = syms.reduce((a, s) => a + w[s] * rets[s][t], 0);
    const newW: Record<string, number> = {};
    for (const s of syms) newW[s] = w[s] * (1 + rets[s][t]);
    const gross = Object.values(newW).reduce((a, b) => a + b, 0);
    if (gross !== 0) for (const s of syms) newW[s] = (newW[s] / gross) * wsum;
    w = newW;
    if ((t + 1) % rebalanceEvery === 0) {
      const turn = syms.reduce((a, s) => a + Math.abs(target[s] - w[s]), 0);
      totalTurnover += turn;
      dayRet -= turn * cost;
      w = { ...target };
      nReb++;
    }
    portRets.push(dayRet);
    equity.push(equity[equity.length - 1] * (1 + dayRet));
  }
  return { returns: portRets, equityCurve: equity, stats: performanceStats(portRets), turnover: totalTurnover, nRebalances: nReb };
}

/**
 * Cross-sectional momentum: every `rebalanceEvery` days rank by past `lookback`-day
 * return (skipping the most recent `skip` days), hold the top `topN` equally. Uses
 * only past data at each decision point.
 */
export function backtestMomentum(
  prices: Record<string, PriceSeries>,
  symbols: string[],
  lookback = 126,
  skip = 21,
  topN = 3,
  rebalanceEvery = 21,
  costBps = 5.0,
  warmup?: number
): BacktestResult {
  const syms = symbols.filter((s) => prices[s] && prices[s].closes.length > lookback + 2);
  if (syms.length === 0)
    return { returns: [], equityCurve: [1], stats: performanceStats([]), turnover: 0, nRebalances: 0 };
  const n = Math.min(...syms.map((s) => prices[s].closes.length));
  const closes: Record<string, number[]> = Object.fromEntries(syms.map((s) => [s, prices[s].closes.slice(-n)]));
  const start = warmup ?? lookback + skip + 1;
  const portRets: number[] = [];
  const equity = [1];
  let held: string[] = [];
  let totalTurnover = 0;
  let nReb = 0;
  const cost = costBps / 10000;
  for (let t = start; t < n; t++) {
    let dayRet = held.length
      ? held.reduce((a, s) => a + (closes[s][t] / closes[s][t - 1] - 1), 0) / held.length
      : 0;
    if ((t - start) % rebalanceEvery === 0) {
      const scores = syms.map((s) => [s, closes[s][t - 1 - skip] / closes[s][t - 1 - lookback] - 1] as [string, number]);
      scores.sort((a, b) => b[1] - a[1]);
      const newHeld = scores.slice(0, topN).map(([s]) => s);
      const symDiff = new Set([...newHeld.filter((s) => !held.includes(s)), ...held.filter((s) => !newHeld.includes(s))]);
      const turn = symDiff.size / Math.max(topN, 1);
      totalTurnover += turn;
      dayRet -= turn * cost;
      held = newHeld;
      nReb++;
    }
    portRets.push(dayRet);
    equity.push(equity[equity.length - 1] * (1 + dayRet));
  }
  return { returns: portRets, equityCurve: equity, stats: performanceStats(portRets), turnover: totalTurnover, nRebalances: nReb };
}

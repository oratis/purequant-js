/**
 * purequant — a zero-dependency quantitative-finance toolkit in pure TypeScript.
 *
 * No numpy-equivalent, no math libraries — everything runs on plain arrays and
 * the JS standard library. Risk (VaR/CVaR/beta/Euler contributions), Black-Scholes
 * + Greeks, bond duration, futures carry, min-variance & risk-parity optimization,
 * pairs/cointegration hedging, factor scoring + IC, factor & Brinson attribution,
 * and momentum/rebalanced backtests.
 */
export * as linalg from "./linalg.js";
export * as stats from "./stats.js";
export * as types from "./types.js";
export * as risk from "./risk.js";
export * as derivatives from "./derivatives.js";
export * as bonds from "./bonds.js";
export * as futures from "./futures.js";
export * as optimize from "./optimize.js";
export * as hedge from "./hedge.js";
export * as factor from "./factor.js";
export * as attribution from "./attribution.js";
export * as backtest from "./backtest.js";

export type { Vector, Matrix } from "./linalg.js";
export type { OLSResult } from "./stats.js";
export type { PriceSeries } from "./types.js";
export type { RiskContribution } from "./risk.js";
export type { OptionRight, Greeks } from "./derivatives.js";
export type { Bond, BondRisk } from "./bonds.js";
export type { BasisAnalysis, IndexHedge } from "./futures.js";
export type { HedgeEffectiveness, PairCandidate } from "./hedge.js";
export type { ScoredStock, ICResult } from "./factor.js";
export type { FactorAttribution, BrinsonResult } from "./attribution.js";
export type { PerfStats, BacktestResult } from "./backtest.js";

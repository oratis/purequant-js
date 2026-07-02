/**
 * purequant — a zero-dependency quantitative-finance toolkit in pure TypeScript.
 *
 * No numpy, no math libraries — everything runs on plain arrays and the JS
 * standard library. VaR/CVaR, Black-Scholes + Greeks, bond duration, futures
 * carry, min-variance & risk-parity optimization.
 */
export * as linalg from "./linalg.js";
export * as stats from "./stats.js";
export * as risk from "./risk.js";
export * as derivatives from "./derivatives.js";
export * as bonds from "./bonds.js";
export * as futures from "./futures.js";
export * as optimize from "./optimize.js";

export type { Vector, Matrix } from "./linalg.js";
export type { OLSResult } from "./stats.js";
export type { RiskContribution } from "./risk.js";
export type { OptionRight, Greeks } from "./derivatives.js";
export type { Bond, BondRisk } from "./bonds.js";
export type { BasisAnalysis, IndexHedge } from "./futures.js";

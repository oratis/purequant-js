import assert from "node:assert/strict";
import { test } from "node:test";
import { bonds, derivatives as dv, futures, linalg, optimize, risk, stats } from "../src/index.js";

test("linalg: solve & inverse", () => {
  const a = [
    [3, 2],
    [1, 2],
  ];
  const x = linalg.solve(a, [7, 5]);
  assert.ok(Math.abs(x[0] - 1) < 1e-9 && Math.abs(x[1] - 2) < 1e-9);
  const ident = linalg.matmul(a, linalg.inverse(a));
  assert.ok(Math.abs(ident[0][0] - 1) < 1e-9 && Math.abs(ident[0][1]) < 1e-9);
});

test("linalg: singular throws", () => {
  assert.throws(() => linalg.solve([[1, 2], [2, 4]], [1, 2]));
});

test("stats: correlation & OLS", () => {
  assert.ok(Math.abs(stats.correlation([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-9);
  const x = Array.from({ length: 10 }, (_, i) => i);
  const y = x.map((v) => 2 * v + 1);
  const res = stats.ols(y, [x]);
  assert.ok(Math.abs(res.beta[0] - 2) < 1e-4);
  assert.ok(Math.abs(res.intercept - 1) < 1e-4);
  assert.ok(Math.abs(res.r2 - 1) < 1e-6);
});

test("derivatives: put-call parity", () => {
  const [s, k, t, r, sig] = [100, 95, 0.5, 0.03, 0.25];
  const c = dv.bsmPrice(s, k, t, r, sig, "call");
  const p = dv.bsmPrice(s, k, t, r, sig, "put");
  assert.ok(Math.abs(c - p - (s - k * Math.exp(-r * t))) < 1e-2);
});

test("derivatives: greeks bounds & implied vol roundtrip", () => {
  const g = dv.bsmGreeks(100, 100, 1, 0.03, 0.2, "call");
  assert.ok(g.delta > 0 && g.delta < 1 && g.gamma > 0);
  const price = dv.bsmPrice(100, 100, 1, 0.03, 0.3, "call");
  const iv = dv.impliedVol(price, 100, 100, 1, 0.03, "call");
  assert.ok(iv !== null && Math.abs(iv - 0.3) < 1e-3);
});

test("bonds: par pricing, YTM invert, duration", () => {
  const b = bonds.bond(100, 0.05, 10, 2);
  assert.ok(Math.abs(bonds.priceFromYield(b, 0.05) - 100) < 1e-4);
  const price = bonds.priceFromYield(b, 0.035);
  const ytm = bonds.yieldToMaturity(b, price);
  assert.ok(ytm !== null && Math.abs(ytm - 0.035) < 1e-5);
  const rr = bonds.analyze(b, 0.05);
  assert.ok(rr.macaulayDuration > rr.modifiedDuration && rr.convexity > 0);
});

test("futures: carry & hedge sign", () => {
  assert.ok(futures.fairValue(100, 0.05, 1) > 100);
  assert.ok(futures.indexFuturesHedge(1_000_000, 5000, 50).contracts < 0);
});

test("risk: VaR/CVaR order, drawdown, beta, contributions", () => {
  const r = [-0.02, 0.01, 0.03, -0.015, 0.005, -0.04, 0.02, 0.01, -0.01, 0.025];
  assert.ok(risk.cvar(r, 0.95) >= risk.historicalVar(r, 0.95));
  assert.ok(Math.abs(risk.maxDrawdown([-0.5, 0]) - 0.5) < 1e-9);
  assert.ok(Math.abs(risk.assetBeta(r, r) - 1) < 1e-9);
  const rc = risk.riskContributions(
    { A: 0.6, B: 0.4 },
    { A: [0.01, -0.02, 0.03, -0.01, 0.02], B: [-0.01, 0.02, -0.015, 0.01, -0.02] }
  );
  const sum = Object.values(rc.contributions).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test("optimize: min-variance & risk parity", () => {
  const cov = [
    [0.04, 0.006, 0],
    [0.006, 0.09, 0],
    [0, 0, 0.01],
  ];
  const syms = ["A", "B", "C"];
  const w = optimize.minVariance(cov, syms);
  assert.ok(Math.abs(w.A + w.B + w.C - 1) < 1e-4);
  assert.ok(w.C > w.B); // lowest-vol asset gets most weight
  const rp = optimize.riskParity(cov, syms);
  const wl = syms.map((s) => rp[s]);
  const sw = linalg.matvec(cov, wl);
  const rcs = wl.map((wi, i) => wi * sw[i]);
  const tot = rcs.reduce((a, b) => a + b, 0);
  for (const r of rcs) assert.ok(Math.abs(r / tot - 1 / 3) < 0.02);
});

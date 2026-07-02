import assert from "node:assert/strict";
import { test } from "node:test";
import { attribution, backtest, factor, hedge, stats } from "../src/index.js";
import type { PriceSeries } from "../src/index.js";

function trend(n: number, drift: number, amp = 0, seed = 1): number[] {
  const c: number[] = [100];
  for (let i = 1; i < n; i++) c.push(c[i - 1] * (1 + drift + amp * Math.sin((i + seed) / 7)));
  return c;
}

test("stats: rank & winsorize", () => {
  assert.deepEqual(stats.rank([10, 20, 30]), [0, 0.5, 1]);
  const w = stats.winsorize([1, 2, 3, 4, 100], 0.0, 0.8);
  assert.ok(Math.max(...w) < 100);
});

test("hedge: min-variance ratio reduces variance", () => {
  const a = [0.02, -0.01, 0.03, -0.02, 0.01, 0.015, -0.025, 0.02];
  const h = a.map((x) => x * 0.9 + 0.001);
  const hr = hedge.minVarianceHedgeRatio(a, h);
  const eff = hedge.hedgeEffectiveness(a, h, hr);
  assert.ok(eff.varianceReduction > 0);
  assert.equal(typeof eff.caveat, "string");
});

test("hedge: findPairs on cointegrated series", () => {
  const n = 120;
  const base = trend(n, 0.001, 0.004);
  const prices: Record<string, PriceSeries> = {
    A: { symbol: "A", closes: base },
    B: { symbol: "B", closes: base.map((x, i) => x * 1.5 + Math.sin(i / 5)) },
    C: { symbol: "C", closes: trend(n, -0.0005, 0.006, 3) },
  };
  const pairs = hedge.findPairs(prices, ["A", "B", "C"], 0.5);
  assert.ok(pairs.length >= 1);
  assert.ok(Number.isFinite(pairs[0].hedgeRatio));
});

test("factor: scoring ranks and thin universe", () => {
  const prices: Record<string, PriceSeries> = {
    X: { symbol: "X", closes: trend(300, 0.001) },
    Y: { symbol: "Y", closes: trend(300, -0.0005) },
    Z: { symbol: "Z", closes: trend(300, 0.0003) },
  };
  const fund = {
    X: { pe: 10, roe: 0.2, earnings_growth: 0.15 },
    Y: { pe: 40, roe: 0.05, earnings_growth: 0.02 },
    Z: { pe: 20, roe: 0.12, earnings_growth: 0.08 },
  };
  const sectors = { X: "Tech", Y: "Tech", Z: "Fin" };
  const scored = factor.score(["X", "Y", "Z"], fund, prices, sectors);
  assert.equal(scored.length, 3);
  assert.equal(scored[0].rank, 1);
  assert.ok(scored[0].score >= scored[2].score);
  // single-name universe must not throw
  assert.equal(factor.score(["X"], {}, { X: prices.X }, { X: "Tech" }).length, 1);
});

test("factor: information coefficient perfect", () => {
  const fv = { a: 0, b: 1, c: 2, d: 3, e: 4 };
  const fr = { a: 0, b: 0.01, c: 0.02, d: 0.03, e: 0.04 };
  const ic = factor.informationCoefficient(fv, fr);
  assert.ok(Math.abs(ic.ic - 1) < 1e-9 && Math.abs(ic.rankIc - 1) < 1e-9);
});

test("attribution: factor & brinson", () => {
  const port = [0.01, -0.02, 0.03, -0.01, 0.02, 0.0, 0.015, -0.005];
  const facs = { mkt: [0.008, -0.018, 0.025, -0.012, 0.019, 0.001, 0.014, -0.006] };
  const fa = attribution.factorAttribution(port, facs);
  assert.ok("mkt" in fa.exposures);
  const br = attribution.brinson({ Tech: 0.6, Fin: 0.4 }, { Tech: 0.02, Fin: 0.01 }, { Tech: 0.5, Fin: 0.5 }, { Tech: 0.015, Fin: 0.012 });
  assert.ok(Math.abs(br.allocationTotal + br.selectionTotal + br.interactionTotal - br.totalActive) < 1e-9);
});

test("backtest: rebalanced & momentum run", () => {
  const rets = {
    A: Array.from({ length: 260 }, (_, i) => 0.0004 + 0.001 * Math.sin(i / 9)),
    B: Array.from({ length: 260 }, (_, i) => 0.0002 + 0.001 * Math.cos(i / 11)),
  };
  const rb = backtest.backtestRebalanced({ A: 0.5, B: 0.5 }, rets);
  assert.ok(rb.equityCurve.length > 1 && Number.isFinite(rb.stats.sharpe));
  const prices: Record<string, PriceSeries> = {
    A: { symbol: "A", closes: trend(260, 0.001, 0.003) },
    B: { symbol: "B", closes: trend(260, -0.0003, 0.004, 5) },
  };
  const mom = backtest.backtestMomentum(prices, ["A", "B"], 60, 5, 1);
  assert.ok(mom.equityCurve.length > 1);
});

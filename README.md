# purequant

[![CI](https://github.com/oratis/purequant-js/actions/workflows/ci.yml/badge.svg)](https://github.com/oratis/purequant-js/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/purequant.svg)](https://www.npmjs.com/package/purequant)
[![License: CC BY-NC 4.0](https://img.shields.io/badge/License-CC%20BY--NC%204.0-lightgrey.svg)](https://creativecommons.org/licenses/by-nc/4.0/)

**A quantitative-finance toolkit in pure TypeScript — zero runtime dependencies.**

No numpy-equivalent, no math libraries. Everything runs on plain `number[]` and
the JavaScript standard library, ships ESM + type declarations, and works in
Node, Bun, Deno, and modern browsers/edge runtimes.

```bash
npm install purequant
```

## Why

- **Zero runtime dependencies.** Small bundle, `sideEffects: false`, tree-shakeable.
- **Typed.** Full TypeScript types for every input and result.
- **Readable & traceable.** Each formula is a short, documented function.
- **Portable.** Node / Bun / Deno / browser / serverless — anywhere JS runs.

> There is also a pure-Python sibling with the same API surface:
> [`purequant` on PyPI](https://github.com/oratis/purequant).

## Features

| Module | What it does |
|--------|--------------|
| `risk` | annualised volatility, historical & parametric **VaR / CVaR**, drawdown, beta, **Euler risk contributions** |
| `derivatives` | **Black-Scholes-Merton** price, Greeks (Δ Γ Vega Θ ρ), implied vol |
| `bonds` | price ↔ **YTM**, Macaulay & modified **duration**, **convexity**, DV01 |
| `futures` | cost-of-carry fair value, basis, roll yield, index-futures hedge |
| `optimize` | **minimum-variance** & **risk-parity** weights |
| `stats` / `linalg` | cov/corr, OLS, quantiles; Gaussian solve, inverse, PSD ridge |

## Quick start

```ts
import { risk, derivatives as dv, bonds, optimize } from "purequant";

// Value at Risk / CVaR from a daily return series
const returns = [-0.012, 0.008, 0.021, -0.031, 0.004, -0.018, 0.016];
risk.historicalVar(returns, 0.95); // 1-day 95% VaR (positive loss fraction)
risk.cvar(returns, 0.95);          // expected shortfall

// Black-Scholes-Merton price + Greeks
dv.bsmPrice(100, 105, 0.5, 0.03, 0.25, "call");
const g = dv.bsmGreeks(100, 105, 0.5, 0.03, 0.25, "call");
g.delta; g.gamma; g.vega; g.theta;

// Bond analytics
const b = bonds.bond(100, 0.04, 10, 2);         // face, coupon, years, freq
const r = bonds.analyze(b, 0.045);              // ytm
r.modifiedDuration; r.convexity; r.dv01;

// Minimum-variance & risk-parity weights from a covariance matrix
const cov = [[0.04, 0.006, 0], [0.006, 0.09, 0], [0, 0, 0.01]];
optimize.minVariance(cov, ["A", "B", "C"]);
optimize.riskParity(cov, ["A", "B", "C"]);

// Euler risk contributions — which position eats the risk budget?
risk.riskContributions({ A: 0.6, B: 0.4 }, { A: returns, B: returns.map(x => x * 0.8) });
```

## Scope & limitations

- Pure-TS loops are fine for tens–hundreds of assets at daily frequency; for large
  panels use a numerical library.
- Analytics only — computes numbers and *suggestions*, never places trades.
- Options are European BSM; bond day-count is simplified (periodic coupons).

## Development

```bash
npm install
npm run build     # tsc -> dist (ESM + .d.ts)
npm test          # node:test via tsx, zero-config
```

## License

**Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).**
Free for non-commercial use with attribution; contact the author for commercial
use. See [LICENSE](LICENSE). (CC BY-NC is source-available, not OSI open-source.)

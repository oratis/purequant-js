/** Futures analytics: cost-of-carry fair value, basis, roll yield, index hedge. */

/** F = S * exp((r - q + storage - convenience) * t). */
export function fairValue(spot: number, r: number, t: number, q = 0, storage = 0, convenience = 0): number {
  return spot * Math.exp((r - q + storage - convenience) * t);
}

export interface BasisAnalysis {
  spot: number;
  futures: number;
  basis: number;
  basisPct: number;
  annualizedBasis: number;
  structure: "contango" | "backwardation" | "flat";
}

export function basisAnalysis(spot: number, futures: number, t: number): BasisAnalysis {
  const basis = futures - spot;
  const basisPct = spot ? basis / spot : 0;
  const ann = spot > 0 && futures > 0 && t > 0 ? Math.log(futures / spot) / t : 0;
  const structure = basis > 1e-9 ? "contango" : basis < -1e-9 ? "backwardation" : "flat";
  return { spot, futures, basis, basisPct, annualizedBasis: ann, structure };
}

/** Annualised roll yield from rolling a near contract into a far one. */
export function rollYield(nearPrice: number, farPrice: number, daysBetween: number): number {
  if (farPrice <= 0 || daysBetween <= 0) return 0;
  return (nearPrice / farPrice - 1) * (365 / daysBetween);
}

export interface IndexHedge {
  betaDollarGap: number;
  contractMultiplier: number;
  futuresPrice: number;
  contracts: number; // signed; negative = short
  note: string;
}

/** Number of index-futures contracts to neutralise a dollar-beta gap. */
export function indexFuturesHedge(
  betaDollarGap: number,
  futuresPrice: number,
  contractMultiplier: number,
  benchmark = "index"
): IndexHedge {
  const notionalPerContract = futuresPrice * contractMultiplier;
  const contracts = notionalPerContract ? -betaDollarGap / notionalPerContract : 0;
  const direction = contracts < 0 ? "short" : "long";
  return {
    betaDollarGap,
    contractMultiplier,
    futuresPrice,
    contracts,
    note: `${direction} ${Math.abs(contracts).toFixed(1)} ${benchmark} futures to neutralise beta-$ ${betaDollarGap.toFixed(0)}`,
  };
}

export function marginUtilisation(
  contracts: number,
  futuresPrice: number,
  multiplier: number,
  marginRate: number,
  availableMargin: number
): { notional: number; initialMargin: number; utilisation: number; ok: boolean } {
  const notional = Math.abs(contracts) * futuresPrice * multiplier;
  const required = notional * marginRate;
  const util = availableMargin ? required / availableMargin : Infinity;
  return { notional, initialMargin: required, utilisation: util, ok: util <= 1 };
}

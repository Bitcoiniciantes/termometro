import { completedCandles, wilderRsi } from "./analysis";
import { fetchLiveStockMarket, fetchMarket } from "./api";
import type { Candle } from "./types";

export type ReverseRsiMarket = "STOCKS" | "CRIPTO";

export type ReverseRsiTimeframe =
  | "15M"
  | "1H"
  | "4H"
  | "1D"
  | "1W";

export const REVERSE_RSI_CONFIG: Record<
  ReverseRsiMarket,
  { defaultAsset: string; timeframes: ReverseRsiTimeframe[]; targets: number[] }
> = {
  STOCKS: {
    defaultAsset: "NVDA",
    timeframes: ["1H", "4H", "1D", "1W"],
    targets: [10, 16, 20, 25, 30, 40, 50, 60, 70],
  },
  CRIPTO: {
    defaultAsset: "BTC",
    timeframes: ["15M", "1H", "4H", "1D"],
    targets: [16, 20, 25, 30, 40, 50, 60, 70, 80],
  },
};

export const REVERSE_RSI_INTERVAL: Record<ReverseRsiTimeframe, string> = {
  "15M": "15m",
  "1H": "1h",
  "4H": "4h",
  "1D": "1d",
  "1W": "1w",
};

export const REVERSE_RSI_REF_LABEL: Record<ReverseRsiTimeframe, string> = {
  "15M": "Ref. 15 min",
  "1H": "Ref. 1 hora",
  "4H": "Ref. 4 horas",
  "1D": "Ref. diária",
  "1W": "Ref. semanal",
};

export type ReverseRsiProjection = {
  candles: 1 | 3 | 6;
  price: number | null;
};

export type ReverseRsiResult = {
  asset: string;
  market: ReverseRsiMarket;
  timeframe: ReverseRsiTimeframe;
  currentPrice: number;
  referencePrice: number | null;
  currentRsi: number | null;
  targetRsi: number;
  projections: ReverseRsiProjection[];
  averagePrice: number | null;
  percent: number | null;
  updatedAt: number;
};

type WilderState = { avgGain: number; avgLoss: number };

function wilderState(closes: number[], length = 14): WilderState | null {
  if (closes.length < length + 1) return null;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain += Math.max(change, 0);
    avgLoss += Math.max(-change, 0);
  }
  avgGain /= length;
  avgLoss /= length;
  for (let i = length + 1; i < closes.length; i += 1) {
    const change = closes[i] - closes[i - 1];
    avgGain = (avgGain * (length - 1) + Math.max(change, 0)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(-change, 0)) / length;
  }
  return { avgGain, avgLoss };
}

function rsiFromState(state: WilderState): number {
  if (state.avgLoss === 0) return state.avgGain === 0 ? 50 : 100;
  const rs = state.avgGain / state.avgLoss;
  return 100 - 100 / (1 + rs);
}

function applyDelta(state: WilderState, delta: number, length = 14): WilderState {
  const gain = Math.max(delta, 0);
  const loss = Math.max(-delta, 0);
  return {
    avgGain: (state.avgGain * (length - 1) + gain) / length,
    avgLoss: (state.avgLoss * (length - 1) + loss) / length,
  };
}

function priceForTargetAfterCandles(
  basePrice: number,
  state: WilderState,
  targetRsi: number,
  candles: number,
  length = 14,
): number | null {
  if (!Number.isFinite(basePrice) || basePrice <= 0) return null;
  if (targetRsi <= 0 || targetRsi >= 100) return null;

  const simulate = (delta: number) => {
    let s = state;
    let price = basePrice;
    for (let i = 0; i < candles; i += 1) {
      s = applyDelta(s, delta, length);
      price += delta;
    }
    return { price, rsi: rsiFromState(s) };
  };

  const current = simulate(0).rsi;
  if (Math.abs(current - targetRsi) < 1e-6) return basePrice;

  // Search direction: higher delta tends to raise RSI, lower tends to reduce RSI.
  let lo = -basePrice * 0.95;
  let hi = basePrice * 3;
  let loRsi = simulate(lo).rsi;
  let hiRsi = simulate(hi).rsi;

  // Expand bounds if needed (rare extreme states).
  for (let i = 0; i < 20 && !(loRsi <= targetRsi && targetRsi <= hiRsi); i += 1) {
    if (targetRsi < loRsi) {
      hi = lo;
      hiRsi = loRsi;
      lo -= Math.abs(lo || basePrice) * 2 + basePrice;
      lo = Math.max(lo, -basePrice * 0.9999);
      loRsi = simulate(lo).rsi;
    } else {
      lo = hi;
      loRsi = hiRsi;
      hi += Math.abs(hi || basePrice) * 2 + basePrice;
      hiRsi = simulate(hi).rsi;
    }
    if (hi > basePrice * 100) break;
  }

  if (!(loRsi <= targetRsi && targetRsi <= hiRsi)) return null;

  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    const midRsi = simulate(mid).rsi;
    if (Math.abs(midRsi - targetRsi) < 1e-4) return simulate(mid).price;
    if (midRsi < targetRsi) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return simulate((lo + hi) / 2).price;
}

export function computeReverseRsi(params: {
  asset: string;
  market: ReverseRsiMarket;
  timeframe: ReverseRsiTimeframe;
  targetRsi: number;
  closes: number[];
  livePrice: number;
  referencePrice: number | null;
  now?: number;
}): ReverseRsiResult {
  const {
    asset,
    market,
    timeframe,
    targetRsi,
    closes,
    livePrice,
    referencePrice,
    now = Date.now(),
  } = params;

  const series = closes.filter((v) => Number.isFinite(v));
  const provisional = [...series, livePrice].filter((v) => Number.isFinite(v) && v > 0);
  const state = wilderState(provisional, 14);
  const currentRsi = wilderRsi(provisional, 14)?.value ?? null;

  const projectionCounts: Array<1 | 3 | 6> = [1, 3, 6];
  const projections: ReverseRsiProjection[] = projectionCounts.map((candles) => ({
    candles,
    price:
      state && currentRsi !== null
        ? priceForTargetAfterCandles(livePrice, state, targetRsi, candles, 14)
        : null,
  }));

  const validPrices = projections
    .map((p) => p.price)
    .filter((p): p is number => p !== null && Number.isFinite(p) && p > 0);
  const averagePrice =
    validPrices.length === projectionCounts.length
      ? validPrices.reduce((sum, p) => sum + p, 0) / validPrices.length
      : null;
  const percent =
    averagePrice !== null && livePrice > 0
      ? ((averagePrice / livePrice) - 1) * 100
      : null;

  return {
    asset,
    market,
    timeframe,
    currentPrice: livePrice,
    referencePrice,
    currentRsi,
    targetRsi,
    projections,
    averagePrice,
    percent,
    updatedAt: now,
  };
}

function normalizePeriod(timeframe: ReverseRsiTimeframe): string {
  // APIs/config in this codebase use "1S" for weekly.
  return timeframe === "1W" ? "1S" : timeframe;
}

export async function fetchReverseRsiLivePrice(params: {
  asset: string;
  market: ReverseRsiMarket;
  signal?: AbortSignal;
}): Promise<number | null> {
  const { asset, market, signal } = params;
  if (market === "CRIPTO") {
    try {
      const response = await fetch(
        `https://data-api.binance.vision/api/v3/ticker/price?symbol=${encodeURIComponent(asset.toUpperCase())}USDT`,
        { cache: "no-store", signal },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { symbol?: string; price?: string };
      const price = Number(body?.price);
      return Number.isFinite(price) && price > 0 ? price : null;
    } catch {
      return null;
    }
  }

  try {
    const data = await fetchLiveStockMarket(asset, "15M", signal);
    const last = data.candles.at(-1)?.close;
    return Number.isFinite(last) && (last as number) > 0 ? (last as number) : null;
  } catch {
    try {
      const data = await fetchLiveStockMarket(asset, "1H", signal);
      const last = data.candles.at(-1)?.close;
      return Number.isFinite(last) && (last as number) > 0 ? (last as number) : null;
    } catch {
      return null;
    }
  }
}

export async function fetchReverseRsiCandles(params: {
  asset: string;
  market: ReverseRsiMarket;
  timeframe: ReverseRsiTimeframe;
  signal?: AbortSignal;
}): Promise<{ closes: number[]; referencePrice: number | null; updatedAt: number }> {
  const { asset, market, timeframe, signal } = params;
  const period = normalizePeriod(timeframe);

  let candles: Candle[];
  let updatedAt = Date.now();
  if (market === "CRIPTO") {
    const marketData = await fetchMarket(asset, period, signal);
    candles = marketData.candles;
    updatedAt = marketData.updatedAt ?? updatedAt;
  } else {
    // Stocks: try market route, then live stock worker fallback.
    try {
      const marketData = await fetchMarket(asset, period, signal);
      candles = marketData.candles;
      updatedAt = marketData.updatedAt ?? updatedAt;
    } catch {
      const marketData = await fetchLiveStockMarket(asset, period, signal);
      candles = marketData.candles;
      updatedAt = marketData.updatedAt ?? updatedAt;
    }
  }

  const closed = completedCandles(candles, period, Date.now());
  const closes = closed
    .map((c) => c.close)
    .filter((v) => Number.isFinite(v) && v > 0);
  const referencePrice = closes.length ? closes[closes.length - 1] : null;
  return { closes, referencePrice, updatedAt };
}

import type { Candle } from "./types";

export type CandleGeometry = Candle & {
  index: number;
  wickTop: number;
  wickHeight: number;
  bodyTop: number;
  bodyHeight: number;
  direction: "up" | "down";
};

export type PriceGeometry = {
  candles: CandleGeometry[];
  min: number;
  max: number;
  mid: number;
  scale: (value: number) => number;
};

export type HorizontalViewport = {
  start: number;
  visibleCount: number;
  followLatest: boolean;
};

export type PriceRange = {
  min: number;
  max: number;
};

export const DEFAULT_VISIBLE_CANDLES = 48;
export const MIN_VISIBLE_CANDLES = 12;

export function clampViewport(
  viewport: Pick<HorizontalViewport, "start" | "visibleCount">,
  total: number,
  minVisible = MIN_VISIBLE_CANDLES,
) {
  const visibleCount = Math.max(1, Math.min(total, Math.max(minVisible, Math.round(viewport.visibleCount))));
  const start = Math.max(0, Math.min(Math.max(0, total - visibleCount), Math.round(viewport.start)));
  return { start, visibleCount };
}

export function panViewport(
  viewport: Pick<HorizontalViewport, "start" | "visibleCount">,
  indexDelta: number,
  total: number,
  minVisible = MIN_VISIBLE_CANDLES,
) {
  return clampViewport({ ...viewport, start: viewport.start + indexDelta }, total, minVisible);
}

export function zoomViewport(
  viewport: Pick<HorizontalViewport, "start" | "visibleCount">,
  anchorRatio: number,
  factor: number,
  total: number,
  minVisible = MIN_VISIBLE_CANDLES,
) {
  const ratio = Math.max(0, Math.min(1, anchorRatio));
  const anchorIndex = viewport.start + ratio * viewport.visibleCount;
  const nextVisibleCount = viewport.visibleCount * factor;
  const normalized = clampViewport({ start: 0, visibleCount: nextVisibleCount }, total, minVisible);
  return clampViewport({
    start: anchorIndex - ratio * normalized.visibleCount,
    visibleCount: normalized.visibleCount,
  }, total, minVisible);
}

function validPrice(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0;
}

export function getAutoPriceRange(candles: Candle[], currentPrice?: number): PriceRange | null {
  const values = candles.flatMap((candle) => [candle.open, candle.high, candle.low, candle.close]);
  if (validPrice(currentPrice)) values.push(currentPrice);
  const finite = values.filter((value) => Number.isFinite(value) && value > 0);
  if (!finite.length) return null;

  const rawMin = Math.min(...finite);
  const rawMax = Math.max(...finite);
  const rawRange = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.001, 1e-8);
  const padding = rawRange * 0.08;
  return { min: rawMin - padding, max: rawMax + padding };
}

export function getPriceBounds(candles: Candle[], currentPrice?: number): PriceRange | null {
  return getAutoPriceRange(candles, currentPrice);
}

export function zoomPriceRange(
  range: PriceRange,
  anchorPrice: number,
  factor: number,
  bounds: PriceRange,
) {
  const safeFactor = Math.max(0.05, Math.min(20, factor));
  const anchor = Number.isFinite(anchorPrice) ? anchorPrice : (range.min + range.max) / 2;
  const nextRange = range.max - range.min;
  const minRange = Math.max((bounds.max - bounds.min) * 0.02, Math.abs(anchor) * 0.0001, 1e-8);
  const maxRange = Math.max(bounds.max - bounds.min, minRange);
  const targetRange = Math.max(minRange, Math.min(maxRange, nextRange * safeFactor));
  const ratio = (anchor - range.min) / Math.max(nextRange, 1e-8);
  const min = anchor - targetRange * ratio;
  return clampPriceRange({ min, max: min + targetRange }, bounds);
}

export function panPriceRange(range: PriceRange, priceDelta: number, bounds: PriceRange) {
  return clampPriceRange({ min: range.min + priceDelta, max: range.max + priceDelta }, bounds);
}

function clampPriceRange(range: PriceRange, bounds: PriceRange): PriceRange {
  const size = Math.max(range.max - range.min, 1e-8);
  const boundSize = Math.max(bounds.max - bounds.min, size);
  if (size >= boundSize) return { ...bounds };
  const min = Math.max(bounds.min, Math.min(bounds.max - size, range.min));
  return { min, max: min + size };
}

export function priceFromPlotY(y: number, height: number, range: PriceRange) {
  const ratio = Math.max(0, Math.min(1, y / Math.max(height, 1)));
  return range.max - ratio * (range.max - range.min);
}

export function buildPriceGeometry(source: Candle[], limit = DEFAULT_VISIBLE_CANDLES, priceRange?: PriceRange): PriceGeometry | null {
  const valid = source.filter((candle) =>
    [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close),
  ).slice(-limit);

  if (valid.length < 2) return null;

  const automaticRange = getAutoPriceRange(valid);
  if (!automaticRange) return null;
  const min = priceRange?.min ?? automaticRange.min;
  const max = priceRange?.max ?? automaticRange.max;
  const range = max - min;
  const scale = (value: number) => Math.max(0, Math.min(100, ((max - value) / range) * 100));

  const candles = valid.map((candle, index): CandleGeometry => {
    const openY = scale(candle.open);
    const closeY = scale(candle.close);
    const highY = scale(candle.high);
    const lowY = scale(candle.low);
    return {
      ...candle,
      index,
      wickTop: highY,
      wickHeight: Math.max(lowY - highY, 0.3),
      bodyTop: Math.min(openY, closeY),
      bodyHeight: Math.max(Math.abs(closeY - openY), 0.8),
      direction: candle.close >= candle.open ? "up" : "down",
    };
  });

  return { candles, min, max, mid: (min + max) / 2, scale };
}

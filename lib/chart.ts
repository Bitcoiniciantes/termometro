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

export function buildPriceGeometry(source: Candle[], limit = 48): PriceGeometry | null {
  const valid = source.filter((candle) =>
    [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite) &&
    candle.high >= Math.max(candle.open, candle.close) &&
    candle.low <= Math.min(candle.open, candle.close),
  ).slice(-limit);

  if (valid.length < 2) return null;

  const rawMin = Math.min(...valid.map((candle) => candle.low));
  const rawMax = Math.max(...valid.map((candle) => candle.high));
  const rawRange = Math.max(rawMax - rawMin, Math.abs(rawMax) * 0.001, 1e-8);
  const padding = rawRange * 0.08;
  const min = rawMin - padding;
  const max = rawMax + padding;
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
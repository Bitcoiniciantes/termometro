import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPriceGeometry,
  getAutoPriceRange,
  panViewport,
  zoomPriceRange,
  zoomViewport,
} from "../lib/chart.ts";

const candles = [
  { time: 1, open: 100, high: 112, low: 96, close: 110, volume: 10 },
  { time: 2, open: 110, high: 114, low: 101, close: 103, volume: 12 },
  { time: 3, open: 103, high: 109, low: 99, close: 107, volume: 11 },
];

test("geometria OHLC preserva direção, corpo e pavio reais", () => {
  const chart = buildPriceGeometry(candles);
  assert.ok(chart);
  assert.deepEqual(chart.candles.map((candle) => candle.direction), ["up", "down", "up"]);
  assert.ok(chart.candles.every((candle) => candle.wickHeight >= candle.bodyHeight));
  assert.ok(chart.candles.every((candle) => candle.wickTop <= candle.bodyTop));
  assert.ok(chart.scale(114) < chart.scale(96));
  assert.ok(chart.max > 114);
  assert.ok(chart.min < 96);
});

test("geometria ignora candle inválido em vez de deformar o gráfico", () => {
  const invalid = { time: 4, open: 100, high: 90, low: 110, close: 101, volume: 1 };
  const chart = buildPriceGeometry([...candles, invalid]);
  assert.equal(chart?.candles.length, candles.length);
});

test("viewport horizontal limita pan e preserva a referência no zoom", () => {
  const base = { start: 20, visibleCount: 20 };
  assert.deepEqual(panViewport(base, -8, 120), { start: 12, visibleCount: 20 });
  assert.deepEqual(panViewport({ start: 0, visibleCount: 20 }, -8, 120), { start: 0, visibleCount: 20 });
  const zoomed = zoomViewport(base, 0.5, 0.5, 120);
  assert.equal(zoomed.visibleCount, 12);
  assert.equal(zoomed.start, 24);
});

test("autoescala prioriza OHLC e preço atual sem incluir níveis distantes", () => {
  const range = getAutoPriceRange(candles, 110);
  assert.ok(range);
  assert.ok(range.max < 200);
  assert.ok(range.min < 96);

  const chart = buildPriceGeometry(candles, 3, { min: 90, max: 120 });
  assert.ok(chart);
  assert.equal(chart.max, 120);
  assert.equal(chart.min, 90);
  assert.equal(chart.scale(1), 100);
  assert.equal(chart.scale(1000), 0);
});

test("zoom vertical respeita os limites do histórico", () => {
  const bounds = { min: 80, max: 140 };
  const range = { min: 95, max: 125 };
  const zoomed = zoomPriceRange(range, 110, 0.1, bounds);
  assert.ok(zoomed.max - zoomed.min >= 1.2);
  assert.ok(zoomed.min >= bounds.min);
  assert.ok(zoomed.max <= bounds.max);
});

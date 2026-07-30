import assert from "node:assert/strict";
import test from "node:test";
import { buildPriceGeometry } from "../lib/chart.ts";

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
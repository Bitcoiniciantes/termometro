import assert from "node:assert/strict";
import test from "node:test";
import { calculateAlertLevels } from "../lib/alert-levels.ts";

test("BTC preserva níveis técnicos quando S < Hoje < R", () => {
  const levels = calculateAlertLevels({
    currentPrice: 100_000,
    supportCandidate: 96_500,
    resistanceCandidate: 104_200,
    atr: 1_500,
    period: "1H",
  });

  assert.deepEqual(levels, { support: 96_500, today: 100_000, resistance: 104_200 });
  assert.ok(levels.support < levels.today && levels.today < levels.resistance);
});

test("LINK substitui os dois lados inválidos por fallback de ATR/timeframe", () => {
  const levels = calculateAlertLevels({
    currentPrice: 20,
    supportCandidate: 21,
    resistanceCandidate: 19,
    atr: 0.75,
    period: "4H",
  });

  assert.deepEqual(levels, { support: 19.25, today: 20, resistance: 20.75 });
  assert.ok(levels.support < levels.today && levels.today < levels.resistance);
});

test("fallback substitui somente o lado sem nível técnico", () => {
  const levels = calculateAlertLevels({
    currentPrice: 50,
    supportCandidate: 47,
    resistanceCandidate: 49,
    period: "1D",
  });

  assert.equal(levels.support, 47);
  assert.equal(levels.resistance, 52.5);
  assert.ok(levels.support < levels.today && levels.today < levels.resistance);
});

test("timeframe define a distância percentual quando ATR não está disponível", () => {
  const shortPeriod = calculateAlertLevels({ currentPrice: 100, period: "15M" });
  const longPeriod = calculateAlertLevels({ currentPrice: 100, period: "1M" });

  assert.deepEqual(shortPeriod, { support: 99, today: 100, resistance: 101 });
  assert.deepEqual(longPeriod, { support: 88, today: 100, resistance: 112 });
});

test("rejeita preço atual inválido", () => {
  assert.throws(() => calculateAlertLevels({ currentPrice: 0 }), RangeError);
});

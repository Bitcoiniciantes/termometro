import assert from "node:assert/strict";
import test from "node:test";

import { analyze, scoreLabel, wilderRsi } from "../lib/analysis.ts";
import { mapSettledWithConcurrency } from "../lib/concurrency.ts";

function marketFromCloses(closes, options = {}) {
  const { volume = 100, spread = 1 } = options;
  return {
    asset: "TESTE",
    pair: "TESTE/USDT",
    source: "fixture",
    updatedAt: 1,
    candles: closes.map((close, index) => ({
      time: index,
      open: close,
      high: close + spread,
      low: close - spread,
      close,
      volume: index === closes.length - 1 ? volume : 100,
    })),
  };
}

test("classifica exatamente as faixas públicas da nota", () => {
  assert.equal(scoreLabel(55), "COMPRA FORTE");
  assert.equal(scoreLabel(20), "COMPRA");
  assert.equal(scoreLabel(19), "NEUTRO");
  assert.equal(scoreLabel(-19), "NEUTRO");
  assert.equal(scoreLabel(-20), "VENDA");
  assert.equal(scoreLabel(-55), "VENDA FORTE");
});

test("RSI de Wilder reconhece sequências direcionais", () => {
  const rising = wilderRsi(Array.from({ length: 30 }, (_, index) => index + 1));
  const falling = wilderRsi(Array.from({ length: 30 }, (_, index) => 30 - index));
  assert.equal(rising?.value, 100);
  assert.equal(falling?.value, 0);
});

test("motor rejeita histórico insuficiente", () => {
  assert.equal(analyze(marketFromCloses(Array(54).fill(100))), null);
});

test("motor mantém sinais nomeados e pontuação determinística", () => {
  const closes = Array.from({ length: 60 }, (_, index) => 100 + index);
  const first = analyze(marketFromCloses(closes, { volume: 150 }));
  const second = analyze(marketFromCloses(closes, { volume: 150 }));

  assert.deepEqual(first, second);
  assert.equal(first?.signals.length, 5);
  assert.deepEqual(
    first?.signals.map((signal) => signal.group),
    ["Tendência", "Padrão", "Momentum", "Volume", "Risco"],
  );
  assert.equal(first?.signals[0].score, 18);
  assert.equal(first?.signals[3].score, 12);
  assert.ok(Number.isFinite(first?.score));
  assert.ok(Number.isFinite(first?.confidence));
});

test("mercado sem amplitude não produz NaN", () => {
  const result = analyze(marketFromCloses(Array(60).fill(100), { spread: 0 }));
  assert.ok(result);
  assert.ok(Number.isFinite(result.score));
  assert.ok(result.signals.every((signal) => !signal.detail.includes("NaN")));
});
test("limita consultas paralelas sem perder resultados", async () => {
  let active = 0;
  let peak = 0;
  const results = await mapSettledWithConcurrency([1, 2, 3, 4, 5, 6], 3, async (value) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 5));
    active -= 1;
    return value * 2;
  });

  assert.equal(peak, 3);
  assert.deepEqual(
    results.map((result) => result.status === "fulfilled" ? result.value : null),
    [2, 4, 6, 8, 10, 12],
  );
});
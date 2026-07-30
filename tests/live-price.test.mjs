import assert from "node:assert/strict";
import test from "node:test";
import { livePriceStreamUrl, parseLiveTicker } from "../lib/live-price.ts";

test("monta o stream público da Binance para a cripto selecionada", () => {
  assert.equal(
    livePriceStreamUrl("BTC"),
    "wss://data-stream.binance.vision/ws/btcusdt@ticker",
  );
  assert.throws(() => livePriceStreamUrl("BTC-BRL"), /Símbolo inválido/);
});

test("aceita apenas cotações ao vivo válidas", () => {
  assert.deepEqual(parseLiveTicker('{"c":"63991.40","E":1785369600000}'), {
    price: 63991.4,
    eventTime: 1785369600000,
  });
  assert.equal(parseLiveTicker('{"c":"erro","E":1785369600000}'), null);
  assert.equal(parseLiveTicker("não é json"), null);
});

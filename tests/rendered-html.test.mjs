import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("expõe o painel e o motor transparente", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /TERMÔMETRO/);
  assert.match(page, /function analyze/);
  assert.match(page, /RSI de 14 períodos/);
  assert.match(page, /ATR de 14 períodos/);
  assert.match(page, /termometro-assets/);
});

test("usa somente a fonte pública para os criptoativos suportados", async () => {
  const route = await readFile(new URL("../app/api/market/route.ts", import.meta.url), "utf8");
  assert.match(route, /data-api\.binance\.vision\/api\/v3\/klines/);
  assert.match(route, /BTC.*ETH.*LINK.*AVAX.*SOL/);
  assert.doesNotMatch(route, /api[_-]?key|authorization/i);
});
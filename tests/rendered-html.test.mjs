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

test("consulta a fonte pública diretamente no navegador", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /data-api\.binance\.vision\/api\/v3\/klines/);
  assert.match(page, /Access|Binance Public Market Data/);
  assert.match(page, /"1M":"1M"/);
  assert.doesNotMatch(page, /api[_-]?key|authorization/i);
});

test("inclui MSTR com fonte gratuita separada", async () => {
  const [page, workflow, snapshot] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/deploy-pages.yml", import.meta.url), "utf8"),
    readFile(new URL("../public/data/mstr.json", import.meta.url), "utf8"),
  ]);
  const data = JSON.parse(snapshot);
  assert.match(page, /fetchMstr/);
  assert.match(page, /MSTR\/USD/);
  assert.doesNotMatch(page, /filter\(asset=>asset!=="MSTR"\)/);
  assert.match(workflow, /update-mstr-data\.mjs/);
  for (const period of ["1H", "4H", "1D", "1S", "1M"]) {
    assert.ok(data.periods[period].length >= 55);
  }
});

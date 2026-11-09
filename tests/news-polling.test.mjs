import assert from "node:assert/strict";
import test from "node:test";
import { fetchAssetNews } from "../lib/ai.ts";

test("falha não permite nova tentativa de notícias antes de cinco minutos", async (t) => {
  let now = 1_000_000;
  let calls = 0;
  t.mock.method(Date, "now", () => now);
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    throw new Error("rede indisponível");
  });
  await assert.rejects(fetchAssetNews("TEST"));
  now += 299_999;
  await assert.rejects(fetchAssetNews("TEST"));
  assert.equal(calls, 1);
  now += 300_001;
  await assert.rejects(fetchAssetNews("TEST"));
  assert.equal(calls, 2);
});

test("consultar outro ativo não fica sujeito ao intervalo do primeiro", async (t) => {
  let calls = 0;
  t.mock.method(Date, "now", () => 2_000_000);
  t.mock.method(globalThis, "fetch", async () => {
    calls += 1;
    return new Response(JSON.stringify({ items: [] }), { status: 200 });
  });
  await fetchAssetNews("ASSET_A");
  await fetchAssetNews("ASSET_B");
  assert.equal(calls, 2);
});

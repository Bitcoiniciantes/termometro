import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BRAKE_ASSETS,
  BRAKE_EXTRA_STORAGE_KEY,
  BRAKE_MAX_EXTRA_ASSETS,
  brakeAssetMeta,
  fetchBrakeKlines,
  fetchBrakeSpotQuote,
  isBaseBrakeAssetSymbol,
  isSameRadarAsset,
  isValidBrakeRadarSymbol,
  normalizeRadarExtraSymbols,
  parseRadarExtraAssets,
  serializeRadarExtraAssets,
  toBrakeSpotSymbol,
} from "../lib/brake-radar.ts";

test("ativos fixos do radar continuam intactos", () => {
  assert.deepEqual(
    BRAKE_ASSETS.map((asset) => asset.ticker),
    ["BTC", "ETH", "SOL", "LINK", "AVAX"],
  );
  assert.equal(BRAKE_MAX_EXTRA_ASSETS, 3);
  assert.equal(BRAKE_EXTRA_STORAGE_KEY, "termometro-radar-extra-assets-v1");
  // Não reutiliza chaves de outros recursos do Termômetro nem do Preditivo.
  assert.notEqual(BRAKE_EXTRA_STORAGE_KEY, "termometro-assets");
  assert.notEqual(BRAKE_EXTRA_STORAGE_KEY, "radar-reversao-extra-assets");
});

test("normaliza ticker livre para o par Binance Spot canônico", () => {
  assert.equal(toBrakeSpotSymbol("xrp"), "XRPUSDT");
  assert.equal(toBrakeSpotSymbol(" xrpusdt "), "XRPUSDT");
  assert.equal(toBrakeSpotSymbol(" BTC "), "BTCUSDT");
  assert.equal(toBrakeSpotSymbol(""), null);
  assert.equal(toBrakeSpotSymbol("A"), null);
  assert.equal(toBrakeSpotSymbol("PETR4.SA"), null);
  assert.equal(isValidBrakeRadarSymbol("XRPUSDT"), true);
  assert.equal(isValidBrakeRadarSymbol("PETR4.SAUSDT"), false);
});

test("extra inválido é rejeitado na aquisição antes de qualquer rede", async () => {
  await assert.rejects(() => fetchBrakeKlines(undefined, "PETR4.SAUSDT"), /ativo não permitido/);
  await assert.rejects(() => fetchBrakeSpotQuote("PETR4.SAUSDT"), /ativo não permitido/);
});

test("lista persistida descarta base, duplicatas e formatos inválidos", () => {
  assert.deepEqual(
    normalizeRadarExtraSymbols(["XRP", "xrpusdt", "BTC", "SOLUSDT", 42, "", "DOGEUSDT"]),
    ["XRPUSDT", "DOGEUSDT"],
  );
});

test("respeita o teto de três adicionais na ordem recebida", () => {
  assert.deepEqual(
    normalizeRadarExtraSymbols(["XRP", "DOGE", "ADA", "AVAX", "TON"]),
    ["XRPUSDT", "DOGEUSDT", "ADAUSDT"],
  );
});

test("entrada não textual ou limite inválido não quebra a hidratação", () => {
  assert.deepEqual(normalizeRadarExtraSymbols(null), []);
  assert.deepEqual(normalizeRadarExtraSymbols("XRP"), []);
  assert.deepEqual(normalizeRadarExtraSymbols([{ symbol: "XRP" }]), []);
  assert.deepEqual(normalizeRadarExtraSymbols(["XRP"], 0), []);
  assert.deepEqual(normalizeRadarExtraSymbols(["XRP"], Number.NaN), ["XRPUSDT"]);
});

test("storage corrompido ou com mais de três extras é recuperado com segurança", () => {
  assert.deepEqual(parseRadarExtraAssets("{"), []);
  assert.deepEqual(parseRadarExtraAssets(null), []);
  assert.deepEqual(
    parseRadarExtraAssets(JSON.stringify(["XRP", "DOGE", "ADA", "TON", "BTC"])),
    ["XRPUSDT", "DOGEUSDT", "ADAUSDT"],
  );
  assert.equal(
    serializeRadarExtraAssets(["xrp", "XRPUSDT", "BTC"]),
    JSON.stringify(["XRPUSDT"]),
  );
});

test("identidade canônica evita pares duplicados disfarçados", () => {
  assert.equal(isSameRadarAsset("XRP", "XRPUSDT"), true);
  assert.equal(isSameRadarAsset("XRPUSDT", "xrpusdt"), true);
  assert.equal(isSameRadarAsset("XRPUSDT", "DOGEUSDT"), false);
  assert.equal(isBaseBrakeAssetSymbol("BTCUSDT"), true);
  assert.equal(isBaseBrakeAssetSymbol("XRPUSDT"), false);
  assert.deepEqual(brakeAssetMeta("XRPUSDT"), {
    symbol: "XRPUSDT",
    name: "XRP",
    ticker: "XRP",
  });
});

test("wrapper liga + ATIVO, ×, limite e COMPARAR aos mecanismos existentes", async () => {
  const wrapper = await readFile(new URL("../app/BtcRadarReversal.tsx", import.meta.url), "utf8");
  const panel = await readFile(new URL("../app/RadarComparePanel.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/radar-reversal.css", import.meta.url), "utf8");

  assert.match(wrapper, /BRAKE_EXTRA_STORAGE_KEY/);
  assert.match(wrapper, /BRAKE_MAX_EXTRA_ASSETS/);
  assert.match(wrapper, /parseRadarExtraAssets/);
  assert.match(wrapper, /serializeRadarExtraAssets/);
  assert.match(wrapper, /toBrakeSpotSymbol/);
  assert.match(wrapper, /fetchBrakeKlines/);
  assert.match(wrapper, /fetchBrakeSpotQuote/);
  assert.match(wrapper, /disabled=\{addDisabled\}/);
  assert.match(wrapper, /role="status"/);
  assert.match(wrapper, /Remover \$\{asset\.ticker\}/);
  assert.match(wrapper, /\{!asset\.base && \(/);
  assert.match(wrapper, /current === symbol \? "" : current/);
  assert.match(wrapper, /current === symbol \? "BTCUSDT" : current/);
  assert.match(wrapper, /allowedSymbolsRef/);
  assert.match(wrapper, /COMPARAR/);
  assert.match(wrapper, /RadarComparePanel/);

  assert.match(panel, /Comparação informativa, baseada nos dados e indicadores/);
  assert.match(panel, /não é recomendação de investimento\./);
  assert.match(panel, /Escolha dois ativos diferentes para comparar\./);
  assert.match(panel, /rrCompareState/);
  assert.match(styles, /\.rrAssetWrap/);
  assert.match(styles, /\.rrLimitNotice/);
  assert.match(styles, /\.rrCompareCard\.tone-green/);
  assert.match(styles, /\.rrCompareCard\.tone-red/);
});

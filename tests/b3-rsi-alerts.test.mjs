import test from "node:test";
import assert from "node:assert/strict";

import {
  b3RsiCrossingMessage,
  migrateState,
  processB3RsiAlerts,
} from "../scripts/monitor-telegram-alerts.mjs";

const OPEN = Date.parse("2026-11-03T14:00:00Z");

const state = () => ({
  version: 7,
  subscribers: {},
  readings: {},
  capitulationWatch: {},
  priceTargets: {},
  rsiAlerts: {},
  retryQueue: [],
});

const cfg = (...symbols) => ({
  valid: true,
  symbols: symbols.map((s) =>
    typeof s === "string"
      ? { symbol: s, label: s.replace(".SA", ""), active: true }
      : s,
  ),
});

const rsi = (value) => async () => value;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cruzamento descendente de 40 dispara alerta
// ─────────────────────────────────────────────────────────────────────────────
test("1. cruzamento descendente de 40 dispara alerta", async () => {
  const current = state();
  const messages = [];
  // Ciclo 1: inicialização com RSI=42 (above40=true)
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  assert.equal(messages.length, 0);
  assert.equal(current.rsiAlerts["VALE3.SA"].above40, true);

  // Ciclo 2: RSI cai para 38 → cruzamento descendente
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(38));
  assert.equal(messages.length, 1);
  assert.equal(current.rsiAlerts["VALE3.SA"].above40, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Cruzamento ascendente de 70 dispara alerta
// ─────────────────────────────────────────────────────────────────────────────
test("2. cruzamento ascendente de 70 dispara alerta", async () => {
  const current = state();
  const messages = [];
  // Ciclo 1: inicialização com RSI=65 (above70=false)
  await processB3RsiAlerts(current, messages, OPEN, cfg("PETR4.SA"), rsi(65));
  assert.equal(messages.length, 0);
  assert.equal(current.rsiAlerts["PETR4.SA"].above70, false);

  // Ciclo 2: RSI sobe para 72 → cruzamento ascendente
  await processB3RsiAlerts(current, messages, OPEN, cfg("PETR4.SA"), rsi(72));
  assert.equal(messages.length, 1);
  assert.equal(current.rsiAlerts["PETR4.SA"].above70, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Permanência abaixo de 40 não repete alerta
// ─────────────────────────────────────────────────────────────────────────────
test("3. permanência abaixo de 40 não repete alerta", async () => {
  const current = state();
  const messages = [];
  // Inicializar com RSI=42
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  // Cruzamento descendente 42→38
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(38));
  assert.equal(messages.length, 1);
  // Permanece abaixo: 35, 33 — sem novo alerta
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(35));
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(33));
  assert.equal(messages.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Permanência acima de 70 não repete alerta
// ─────────────────────────────────────────────────────────────────────────────
test("4. permanência acima de 70 não repete alerta", async () => {
  const current = state();
  const messages = [];
  // Inicializar com RSI=65
  await processB3RsiAlerts(current, messages, OPEN, cfg("PETR4.SA"), rsi(65));
  // Cruzamento ascendente 65→72
  await processB3RsiAlerts(current, messages, OPEN, cfg("PETR4.SA"), rsi(72));
  assert.equal(messages.length, 1);
  // Permanece acima: 75, 78 — sem novo alerta
  await processB3RsiAlerts(current, messages, OPEN, cfg("PETR4.SA"), rsi(75));
  await processB3RsiAlerts(current, messages, OPEN, cfg("PETR4.SA"), rsi(78));
  assert.equal(messages.length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Rearme após cruzamento de retorno — RSI 42→38→43→38: 2 alertas
// ─────────────────────────────────────────────────────────────────────────────
test("5. rearme após cruzamento de retorno", async () => {
  const current = state();
  const messages = [];
  // Inicialização
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  assert.equal(messages.length, 0);
  // Primeiro cruzamento: 42→38
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(38));
  assert.equal(messages.length, 1);
  // Rearme silencioso: 38→43
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(43));
  assert.equal(messages.length, 1);
  assert.equal(current.rsiAlerts["VALE3.SA"].above40, true);
  // Segundo cruzamento: 43→38
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(38));
  assert.equal(messages.length, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. RSI nulo ou inválido não altera estado após inicialização
// ─────────────────────────────────────────────────────────────────────────────
test("6. RSI nulo ou inválido não altera estado após inicialização", async () => {
  const current = state();
  const messages = [];
  // Inicializar
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  const stateBefore = JSON.stringify(current.rsiAlerts);
  // RSI nulo — estado não muda
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(null));
  assert.equal(JSON.stringify(current.rsiAlerts), stateBefore);
  assert.equal(messages.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Falha de API não altera estado
// ─────────────────────────────────────────────────────────────────────────────
test("7. falha de API não altera estado", async () => {
  const current = state();
  const messages = [];
  // Inicializar
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  const stateBefore = JSON.stringify(current.rsiAlerts);
  // Fetcher lança erro
  const throwing = async () => { throw new Error("timeout"); };
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), throwing);
  assert.equal(JSON.stringify(current.rsiAlerts), stateBefore);
  assert.equal(messages.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Reinicialização do monitor: primeira leitura inicializa sem disparar
// ─────────────────────────────────────────────────────────────────────────────
test("8. reinicialização do monitor: primeira leitura inicializa sem disparar", async () => {
  const current = state();
  const messages = [];
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(38));
  assert.equal(messages.length, 0);
  assert.equal(current.rsiAlerts["VALE3.SA"].above40, false);
  assert.equal(current.rsiAlerts["VALE3.SA"].lastRsi, 38);
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. Ausência de alertas duplicados entre preço e RSI
// ─────────────────────────────────────────────────────────────────────────────
test("9. ausência de alertas duplicados entre preço e RSI", async () => {
  const current = state();
  // Seed some priceTargets state
  current.priceTargets["VALE3.SA:UP:70"] = { armed: true, lastPrice: 69, triggeredAt: 0 };
  const messages = [];
  // Initialize RSI
  await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  // priceTargets untouched
  assert.ok(current.priceTargets["VALE3.SA:UP:70"]);
  // rsiAlerts is independent
  assert.ok(current.rsiAlerts["VALE3.SA"]);
  assert.equal(messages.length, 0);
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Todos os 8 ativos são processados
// ─────────────────────────────────────────────────────────────────────────────
test("10. todos os 8 ativos são processados", async () => {
  const current = state();
  const messages = [];
  const symbols = [
    "VALE3.SA", "PETR4.SA", "ITUB4.SA", "BBDC4.SA",
    "BPAC11.SA", "BBAS3.SA", "WEGE3.SA", "USIM5.SA",
  ];
  await processB3RsiAlerts(current, messages, OPEN, cfg(...symbols), rsi(38));
  assert.equal(Object.keys(current.rsiAlerts).length, 8);
  assert.equal(messages.length, 0); // primeira leitura não dispara
  for (const s of symbols) {
    assert.ok(current.rsiAlerts[s], `${s} deve estar inicializado`);
    assert.equal(current.rsiAlerts[s].above40, false);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Símbolo removido da config elimina estado sem disparar
// ─────────────────────────────────────────────────────────────────────────────
test("11. símbolo removido da config elimina estado sem disparar", async () => {
  const current = state();
  const messages = [];
  const allSymbols = ["VALE3.SA", "USIM5.SA"];
  // Inicializar ambos
  await processB3RsiAlerts(current, messages, OPEN, cfg(...allSymbols), rsi(42));
  assert.ok(current.rsiAlerts["USIM5.SA"]);

  // Remover USIM5.SA da config
  const changed = await processB3RsiAlerts(current, messages, OPEN, cfg("VALE3.SA"), rsi(42));
  assert.equal(current.rsiAlerts["USIM5.SA"], undefined);
  assert.equal(messages.length, 0);
  assert.equal(changed, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Config ausente ou inválida não quebra
// ─────────────────────────────────────────────────────────────────────────────
test("12. config ausente ou inválida não quebra", async () => {
  const current = state();
  const result = await processB3RsiAlerts(current, [], OPEN, { valid: false, symbols: [] });
  assert.equal(result, false);
  assert.deepEqual(current.rsiAlerts, {});
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Mensagem não contém linguagem de compra/venda no corpo
// ─────────────────────────────────────────────────────────────────────────────
test("13. mensagem não contém linguagem de compra/venda no corpo", () => {
  const symbol = { symbol: "VALE3.SA", label: "VALE3", active: true };
  const msg = b3RsiCrossingMessage(symbol, 38, 40, "DOWN", OPEN);
  // O disclaimer pode conter "resultado", mas não deve conter compra/venda/recomend no corpo
  const body = msg.split("Semana em formação.")[0];
  assert.doesNotMatch(body, /compra|venda|recomend/i);
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Mensagem usa vírgula decimal para RSI
// ─────────────────────────────────────────────────────────────────────────────
test("14. mensagem usa vírgula decimal para RSI", () => {
  const symbol = { symbol: "VALE3.SA", label: "VALE3", active: true };
  const msg = b3RsiCrossingMessage(symbol, 38.7, 40, "DOWN", OPEN);
  assert.match(msg, /38,7/);
  assert.doesNotMatch(msg, /38\.7/);
});

// ─────────────────────────────────────────────────────────────────────────────
// 15. Migração v6→v7 preserva todos os campos anteriores
// ─────────────────────────────────────────────────────────────────────────────
test("15. migração v6→v7 preserva todos os campos anteriores", () => {
  const old = {
    version: 6,
    updateOffset: 42,
    subscribers: { one: { active: true, preference: "TODOS", movement4: false, btcMovementReference: null, joinedAt: 1000 } },
    readings: { "BTC-1D": { band: "COMPRA", candleTime: 123 } },
    capitulationWatch: { x: { stage: "PENDING" } },
    priceTargets: { "VALE3.SA:UP:70": { armed: true, lastPrice: 69, triggeredAt: 0 } },
    retryQueue: [{ chatId: "one", text: "msg", attempts: 1 }],
  };
  const migrated = migrateState(old);
  assert.equal(migrated.version, 7);
  assert.deepEqual(migrated.rsiAlerts, {});
  assert.equal(migrated.updateOffset, 42);
  assert.deepEqual(migrated.readings, old.readings);
  assert.deepEqual(migrated.capitulationWatch, old.capitulationWatch);
  assert.deepEqual(migrated.priceTargets, old.priceTargets);
  assert.deepEqual(migrated.retryQueue, old.retryQueue);
  assert.equal(Object.keys(migrated.subscribers).length, 1);
  assert.equal(migrated.subscribers.one.preference, "TODOS");
});

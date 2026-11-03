import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

import {
  b3PriceTargetMessage,
  b3SessionOpen,
  broadcast,
  flushRetryQueue,
  migrateState,
  processB3PriceTargets,
  queueRetry,
} from "../scripts/monitor-telegram-alerts.mjs";

const OPEN = Date.parse("2026-11-03T14:00:00Z");
const SATURDAY = Date.parse("2026-11-07T14:00:00Z");
const RULE_UP = { id: "VALE3.SA:UP:70", symbol: "VALE3.SA", label: "VALE3", target: 70, direction: "UP", active: true };
const RULE_DOWN = { id: "PETR4.SA:DOWN:50", symbol: "PETR4.SA", label: "PETR4", target: 50, direction: "DOWN", active: true };
const cfg = (...rules) => ({ valid: true, rules });
const state = () => ({ version: 6, subscribers: {}, readings: {}, capitulationWatch: {}, priceTargets: {}, retryQueue: [] });
const prices = (...entries) => new Map(entries);
const fetcher = (map) => async () => map;

test("1–3. UP dispara uma vez, não repete e rearma", async () => {
  const current = state();
  const messages = [];
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 69])));
  assert.equal(current.priceTargets[RULE_UP.id].armed, true);
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 70.12])));
  assert.equal(messages.length, 1);
  assert.equal(current.priceTargets[RULE_UP.id].armed, false);
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 71])));
  assert.equal(messages.length, 1);
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 69.5])));
  assert.equal(current.priceTargets[RULE_UP.id].armed, true);
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 70])));
  assert.equal(messages.length, 2);
});

test("4. DOWN dispara, não repete e rearma", async () => {
  const current = state();
  const messages = [];
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_DOWN), fetcher(prices(["PETR4.SA", 51])));
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_DOWN), fetcher(prices(["PETR4.SA", 49.9])));
  assert.equal(messages.length, 1);
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_DOWN), fetcher(prices(["PETR4.SA", 49])));
  assert.equal(messages.length, 1);
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_DOWN), fetcher(prices(["PETR4.SA", 51])));
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_DOWN), fetcher(prices(["PETR4.SA", 50])));
  assert.equal(messages.length, 2);
});

test("5. regra nova além do alvo nasce desarmada e não envia", async () => {
  const current = state();
  const messages = [];
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 72])));
  assert.equal(messages.length, 0);
  assert.equal(current.priceTargets[RULE_UP.id].armed, false);
});

test("6. cotações inválidas são ignoradas", async () => {
  for (const value of [null, Number.NaN, 0, -1]) {
    const current = state();
    const messages = [];
    await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", value])));
    assert.deepEqual(current.priceTargets, {});
    assert.equal(messages.length, 0);
  }
});

test("7. falha da API não altera estado", async () => {
  const current = state();
  const before = JSON.stringify(current);
  await processB3PriceTargets(current, [], OPEN, cfg(RULE_UP), async () => { throw new Error("API indisponível"); });
  assert.equal(JSON.stringify(current), before);
});

test("8. falha do Telegram deixa uma mensagem na fila e mantém a regra desarmada", async () => {
  const current = state();
  current.subscribers = { one: { active: true, preference: "FORTES" } };
  const messages = [];
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 69])));
  await processB3PriceTargets(current, messages, OPEN, cfg(RULE_UP), fetcher(prices(["VALE3.SA", 70])));
  const result = await broadcast(current, messages[0].text, null, async () => { throw new Error("timeout"); });
  queueRetry(current, [{ chatId: "one", text: messages[0].text, kind: null }]);
  assert.equal(result.failed, 1);
  assert.equal(current.retryQueue.length, 1);
  assert.equal(current.priceTargets[RULE_UP.id].armed, false);
});

test("9. dois destinatários: retry somente para quem falhou", async () => {
  const current = state();
  current.subscribers = { ok: { active: true }, fail: { active: true } };
  const delivered = [];
  const first = await broadcast(current, "mensagem", null, async (chatId) => {
    if (chatId === "fail") throw new Error("timeout");
    delivered.push(chatId);
  });
  queueRetry(current, [{ chatId: "fail", text: "mensagem", kind: null }]);
  assert.deepEqual(delivered, ["ok"]);
  assert.equal(first.failed, 1);
  const retried = [];
  await flushRetryQueue(current, async (chatId) => retried.push(chatId));
  assert.deepEqual(retried, ["fail"]);
});

test("10. falha permanente desativa somente o destinatário inválido", async () => {
  const current = state();
  current.subscribers = { blocked: { active: true }, ok: { active: true } };
  await broadcast(current, "mensagem", null, async (chatId) => {
    if (chatId === "blocked") throw new Error("Telegram 403: bot was blocked");
  });
  assert.equal(current.subscribers.blocked.active, false);
  assert.equal(current.subscribers.ok.active, true);
});

test("11. sábado e fora da janela de pregão não consultam nem disparam", async () => {
  assert.equal(b3SessionOpen(SATURDAY), false);
  assert.equal(b3SessionOpen(Date.parse("2026-11-03T12:04:00Z")), false);
  assert.equal(b3SessionOpen(Date.parse("2026-11-03T20:56:00Z")), false);
  let called = false;
  await processB3PriceTargets(state(), [], SATURDAY, cfg(RULE_UP), async () => { called = true; return prices(["VALE3.SA", 70]); });
  assert.equal(called, false);
});

test("12. símbolos .SA são preservados", async () => {
  let received;
  await processB3PriceTargets(state(), [], OPEN, cfg(RULE_UP), async (rules) => {
    received = rules.map((rule) => rule.symbol);
    return prices(["VALE3.SA", 69]);
  });
  assert.deepEqual(received, ["VALE3.SA"]);
});

test("13. mensagem usa BRL e não contém linguagem de negociação no corpo", () => {
  const message = b3PriceTargetMessage(RULE_UP, 70.12).replace(/\u00a0/g, " ");
  assert.match(message, /Cotação atual: R\$ 70,12/);
  assert.match(message, /Alvo: R\$ 70,00/);
  assert.match(message, /subiu até o alvo/);
  assert.doesNotMatch(message.split("Alerta técnico educacional.")[0], /comprar|vender|compra|venda|recomendação/i);
});

test("14. múltiplas regras mantêm estados independentes", async () => {
  const current = state();
  const rules = cfg(RULE_UP, RULE_DOWN);
  await processB3PriceTargets(current, [], OPEN, rules, fetcher(prices(["VALE3.SA", 69], ["PETR4.SA", 51])));
  assert.equal(Object.keys(current.priceTargets).length, 2);
});

test("15. versão 5 migra para 7 sem perder estado", async () => {
  const old = {
    version: 5,
    updateOffset: 17,
    subscribers: { one: { active: true, preference: "TODOS" } },
    readings: { BTC: { band: "COMPRA", candleTime: 123 } },
    capitulationWatch: { x: { stage: "PENDING" } },
    retryQueue: [{ chatId: "one", text: "x", attempts: 1 }],
  };
  const oldSource = execFileSync(
    "git",
    ["show", "HEAD:scripts/monitor-telegram-alerts.mjs"],
    { encoding: "utf8" },
  );
  const normalizeStart = oldSource.indexOf("function normalizeSubscribers");
  const loaderEnd = oldSource.indexOf("async function saveState");
  assert.ok(normalizeStart >= 0 && loaderEnd > normalizeStart, "loader antigo encontrado no commit atual");
  const legacyApi = new vm.Script(`
    ${oldSource.slice(normalizeStart, loaderEnd)}
    ({ readState })
  `).runInNewContext({
    STATE_PATH: "state.json",
    DEFAULT_PREFERENCE: "FORTES",
    readFile: async () => JSON.stringify(old),
  });
  const legacyLoaded = await legacyApi.readState();
  const migrated = migrateState(old);
  assert.equal(migrated.version, 7);
  assert.equal(migrated.priceTargets && typeof migrated.priceTargets, "object");
  for (const key of ["updateOffset", "subscribers", "readings", "capitulationWatch", "retryQueue"]) {
    assert.deepEqual(
      JSON.parse(JSON.stringify(migrated[key])),
      JSON.parse(JSON.stringify(legacyLoaded.state[key])),
      key + " preservado pelo loader novo",
    );
  }
  assert.deepEqual(migrated.priceTargets, {});
});

test("16. config ausente ou inválida não quebra a rodada", async () => {
  const current = state();
  assert.equal(await processB3PriceTargets(current, [], OPEN, { valid: false, rules: [] }), false);
  assert.deepEqual(current.priceTargets, {});
});

test("17. active:false ou regra removida elimina o estado sem disparar", async () => {
  const current = state();
  current.priceTargets[RULE_UP.id] = { armed: true, lastPrice: 69, triggeredAt: 0 };
  const changed = await processB3PriceTargets(current, [], OPEN, cfg({ ...RULE_UP, active: false }), fetcher(new Map()));
  assert.equal(changed, true);
  assert.deepEqual(current.priceTargets, {});
});

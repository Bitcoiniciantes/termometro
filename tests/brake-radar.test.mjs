import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  analyzeBrakeRadar,
  assessH1Structure,
  closedBrakeKlines,
  computeBrakePct,
  emaLast,
  formatPreservedMinutes,
  parseBrakeKlines,
} from "../lib/brake-radar.ts";

const H1 = 60 * 60_000;
const M15 = 15 * 60_000;
const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

function bar(openTime, interval, open, high, low, close, volume = 10) {
  return { openTime, closeTime: openTime + interval - 1, open, high, low, close, volume };
}

function hourly(closes, highs, lows) {
  const paddedCloses = closes.length >= 30 ? closes : [...Array(30 - closes.length).fill(50), ...closes];
  const paddedHighs = highs ? [...Array(Math.max(0, paddedCloses.length - highs.length)).fill(50.5), ...highs] : undefined;
  const paddedLows = lows ? [...Array(Math.max(0, paddedCloses.length - lows.length)).fill(49.5), ...lows] : undefined;
  const start = NOW - paddedCloses.length * H1;
  return paddedCloses.map((close, index) => {
    const previous = index === 0 ? close : paddedCloses[index - 1];
    const high = Math.max(paddedHighs?.[index] ?? Math.max(previous, close) + 0.5, previous, close);
    const low = Math.min(paddedLows?.[index] ?? Math.min(previous, close) - 0.5, previous, close);
    return bar(start + index * H1, H1, previous, high, low, close);
  });
}

// Série de 15m com uma mínima explícita em `minimumIndex` e fechamentos
// desenhados para controlar retração/EMA.
function fifteenMinute({ minimumIndex = 13, lastClose = 95.04, newLowIndex = -1, newLow = null } = {}) {
  const start = NOW - 12 * 60 * 60_000;
  const points = [];
  for (let index = 0; index < 48; index++) {
    let close;
    if (index <= 12) close = 100;
    else if (index === minimumIndex) close = 93.2;
    else if (index < 24) close = 94;
    else if (index < 40) close = 94.6;
    else close = 95;
    points.push(close);
  }
  points[47] = lastClose;
  return points.map((close, index) => {
    const previous = index === 0 ? close : points[index - 1];
    let low = Math.min(previous, close) - 0.2;
    if (index === minimumIndex) low = 93;
    if (index === newLowIndex && newLow !== null) low = newLow;
    return bar(
      start + index * M15,
      M15,
      previous,
      Math.max(previous, close) + 0.2,
      low,
      close,
    );
  });
}

function baseScenario({ minimumIndex = 13, lastClose = 95.04, newLowIndex = -1, newLow = null } = {}) {
  const closes = [
    ...Array(12).fill(100),
    100, 98, 96, 94, 94, 100, 99, 97.5, 96, 95.8, 95.4, 95.04,
  ];
  const highs = [
    ...Array(12).fill(100.5),
    101, 99.8, 98, 96.2, 94.5, 100.4, 99.5, 98, 96.5, 96, 95.7, 95.5,
  ];
  const lows = [
    ...Array(12).fill(99.5),
    99, 97, 95, 93, 93.5, 94.6, 98.8, 97, 95.8, 95.4, 95.1, 94.9,
  ];
  return {
    h1: hourly(closes, highs, lows),
    m15: fifteenMinute({ minimumIndex, lastClose, newLowIndex, newLow }),
  };
}

// Série de 15m com fechamentos e mínimas explícitas por índice.
function m15Series(points, lowAt = {}) {
  const start = NOW - 12 * 60 * 60_000;
  return points.map((close, index) => {
    const previous = index === 0 ? close : points[index - 1];
    const low = lowAt[index] ?? Math.min(previous, close) - 0.2;
    return bar(
      start + index * M15,
      M15,
      previous,
      Math.max(previous, close, low) + 0.2,
      low,
      close,
    );
  });
}

function readingOf(scenario, fetchedAt = NOW - 1_000, now = NOW) {
  return analyzeBrakeRadar({ ...scenario, fetchedAt, now });
}

test("freio: fórmula, limites e não aplicabilidade", () => {
  assert.equal(computeBrakePct(-2, -0.5), 75);
  assert.equal(computeBrakePct(-2, 0), 100);
  assert.equal(computeBrakePct(-2, 1), 100);
  assert.equal(computeBrakePct(-2, -2), 0);
  assert.equal(computeBrakePct(-2, -3), 0);
  assert.equal(computeBrakePct(1, -0.5), null);
  assert.equal(computeBrakePct(0, -0.5), null);
  const clamped = computeBrakePct(-100, -0.1);
  assert.ok(clamped > 99 && clamped <= 100);
});

test("EMA(9): semeada pela SMA e null com dados insuficientes", () => {
  assert.equal(emaLast([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 9), 6);
  assert.equal(emaLast([1, 2, 3], 9), null);
});

test("estrutura 1H: limites de EMA e confirmação rápida", () => {
  const above = hourly(Array(30).fill(100));
  const aboveResult = assessH1Structure(above, NOW);
  assert.equal(aboveResult.ema20, 100);
  assert.equal(aboveResult.approved, true, "igualdade com EMA20 aprova");

  const belowCloses = [...Array(20).fill(110), ...Array(7).fill(90), 89, 90, 97];
  const belowLows = belowCloses.map((close) => close - 0.5);
  belowLows[28] = 88;
  belowLows[29] = 88;
  const below = hourly(belowCloses, undefined, belowLows);
  const result = assessH1Structure(below, NOW);
  assert.equal(result.belowEma20, true);
  assert.ok(below.at(-1).close > result.ema9);
  assert.equal(result.approved, true, "mínima igual à anterior é preservada");

  const equalEma9 = hourly([...Array(20).fill(110), ...Array(10).fill(90)]);
  const equalResult = assessH1Structure(equalEma9, NOW);
  assert.equal(equalResult.approved, false);
  assert.match(equalResult.reasons.join(";"), /EMA9/);
});

test("parse/closed: aceita strings e descarta o candle em formação", () => {
  const raw = [
    [NOW - 2 * M15, "100", "101", "99", "100.5", "12", NOW - M15 - 1],
    [NOW - M15, "100.5", "101.5", "100", "101", "8", NOW + M15 - 1],
  ];
  const parsed = parseBrakeKlines(raw);
  assert.equal(parsed.length, 2);
  const closed = closedBrakeKlines(parsed, NOW);
  assert.equal(closed.length, 1);
  assert.equal(closed[0].close, 100.5);
  assert.equal(parseBrakeKlines([[1, "100", "90", "95", "100", "1", 2]]).length, 0, "high < low é inválido");
});

test("fundo preservado: formatação em minutos e horas", () => {
  assert.equal(formatPreservedMinutes(30), "30 min");
  assert.equal(formatPreservedMinutes(60), "1h");
  assert.equal(formatPreservedMinutes(75), "1h 15m");
  assert.equal(formatPreservedMinutes(null), "—");
});

test("REAÇÃO CONFIRMADA: cinco critérios liberam DCA 1", () => {
  const reading = readingOf(baseScenario());
  assert.equal(reading.state, "REACTION");
  assert.equal(reading.label, "REAÇÃO CONFIRMADA");
  assert.equal(reading.tone, "green");
  assert.equal(reading.badge, "DCA 1 LIBERADO");
  assert.equal(reading.hasDrop, true);
  assert.ok(reading.dropPct < -1.5);
  assert.ok(Math.abs(reading.previousReturnPct - -4) < 1e-9);
  assert.ok(Math.abs(reading.recentReturnPct - -1) < 1e-9);
  assert.ok(Math.abs(reading.brakePct - 75) < 1e-9);
  assert.ok(reading.candlesWithoutNewLow >= 4);
  assert.ok(reading.preservedMinutes >= 60);
  assert.ok(reading.retracementPct >= 20);
  assert.ok(reading.lastClose15m > reading.ema9);
  assert.equal(reading.barMetric, "recovery");
  assert.ok(Math.abs(reading.targetDcaPrice - 94.6) < 1e-9);
  assert.match(reading.action, /DCA 1 LIBERADO/);
  assert.match(reading.reason, /Reação inicial identificada/);
});

test("filtro 1H: acima ou igual à EMA20 não bloqueia os cinco critérios", () => {
  const reading = readingOf(baseScenario());
  assert.equal(reading.state, "REACTION");
  assert.equal(reading.badge, "DCA 1 LIBERADO");
  assert.equal(reading.structure1hAvailable, true);
  assert.equal(reading.structure1hApproved, true);
});

function setLastHourly(scenario, changes) {
  const index = scenario.h1.length - 1;
  scenario.h1[index] = { ...scenario.h1[index], ...changes, high: Math.max(changes.high ?? scenario.h1[index].high, changes.close ?? scenario.h1[index].close), low: Math.min(changes.low ?? scenario.h1[index].low, changes.close ?? scenario.h1[index].close) };
}

function makeLastHourBelowEma20(scenario) {
  for (let index = 0; index < 6; index++) {
    scenario.h1[index] = { ...scenario.h1[index], open: 110, high: 110.5, low: 109.5, close: 110 };
  }
}

test("filtro 1H: renovação da mínima bloqueia e informa o motivo", () => {
  const scenario = baseScenario();
  makeLastHourBelowEma20(scenario);
  const last = scenario.h1.at(-1);
  const previous = scenario.h1.at(-2);
  setLastHourly(scenario, { close: Math.max(last.close, previous.close + 1), low: previous.low - 0.1 });
  const reading = readingOf(scenario);
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.badge, "DCA BLOQUEADO — ESTRUTURA 1H");
  assert.match(reading.reason, /renovação da mínima horária/);
});

test("filtro 1H: igualdade com EMA9 e fechamento anterior bloqueia", () => {
  const scenario = baseScenario();
  makeLastHourBelowEma20(scenario);
  const lastIndex = scenario.h1.length - 1;
  const previous = scenario.h1[lastIndex - 1];
  const close = previous.close;
  setLastHourly(scenario, { close, low: previous.low });
  const reading = readingOf(scenario);
  assert.equal(reading.state, "REBOUND");
  assert.match(reading.reason, /fechamento não ascendente/);
});

test("QUEDA DESACELERANDO: freio ≥25% sem repique relevante", () => {
  const reading = readingOf(baseScenario({ lastClose: 94 }));
  assert.equal(reading.state, "SLOWING");
  assert.equal(reading.label, "QUEDA DESACELERANDO");
  assert.equal(reading.tone, "amber");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.hasDrop, true);
  assert.ok(reading.brakePct >= 25);
  assert.ok(reading.retracementPct < 15);
  assert.equal(reading.barMetric, "brake");
  assert.match(reading.action, /AGUARDAR/);
  assert.match(reading.reason, /Freio de/);
});

test("QUEDA ACELERANDO: vermelho só com velocidade aumentando", () => {
  const scenario = baseScenario({ lastClose: 94 });
  scenario.h1 = hourly(
    [...Array(12).fill(100), 100, 98, 96, 94, 94, 100, 99, 98, 99, 98, 96, 95.04],
    [...Array(12).fill(100.5), 101, 99.8, 98, 96.2, 94.5, 100.4, 99.5, 98.5, 99.5, 98.5, 96.5, 95.5],
    [...Array(12).fill(99.5), 99, 97, 95, 93, 93.5, 94.6, 98.8, 97.8, 98.8, 97.8, 95.8, 94.9],
  );
  const reading = readingOf(scenario);
  assert.equal(reading.state, "ACCELERATING");
  assert.equal(reading.label, "QUEDA ACELERANDO");
  assert.equal(reading.tone, "red");
  assert.equal(reading.badge, "NÃO INICIAR");
  assert.equal(reading.accelerating, true);
  assert.equal(reading.brakeApplicable, true);
  assert.equal(reading.brakePct, 0);
  assert.equal(reading.barMetric, "brake");
  assert.match(reading.action, /NÃO INICIAR DCA/);
  assert.match(reading.reason, /velocidade de queda aumentando/);
});

test("QUEDA SEM ESTABILIZAÇÃO: nova mínima recente sem aceleração", () => {
  const reading = readingOf(baseScenario({ lastClose: 92.8, newLowIndex: 46, newLow: 92.5 }));
  assert.equal(reading.state, "UNSTABLE");
  assert.equal(reading.label, "QUEDA SEM ESTABILIZAÇÃO");
  assert.equal(reading.tone, "red");
  assert.equal(reading.badge, "NÃO INICIAR");
  assert.equal(reading.accelerating, false);
  assert.equal(reading.preservedMinutes, 15);
  assert.equal(reading.barMetric, "brake");
  assert.match(reading.action, /NÃO INICIAR DCA/);
  assert.match(reading.reason, /nova mínima recente/);
});

test("REPIQUE EM OBSERVAÇÃO: 30 min de fundo preservado, sem DCA", () => {
  const closes = [...Array(18).fill(100), 99, 98, 96.5, 96.8, 96.9, 97];
  const lows = Array(24);
  lows[23] = 95.5;
  const points = Array(48).fill(96.5);
  points[45] = 95.7;
  points[46] = 96.6;
  points[47] = 97;
  const reading = readingOf({
    h1: hourly(closes, undefined, lows),
    m15: m15Series(points, { 45: 95.5 }),
  });
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.label, "REPIQUE EM OBSERVAÇÃO");
  assert.equal(reading.tone, "cyan");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.hasDrop, true);
  assert.equal(reading.preservedMinutes, 30);
  assert.ok(reading.retracementPct >= 15);
  assert.equal(reading.barMetric, "recovery");
  assert.ok(Math.abs(reading.targetDcaPrice - 96.5) < 1e-9);
  assert.match(reading.action, /AGUARDAR/);
  assert.match(reading.reason, /30 min/);
  assert.match(reading.reason, /Confirmação exige/);
});

test("REPIQUE EM OBSERVAÇÃO: retorno positivo sem queda relevante não libera DCA", () => {
  const closes = [...Array(18).fill(100), 100, 99.8, 100, 100.2, 100.4, 100.5];
  const reading = readingOf({
    h1: hourly(closes),
    m15: fifteenMinute({ lastClose: 100.5 }),
  });
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.label, "REPIQUE EM OBSERVAÇÃO");
  assert.equal(reading.tone, "cyan");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.hasDrop, false);
  assert.equal(reading.barMetric, "recovery");
  assert.match(reading.action, /AGUARDAR/);
  assert.match(reading.reason, /sem queda relevante/);
  assert.match(reading.reason, /sem gatilho de DCA/);
});

test("REPIQUE sem freio aplicável: recuperação não libera DCA", () => {
  const closes = [...Array(15).fill(100), 94, 95, 96, 96, 96, 96, 96.2, 96.4, 96.6];
  const reading = readingOf({
    h1: hourly(closes),
    m15: fifteenMinute({ lastClose: 96.6 }),
  });
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.tone, "cyan");
  assert.equal(reading.hasDrop, true);
  assert.equal(reading.brakeApplicable, false);
  assert.equal(reading.brakePct, null);
  assert.equal(reading.barMetric, "recovery");
  assert.match(reading.action, /AGUARDAR/);
  assert.doesNotMatch(reading.action, /DCA 1 LIBERADO/);
});

test("MERCADO LATERAL / SEM QUEDA: cinza, sem DCA", () => {
  const closes = Array(24).fill(100);
  const reading = readingOf({
    h1: hourly(closes, Array(24).fill(100.5), Array(24).fill(99.5)),
    m15: fifteenMinute({ lastClose: 100 }),
  });
  assert.equal(reading.state, "NO_DROP");
  assert.equal(reading.label, "MERCADO LATERAL / SEM QUEDA");
  assert.equal(reading.tone, "gray");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.hasDrop, false);
  assert.equal(reading.barMetric, "none");
  assert.match(reading.action, /AGUARDAR/);
  assert.match(reading.reason, /1,5%/);
  assert.match(reading.reason, /DCA de queda inativo/);
});

test("topo depois da mínima não cria uma queda artificial", () => {
  const closes = Array(24).fill(100);
  const highs = Array(24).fill(101);
  const lows = Array(24).fill(100);
  closes[12] = 100;
  highs[12] = 101;
  lows[12] = 80;
  closes[13] = 119.5;
  highs[13] = 120;
  lows[13] = 100;
  for (let index = 14; index < 24; index++) {
    closes[index] = 119.5;
    highs[index] = 120;
    lows[index] = 119;
  }
  const reading = readingOf({
    h1: hourly(closes, highs, lows),
    m15: fifteenMinute({ lastClose: 118 }),
  });
  assert.equal(reading.state, "NO_DROP");
  assert.equal(reading.label, "MERCADO LATERAL / SEM QUEDA");
  assert.ok(reading.dropPct > -1.5, "queda encontrada é apenas a oscilação normal pós-topo");
  assert.equal(reading.minimum12h, 100, "mínima anterior ao topo (80) não foi usada");
});

test("nova mínima inferior reinicia a contagem de 15m", () => {
  const reading = readingOf(baseScenario({ lastClose: 92.8, newLowIndex: 46, newLow: 92.5 }));
  assert.equal(reading.candlesWithoutNewLow, 1);
  assert.equal(reading.preservedMinutes, 15);
});

test("DADOS INDISPONÍVEIS: dados velhos, insuficientes, desalinhados ou em formação", () => {
  const stale = readingOf(baseScenario(), NOW - 2 * 60_000 - 1);
  assert.equal(stale.state, "UNAVAILABLE");
  assert.match(stale.action, /Aguardando atualização/);

  const short = baseScenario();
  short.h1 = short.h1.slice(-23);
  assert.equal(readingOf(short).state, "UNAVAILABLE");

  const gap = baseScenario();
  gap.m15 = gap.m15.filter((_, index) => index !== 20);
  assert.equal(readingOf(gap).state, "UNAVAILABLE");

  const misaligned = baseScenario();
  misaligned.m15 = misaligned.m15.map((candle) => ({
    ...candle,
    openTime: candle.openTime - H1,
    closeTime: candle.closeTime - H1,
  }));
  const misalignedReading = readingOf(misaligned);
  assert.equal(misalignedReading.state, "UNAVAILABLE");
  assert.match(misalignedReading.reason, /alinhamento temporal/);

  // Cenário real: a hora corrente ainda está aberta, então o último candle de
  // 15m é mais recente que o último de 1h. Isso é normal, não é desalinhamento.
  const skewed = baseScenario();
  skewed.h1 = skewed.h1.map((candle) => ({
    ...candle,
    openTime: candle.openTime - H1,
    closeTime: candle.closeTime - H1,
  }));
  const skewedReading = readingOf(skewed);
  assert.notEqual(skewedReading.state, "UNAVAILABLE", "defasagem normal de 1h não invalida");
  assert.equal(skewedReading.state, "REACTION");

  const forming = readingOf(baseScenario(), NOW - 60_000, NOW - 60_000);
  assert.equal(forming.state, "UNAVAILABLE");

  assert.equal(analyzeBrakeRadar({ h1: [], m15: [], fetchedAt: null, now: NOW }).state, "UNAVAILABLE");
});

test("filtro 1H: dados insuficientes, inválidos ou em formação bloqueiam nova liberação", () => {
  const short = baseScenario();
  short.h1 = short.h1.slice(-29);
  assert.equal(readingOf(short).badge, "DCA BLOQUEADO — DADOS 1H INSUFICIENTES");

  const invalid = baseScenario();
  invalid.h1[20] = { ...invalid.h1[20], openTime: invalid.h1[19].openTime };
  assert.equal(readingOf(invalid).state, "UNAVAILABLE");

  const forming = baseScenario();
  forming.h1[29] = { ...forming.h1[29], closeTime: NOW + 1 };
  assert.equal(readingOf(forming).state, "UNAVAILABLE");
});

test("filtro 1H: critérios originais pendentes preservam o bloqueio e diagnóstico originais", () => {
  const scenario = baseScenario({ lastClose: 94 });
  scenario.h1 = scenario.h1.slice(-29);
  const reading = readingOf(scenario);
  assert.equal(reading.state, "SLOWING");
  assert.equal(reading.badge, "AGUARDAR");
  assert.match(reading.reason, /Freio de/);
  assert.doesNotMatch(reading.reason, /Dados 1H/);
});

test("filtro 1H: recuperação após falha restaura a liberação original", () => {
  const scenario = baseScenario();
  const valid = scenario.h1;
  scenario.h1 = valid.slice(-29);
  assert.equal(readingOf(scenario).badge, "DCA BLOQUEADO — DADOS 1H INSUFICIENTES");
  scenario.h1 = valid;
  const recovered = readingOf(scenario);
  assert.equal(recovered.state, "REACTION");
  assert.equal(recovered.badge, "DCA 1 LIBERADO");
});

// ── Regressão: recuo moderado, filtro 1H e apresentação ─────────────────────

// Reprodução determinística do cenário reportado: queda de 2,4% (100 → 97,6),
// bloco anterior de +0,05% (freio não aplicável), recuo de −0,3% nos 3h,
// recuperação de 49% da amplitude, fundo preservado por 8h30 (34 candles de
// 15m) e fechamento abaixo da EMA(9) exibida.
function observedScenario({ lastH1Close = 98.776, lastM15Close = 98.776, approveH1 = false } = {}) {
  const closes = [
    ...Array(18).fill(99.8),
    99.6, 99.9, 99.2, 98.2, 98.9, 99.0237,
    99.2, 99.15, 99.0732, 99.0, 98.88, lastH1Close,
  ];
  const highs = [
    ...Array(18).fill(100.2),
    99.9, 100.0, 99.9, 99.25, 99.0, 99.1,
    99.3, 99.25, 99.2, 99.1, 99.05, 98.9,
  ];
  const lows = [
    ...Array(18).fill(99.4),
    99.2, 99.5, 99.0, 97.6, 98.0, 98.7,
    99.0, 99.0, 99.0, 98.85, 98.7, 98.65,
  ];
  // Aprovação do filtro 1H sem tocar nos insumos dos cinco critérios: apenas o
  // trecho anterior à janela de 12h (fora da queda e dos retornos) é rebaixado.
  if (approveH1) {
    for (let index = 0; index < 12; index++) {
      closes[index] = 96;
      highs[index] = 96.4;
      lows[index] = 95.6;
    }
  }
  const points = [
    99.50, 99.60, 99.70, 99.80, 99.90, 99.95, 99.90, 99.85,
    99.75, 99.60, 99.30, 98.80, 98.10, 97.75,
    97.85, 98.10, 98.40, 98.70, 98.90, 99.00, 99.05, 99.10, 99.12, 99.13,
    99.12, 99.10, 99.08, 99.06, 99.04, 99.02, 99.00, 98.98, 98.96, 98.94, 98.92, 98.90,
    99.10, 99.09, 99.08, 99.07, 99.05, 99.03, 99.02, 99.00, 98.97, 98.93, 98.87, lastM15Close,
  ];
  const lowAt = { 13: 97.6 };
  for (let index = 14; index < 48; index++) {
    lowAt[index] = Math.min(points[index - 1], points[index]) - 0.05;
  }
  return { h1: hourly(closes, highs, lows), m15: m15Series(points, lowAt) };
}

// Cinco critérios originais aprovados; somente a estrutura 1H é rebaixada
// (a alteração fica fora da janela de 24h usada pelos cálculos originais).
function blockedByH1Scenario() {
  const scenario = baseScenario();
  makeLastHourBelowEma20(scenario);
  return scenario;
}

test("cenário reportado: 49% de recuperação, −0,3% em 3h e filtro 1H reprovado", () => {
  const reading = readingOf(observedScenario());
  assert.ok(Math.abs(reading.dropPct + 2.4) < 1e-6, "queda acumulada de 2,4%");
  assert.ok(Math.abs(reading.recentReturnPct + 0.3) < 1e-4, "movimento 3H de −0,3%");
  assert.ok(Math.abs(reading.retracementPct - 49) < 1e-6, "recuperação de 49%");
  assert.equal(reading.preservedMinutes, 8 * 60 + 30, "fundo preservado por 8h30");
  assert.ok(reading.lastClose15m < reading.ema9, "fechamento abaixo da EMA9 exibida");

  // Cinco critérios originais: queda ✅, freio ❌, fundo ✅, retração ✅, EMA9 ❌.
  assert.equal(reading.hasDrop, true);
  assert.equal(reading.brakeApplicable, false);
  assert.equal(reading.brakePct, null);
  assert.ok(reading.candlesWithoutNewLow >= 4);
  assert.ok(reading.retracementPct >= 20);
  assert.equal(reading.recovery, true);

  // Filtro 1H disponível e reprovado.
  assert.equal(reading.structure1hAvailable, true);
  assert.equal(reading.structure1hApproved, false);
  assert.equal(reading.structure1hBelowEma20, true);

  // Repique preservado; DCA bloqueado pelos critérios originais, não pelo 1H.
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.label, "REPIQUE EM OBSERVAÇÃO");
  assert.equal(reading.tone, "cyan");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.barMetric, "recovery");
  assert.match(reading.action, /AGUARDAR/);
  assert.doesNotMatch(reading.action, /DCA 1 LIBERADO/);
  assert.match(reading.reason, /recuo recente de −0,3% é moderado/);
  assert.match(reading.reason, /não caracteriza retomada da queda/);
  assert.match(reading.reason, /freio aplicável de pelo menos 25%/);
});

test("repique com filtro 1H reprovado preserva o estado original", () => {
  const reading = readingOf(observedScenario());
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.badge, "AGUARDAR");
  assert.match(reading.reason, /Confirmação exige fechamento acima da EMA\(9\)/);
});

test("queda sem estabilização com filtro 1H reprovado mantém o risco", () => {
  const reading = readingOf(observedScenario({ lastH1Close: 98.18, lastM15Close: 98.18 }));
  assert.ok(reading.recentReturnPct <= -0.9, "recuo forte derruba o repique");
  assert.equal(reading.structure1hAvailable, true);
  assert.equal(reading.structure1hApproved, false);
  assert.equal(reading.state, "UNSTABLE");
  assert.equal(reading.label, "QUEDA SEM ESTABILIZAÇÃO");
  assert.equal(reading.tone, "red");
  assert.equal(reading.badge, "NÃO INICIAR");
  assert.equal(reading.barMetric, "none");
  assert.match(reading.action, /NÃO INICIAR DCA/);
  assert.match(reading.reason, /sem freio mensurável/);
  assert.match(reading.reason, /movimento recente de −0,9%/);
});

test("repique com filtro 1H aprovado mantém o DCA bloqueado pelos critérios originais", () => {
  const reading = readingOf(observedScenario({ approveH1: true }));
  assert.equal(reading.structure1hAvailable, true);
  assert.equal(reading.structure1hApproved, true);
  assert.equal(reading.structure1hBelowEma20, false);
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.barMetric, "recovery");
  assert.equal(reading.brakeApplicable, false);
  assert.ok(reading.lastClose15m < reading.ema9);
  assert.doesNotMatch(reading.action, /DCA 1 LIBERADO/);
});

test("cinco critérios aprovados com filtro 1H aprovado liberam DCA 1", () => {
  const reading = readingOf(baseScenario());
  assert.equal(reading.hasDrop, true);
  assert.equal(reading.brakeApplicable, true);
  assert.ok(reading.brakePct >= 25);
  assert.ok(reading.candlesWithoutNewLow >= 4);
  assert.ok(reading.retracementPct >= 20);
  assert.ok(reading.lastClose15m > reading.ema9);
  assert.equal(reading.structure1hApproved, true);
  assert.equal(reading.state, "REACTION");
  assert.equal(reading.badge, "DCA 1 LIBERADO");
  assert.equal(reading.barMetric, "recovery");
  assert.match(reading.action, /DCA 1 LIBERADO/);
});

test("cinco critérios aprovados com filtro 1H reprovado bloqueiam somente o DCA", () => {
  const baseline = readingOf(baseScenario());
  const reading = readingOf(blockedByH1Scenario());

  // O filtro não altera os cálculos originais.
  assert.equal(reading.hasDrop, baseline.hasDrop);
  assert.equal(reading.dropPct, baseline.dropPct);
  assert.equal(reading.previousReturnPct, baseline.previousReturnPct);
  assert.equal(reading.recentReturnPct, baseline.recentReturnPct);
  assert.equal(reading.brakePct, baseline.brakePct);
  assert.equal(reading.retracementPct, baseline.retracementPct);
  assert.equal(reading.preservedMinutes, baseline.preservedMinutes);

  assert.equal(reading.structure1hAvailable, true);
  assert.equal(reading.structure1hApproved, false);
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.badge, "DCA BLOQUEADO — ESTRUTURA 1H");
  assert.match(reading.reason, /renovação da mínima horária/);
  assert.match(reading.action, /AGUARDAR/);
  assert.doesNotMatch(reading.action, /DCA 1 LIBERADO/);
});

test("recuperação próxima de 50% com movimento 3H negativo não é autorização de compra", () => {
  const reading = readingOf(observedScenario());
  assert.ok(reading.retracementPct >= 45 && reading.retracementPct < 50);
  assert.ok(reading.recentReturnPct < 0);
  assert.equal(reading.state, "REBOUND");
  assert.equal(reading.badge, "AGUARDAR");
  assert.equal(reading.barMetric, "recovery");
  assert.doesNotMatch(reading.action, /DCA 1 LIBERADO/);
});

test("fundo preservado por 8h30 com fechamento abaixo da EMA9 não confirma reação", () => {
  const reading = readingOf(observedScenario());
  assert.equal(reading.candlesWithoutNewLow, 34);
  assert.equal(reading.preservedMinutes, 510);
  assert.ok(reading.lastClose15m < reading.ema9);
  assert.notEqual(reading.state, "REACTION");
  assert.equal(reading.badge, "AGUARDAR");
});

test("consistência entre estado, badge, diagnóstico e decisão final", () => {
  const cases = [
    {
      name: "reação",
      reading: readingOf(baseScenario()),
      state: "REACTION",
      badge: "DCA 1 LIBERADO",
      action: /DCA 1 LIBERADO/,
      metric: "recovery",
    },
    {
      name: "repique",
      reading: readingOf(observedScenario()),
      state: "REBOUND",
      badge: "AGUARDAR",
      action: /AGUARDAR/,
      metric: "recovery",
    },
    {
      name: "bloqueio 1H",
      reading: readingOf(blockedByH1Scenario()),
      state: "REBOUND",
      badge: "DCA BLOQUEADO — ESTRUTURA 1H",
      action: /AGUARDAR/,
      metric: "recovery",
    },
    {
      name: "queda",
      reading: readingOf(observedScenario({ lastH1Close: 98.18, lastM15Close: 98.18 })),
      state: "UNSTABLE",
      badge: "NÃO INICIAR",
      action: /NÃO INICIAR DCA/,
      metric: "none",
    },
  ];

  for (const item of cases) {
    assert.equal(item.reading.state, item.state, item.name);
    assert.equal(item.reading.badge, item.badge, item.name);
    assert.match(item.reading.action, item.action, item.name);
    assert.equal(item.reading.barMetric, item.metric, item.name);
    assert.ok(item.reading.reason.length > 20, `${item.name}: diagnóstico presente`);
    assert.equal(
      item.reading.badge === "DCA 1 LIBERADO",
      item.reading.state === "REACTION",
      `${item.name}: somente REACTION libera DCA`,
    );
    assert.doesNotMatch(item.reading.reason, /SEM MÉTRICA|INATIVO/, item.name);
  }
});

test("integração: radar de reversão preserva Caça-Fundos abaixo do NEXUS na home", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  assert.match(page, /import \{ BtcRadarReversal \} from "\.\/BtcRadarReversal"/);
  assert.match(page, /import "\.\/radar-reversal\.css"/);
  const nexus = page.indexOf("<ConfluencePanel");
  const radar = page.indexOf("<BtcRadarReversal currentPrice={allLivePrices.BTC} />");
  const alertPanel = page.indexOf('<article className="card alertPanelCard"');
  assert.ok(nexus >= 0 && radar > nexus && alertPanel > radar, "ordem NEXUS → Radar de Reversão → AlertPanel");

  const wrapper = await readFile(new URL("../app/BtcRadarReversal.tsx", import.meta.url), "utf8");
  assert.match(wrapper, /RADAR DE REVERSÃO/);
  assert.match(wrapper, /BRAKE_ASSETS/);
  assert.match(wrapper, /selectedSymbol/);
  assert.match(wrapper, /Promise\.allSettled/);
  assert.match(wrapper, /CAÇA-FUNDOS/);
  assert.match(wrapper, /CAÇA-TOPOS/);
  assert.match(wrapper, /<BtcBrakeRadar/);
  assert.match(wrapper, /<BtcTopRadar/);
  assert.match(wrapper, /fetchBrakeKlines/);

  const component = await readFile(new URL("../app/BtcBrakeRadar.tsx", import.meta.url), "utf8");
  assert.match(component, /RADAR DE FREIO DA QUEDA/);
  assert.match(component, /asset\.name/);
  assert.match(component, /brLiveQuote/);
  assert.match(component, /fmt24hChange/);
  assert.match(component, /brLiveChange/);
  assert.match(component, /MOVIMENTO RECENTE \(3H\)/);
  assert.match(component, /RECUPERAÇÃO DA QUEDA/);
  assert.match(component, /FUNDO PRESERVADO/);
  assert.match(component, /Nível 20%/);
  assert.match(component, /RECUPERAÇÃO DA AMPLITUDE \(%\)/);
  assert.match(component, /FREIO DA QUEDA \(%\)/);
  assert.match(component, /FREIO NÃO APLICÁVEL/);
  assert.doesNotMatch(component, /SEM MÉTRICA/);
  assert.doesNotMatch(component, /INATIVO/);
  assert.match(component, /brBarAreaEmpty/);
  assert.match(component, /brPreserveTrack/);
  assert.match(component, /externalSnapshot/);

  const css = await readFile(new URL("../app/brake-radar.css", import.meta.url), "utf8");
  assert.match(css, /tone-cyan/);
  assert.match(css, /#38bdf8/);
  assert.match(css, /#94a3b8/);
  assert.match(css, /--radar-bg/);
  assert.match(css, /#251116/);
  assert.match(css, /#10291f/);
  assert.match(css, /brBarAreaEmpty/);
  assert.match(css, /brLiveQuoteValues/);
});

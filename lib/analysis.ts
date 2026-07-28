import type { Analysis, Candle, ExtremeReading, MarketData, Signal } from "./types";

export const avg = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

export function wilderRsi(values: number[], length = 14) {
  if (values.length < length + 2) return null;
  const series = wilderRsiSeries(values, length);
  const readings = series.filter((value): value is number => value !== null);
  return { value: readings.at(-1)!, previous: readings.at(-2) ?? readings.at(-1)! };
}

function wilderRsiSeries(values: number[], length = 14) {
  const series: Array<number | null> = Array(values.length).fill(null);
  if (values.length < length + 1) return series;
  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = avg(changes.slice(0, length).map((value) => Math.max(value, 0)));
  let loss = avg(changes.slice(0, length).map((value) => Math.max(-value, 0)));
  const calculate = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
  series[length] = calculate();
  for (let index = length; index < changes.length; index += 1) {
    const change = changes[index];
    gain = (gain * (length - 1) + Math.max(change, 0)) / length;
    loss = (loss * (length - 1) + Math.max(-change, 0)) / length;
    series[index + 1] = calculate();
  }
  return series;
}

function trueRanges(candles: Candle[]) {
  return candles.map((candle, index) =>
    index === 0
      ? candle.high - candle.low
      : Math.max(
          candle.high - candle.low,
          Math.abs(candle.high - candles[index - 1].close),
          Math.abs(candle.low - candles[index - 1].close),
        ),
  );
}

export function wilderAdx(candles: Candle[], length = 14) {
  if (candles.length < length * 2 + 1) return null;
  const tr = trueRanges(candles);
  const plusDm = candles.map((candle, index) => {
    if (!index) return 0;
    const up = candle.high - candles[index - 1].high;
    const down = candles[index - 1].low - candle.low;
    return up > down && up > 0 ? up : 0;
  });
  const minusDm = candles.map((candle, index) => {
    if (!index) return 0;
    const up = candle.high - candles[index - 1].high;
    const down = candles[index - 1].low - candle.low;
    return down > up && down > 0 ? down : 0;
  });
  let smoothedTr = tr.slice(1, length + 1).reduce((sum, value) => sum + value, 0);
  let smoothedPlus = plusDm.slice(1, length + 1).reduce((sum, value) => sum + value, 0);
  let smoothedMinus = minusDm.slice(1, length + 1).reduce((sum, value) => sum + value, 0);
  const dxValues: number[] = [];
  for (let index = length; index < candles.length; index += 1) {
    if (index > length) {
      smoothedTr = smoothedTr - smoothedTr / length + tr[index];
      smoothedPlus = smoothedPlus - smoothedPlus / length + plusDm[index];
      smoothedMinus = smoothedMinus - smoothedMinus / length + minusDm[index];
    }
    const plusDi = smoothedTr ? (100 * smoothedPlus) / smoothedTr : 0;
    const minusDi = smoothedTr ? (100 * smoothedMinus) / smoothedTr : 0;
    const total = plusDi + minusDi;
    dxValues.push(total ? (100 * Math.abs(plusDi - minusDi)) / total : 0);
  }
  let adx = avg(dxValues.slice(0, length));
  for (const dx of dxValues.slice(length)) adx = (adx * (length - 1) + dx) / length;
  return adx;
}

function findDivergence(candles: Candle[], closes: number[]) {
  const rsiSeries = wilderRsiSeries(closes);
  const start = Math.max(2, candles.length - 45);
  const end = candles.length - 2;
  const highs: number[] = [];
  const lows: number[] = [];
  for (let index = start; index < end; index += 1) {
    const neighbors = [index - 2, index - 1, index + 1, index + 2];
    if (neighbors.every((other) => candles[index].high > candles[other].high)) highs.push(index);
    if (neighbors.every((other) => candles[index].low < candles[other].low)) lows.push(index);
  }
  const [previousHigh, latestHigh] = highs.slice(-2);
  if (
    previousHigh !== undefined && latestHigh !== undefined &&
    candles[latestHigh].high > candles[previousHigh].high * 1.002 &&
    rsiSeries[latestHigh] !== null && rsiSeries[previousHigh] !== null &&
    rsiSeries[latestHigh]! < rsiSeries[previousHigh]! - 3
  ) return "bearish" as const;
  const [previousLow, latestLow] = lows.slice(-2);
  if (
    previousLow !== undefined && latestLow !== undefined &&
    candles[latestLow].low < candles[previousLow].low * 0.998 &&
    rsiSeries[latestLow] !== null && rsiSeries[previousLow] !== null &&
    rsiSeries[latestLow]! > rsiSeries[previousLow]! + 3
  ) return "bullish" as const;
  return null;
}

function classifyExtreme(args: {
  rsi: number;
  adx: number;
  atrDistance: number;
  divergence: "bullish" | "bearish" | null;
  uptrend: boolean;
}): ExtremeReading {
  const { rsi, adx, atrDistance, divergence, uptrend } = args;
  const strongTrend = adx >= 25;
  const stretched = Math.abs(atrDistance) >= 2;
  const metrics = `RSI ${rsi.toFixed(1)} • ADX ${adx.toFixed(1)} • distância ${atrDistance.toFixed(1)} ATR da MM20.`;
  if (rsi >= 70 && divergence === "bearish") return {
    status: "ALERTA DE EXAUSTÃO", summary: "Sobrecompra com divergência de baixa confirmada",
    detail: `${metrics} O preço fez topo mais alto, mas o RSI perdeu força. Aguarde confirmação no preço.`,
    tone: "negative", rsi, adx, atrDistance, divergence,
  };
  if (rsi <= 30 && divergence === "bullish") return {
    status: "POSSÍVEL REAÇÃO", summary: "Sobrevenda com divergência de alta confirmada",
    detail: `${metrics} O preço fez fundo mais baixo, mas o RSI ganhou força. Ainda exige confirmação no preço.`,
    tone: "positive", rsi, adx, atrDistance, divergence,
  };
  if (rsi >= 70 && strongTrend && uptrend) return {
    status: "EXTREMO COM TENDÊNCIA", summary: "Sobrecompra sustentada por tendência forte",
    detail: `${metrics} Evite interpretar o RSI alto isoladamente como sinal de venda.`,
    tone: "positive", rsi, adx, atrDistance, divergence,
  };
  if (rsi <= 30 && strongTrend && !uptrend) return {
    status: "EXTREMO COM TENDÊNCIA", summary: "Sobrevenda dentro de tendência forte de baixa",
    detail: `${metrics} O ativo segue pressionado; RSI baixo sozinho não confirma fundo.`,
    tone: "negative", rsi, adx, atrDistance, divergence,
  };
  if (rsi >= 70 || atrDistance >= 2) return {
    status: stretched ? "PREÇO ESTICADO" : "SOBRECOMPRA",
    summary: strongTrend ? "Movimento elevado, ainda com força de tendência" : "Extremo de alta em mercado sem tendência forte",
    detail: `${metrics} Em tendência fraca, extremos têm maior chance de retornar à média.`,
    tone: "warning", rsi, adx, atrDistance, divergence,
  };
  if (rsi <= 30 || atrDistance <= -2) return {
    status: stretched ? "PREÇO ESTICADO" : "SOBREVENDA",
    summary: strongTrend ? "Movimento deprimido, ainda com força de tendência" : "Extremo de baixa em mercado sem tendência forte",
    detail: `${metrics} Em tendência fraca, extremos têm maior chance de retornar à média.`,
    tone: "warning", rsi, adx, atrDistance, divergence,
  };
  if (divergence) {
    const bullish = divergence === "bullish";
    return {
      status: bullish ? "DIVERGÊNCIA DE ALTA" : "DIVERGÊNCIA DE BAIXA",
      summary: bullish ? "Momentum melhora apesar de novo fundo no preço" : "Momentum enfraquece apesar de novo topo no preço",
      detail: `${metrics} A divergência usa somente pivôs já confirmados e funciona como alerta, não como entrada.`,
      tone: bullish ? "positive" : "negative", rsi, adx, atrDistance, divergence,
    };
  }
  return {
    status: "SEM EXTREMO",
    summary: strongTrend ? `Tendência ${uptrend ? "de alta" : "de baixa"} com força` : "Preço e momentum dentro da faixa normal",
    detail: `${metrics} Não há combinação suficiente para indicar exaustão neste período.`,
    tone: "neutral", rsi, adx, atrDistance, divergence,
  };
}

export function scoreLabel(score: number) {
  if (score >= 55) return "COMPRA FORTE";
  if (score >= 20) return "COMPRA";
  if (score > -20) return "NEUTRO";
  if (score > -55) return "VENDA";
  return "VENDA FORTE";
}

export function analyze(data: MarketData | null): Analysis | null {
  if (!data || data.candles.length < 55) return null;
  const candles = data.candles;
  const closes = candles.map((candle) => candle.close);
  const last = closes.at(-1)!;
  const sma20 = avg(closes.slice(-20));
  const sma50 = avg(closes.slice(-50));
  const rsi = wilderRsi(closes)?.value ?? 50;
  const vol20 = avg(candles.slice(-21, -1).map((candle) => candle.volume));
  const volRatio = candles.at(-1)!.volume / Math.max(vol20, 1);
  const atrAbsolute = avg(trueRanges(candles).slice(-14));
  const atr = (atrAbsolute / last) * 100;
  const adx = wilderAdx(candles) ?? 0;
  const atrDistance = atrAbsolute ? (last - sma20) / atrAbsolute : 0;
  const divergence = findDivergence(candles, closes);
  const highs = candles.slice(-20).map((candle) => candle.high);
  const lows = candles.slice(-20).map((candle) => candle.low);
  const fullRange = Math.max(...highs) - Math.min(...lows);
  const recentRange = Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10));
  const compression = fullRange > 0 ? recentRange / fullRange : 1;
  const ascending = avg(lows.slice(-5)) > avg(lows.slice(0, 5));
  const uptrend = sma20 > sma50;
  const strongTrend = adx >= 25;
  const trend = uptrend ? 18 : -18;
  const momentum = rsi >= 55 && rsi <= 70 ? 12 : rsi > 70 ? (strongTrend && uptrend ? 8 : -6) : rsi < 30 ? (strongTrend && !uptrend ? -8 : 6) : rsi < 40 ? -8 : 2;
  const volume = volRatio >= 1.25 ? 12 : volRatio < 0.7 ? -5 : 3;
  const pattern = compression < 0.72 ? (ascending ? 18 : 8) : 0;
  const risk = atr > 7 ? -12 : atr > 4 ? -6 : 4;
  const scoringSignals: Signal[] = [
    { title: "Tendência primária", summary: `MM20 ${uptrend ? "acima" : "abaixo"} da MM50`, score: trend, group: "Tendência", detail: `MM20: ${sma20.toFixed(2)} • MM50: ${sma50.toFixed(2)}.` },
    { title: "Compressão de preço", summary: compression < 0.72 ? (ascending ? "Estrutura ascendente detectada" : "Amplitude em contração") : "Sem compressão relevante", score: pattern, group: "Padrão", detail: `A amplitude recente equivale a ${(compression * 100).toFixed(0)}% da janela de 20 candles.` },
    { title: "Força relativa", summary: `RSI em ${rsi.toFixed(1)}`, score: momentum, group: "Momentum", detail: `RSI de Wilder em 14 períodos, contextualizado por ADX ${adx.toFixed(1)}.` },
    { title: "Confirmação por volume", summary: `${volRatio.toFixed(2)}× a média`, score: volume, group: "Volume", detail: "Volume do candle atual comparado à média dos 20 anteriores." },
    { title: "Risco por volatilidade", summary: `ATR em ${atr.toFixed(2)}%`, score: risk, group: "Risco", detail: "ATR de 14 períodos normalizado pelo preço atual." },
  ];
  const contextSignals: Signal[] = [
    {
      title: "Força da tendência (ADX)",
      summary: `ADX em ${adx.toFixed(1)} • tendência ${strongTrend ? "forte" : "fraca"}`,
      score: 0,
      group: "Contexto",
      context: true,
      detail: "O ADX mede a força da tendência, não sua direção. Acima de 25, a tendência tende a sustentar extremos de RSI por mais tempo.",
    },
    {
      title: "Divergência RSI–preço",
      summary: divergence === "bullish" ? "Divergência de alta confirmada" : divergence === "bearish" ? "Divergência de baixa confirmada" : "Nenhuma divergência confirmada",
      score: 0,
      group: "Contexto",
      context: true,
      detail: divergence === "bullish" ? "O preço fez um fundo mais baixo, mas o RSI ganhou força. É um alerta de possível reação, ainda sem garantir reversão." : divergence === "bearish" ? "O preço fez um topo mais alto, mas o RSI perdeu força. É um alerta de possível exaustão, ainda sem garantir reversão." : "A comparação dos últimos pivôs confirmados não mostrou perda relevante de força entre preço e RSI.",
    },
    {
      title: "Distância da média (ATR)",
      summary: `${atrDistance >= 0 ? "+" : ""}${atrDistance.toFixed(1)} ATR da MM20 • ${Math.abs(atrDistance) >= 2 ? "preço esticado" : "faixa normal"}`,
      score: 0,
      group: "Contexto",
      context: true,
      detail: "O ATR representa a oscilação normal do ativo. Uma distância de 2 ATR ou mais da MM20 indica preço esticado, comparável entre ativos com volatilidades diferentes.",
    },
  ];
  const signals = [...scoringSignals, ...contextSignals];
  const score = Math.max(-100, Math.min(100, scoringSignals.reduce((sum, signal) => sum + signal.score, 0)));
  const agreement = scoringSignals.filter((signal) => Math.sign(signal.score) === Math.sign(score)).length / scoringSignals.length;
  return {
    signals,
    score,
    confidence: Math.round(55 + agreement * 35),
    change: (last / closes.at(-2)! - 1) * 100,
    extreme: classifyExtreme({ rsi, adx, atrDistance, divergence, uptrend }),
  };
}

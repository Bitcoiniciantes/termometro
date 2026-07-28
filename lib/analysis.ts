import type { Analysis, MarketData, Signal } from "./types";

export const avg = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

export function wilderRsi(values: number[], length = 14) {
  if (values.length < length + 2) return null;

  const changes = values.slice(1).map((value, index) => value - values[index]);
  let gain = avg(changes.slice(0, length).map((value) => Math.max(value, 0)));
  let loss = avg(changes.slice(0, length).map((value) => Math.max(-value, 0)));
  const readings: number[] = [];
  const calculate = () => (loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));

  readings.push(calculate());
  for (const change of changes.slice(length)) {
    gain = (gain * (length - 1) + Math.max(change, 0)) / length;
    loss = (loss * (length - 1) + Math.max(-change, 0)) / length;
    readings.push(calculate());
  }

  return {
    value: readings.at(-1)!,
    previous: readings.at(-2) ?? readings.at(-1)!,
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
  const deltas = closes
    .slice(-15)
    .map((close, index) => close - closes[closes.length - 16 + index]);
  const gains = avg(deltas.map((delta) => Math.max(delta, 0)));
  const losses = avg(deltas.map((delta) => Math.max(-delta, 0)));
  const rsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  const vol20 = avg(candles.slice(-21, -1).map((candle) => candle.volume));
  const volRatio = candles.at(-1)!.volume / Math.max(vol20, 1);
  const atr =
    (avg(
      candles.slice(-14).map((candle, index) =>
        index
          ? Math.max(
              candle.high - candle.low,
              Math.abs(candle.high - candles[candles.length - 15 + index].close),
              Math.abs(candle.low - candles[candles.length - 15 + index].close),
            )
          : candle.high - candle.low,
      ),
    ) /
      last) *
    100;
  const highs = candles.slice(-20).map((candle) => candle.high);
  const lows = candles.slice(-20).map((candle) => candle.low);
  const fullRange = Math.max(...highs) - Math.min(...lows);
  const recentRange = Math.max(...highs.slice(-10)) - Math.min(...lows.slice(-10));
  const compression = fullRange > 0 ? recentRange / fullRange : 1;
  const ascending = avg(lows.slice(-5)) > avg(lows.slice(0, 5));

  const trend = sma20 > sma50 ? 18 : -18;
  const momentum = rsi >= 55 && rsi <= 70 ? 12 : rsi > 70 ? -6 : rsi < 40 ? -12 : 2;
  const volume = volRatio >= 1.25 ? 12 : volRatio < 0.7 ? -5 : 3;
  const pattern = compression < 0.72 ? (ascending ? 18 : 8) : 0;
  const risk = atr > 7 ? -12 : atr > 4 ? -6 : 4;

  const signals: Signal[] = [
    {
      title: "Tendência primária",
      summary: `MM20 ${sma20 > sma50 ? "acima" : "abaixo"} da MM50`,
      score: trend,
      group: "Tendência",
      detail: `MM20: ${sma20.toFixed(2)} • MM50: ${sma50.toFixed(2)}.`,
    },
    {
      title: "Compressão de preço",
      summary:
        compression < 0.72
          ? ascending
            ? "Estrutura ascendente detectada"
            : "Amplitude em contração"
          : "Sem compressão relevante",
      score: pattern,
      group: "Padrão",
      detail: `A amplitude recente equivale a ${(compression * 100).toFixed(0)}% da janela de 20 candles.`,
    },
    {
      title: "Força relativa",
      summary: `RSI em ${rsi.toFixed(1)}`,
      score: momentum,
      group: "Momentum",
      detail: "RSI de 14 períodos calculado pelos fechamentos reais.",
    },
    {
      title: "Confirmação por volume",
      summary: `${volRatio.toFixed(2)}× a média`,
      score: volume,
      group: "Volume",
      detail: "Volume do candle atual comparado à média dos 20 anteriores.",
    },
    {
      title: "Risco por volatilidade",
      summary: `ATR em ${atr.toFixed(2)}%`,
      score: risk,
      group: "Risco",
      detail: "ATR de 14 períodos normalizado pelo preço atual.",
    },
  ];

  const score = Math.max(
    -100,
    Math.min(100, signals.reduce((sum, signal) => sum + signal.score, 0)),
  );
  const agreement =
    signals.filter((signal) => Math.sign(signal.score) === Math.sign(score)).length /
    signals.length;

  return {
    signals,
    score,
    confidence: Math.round(55 + agreement * 35),
    change: (last / closes.at(-2)! - 1) * 100,
  };
}

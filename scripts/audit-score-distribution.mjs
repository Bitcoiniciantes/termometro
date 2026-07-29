import { readFile } from "node:fs/promises";
import { analyze } from "../lib/analysis.ts";

const files = ["mstr", "prata", "cobre", "uranio"];
const periods = ["1H", "4H", "1D", "1S", "1M"];
const avg = (values) => values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);

function oldScore(candles) {
  if (candles.length < 55) return null;
  const closes = candles.map((candle) => candle.close);
  const last = closes.at(-1);
  const sma20 = avg(closes.slice(-20));
  const sma50 = avg(closes.slice(-50));
  const deltas = closes.slice(-15).map((close, index) => close - closes[closes.length - 16 + index]);
  const gains = avg(deltas.map((delta) => Math.max(delta, 0)));
  const losses = avg(deltas.map((delta) => Math.max(-delta, 0)));
  const rsi = losses === 0 ? 100 : 100 - 100 / (1 + gains / losses);
  const vol20 = avg(candles.slice(-21, -1).map((candle) => candle.volume));
  const volRatio = candles.at(-1).volume / Math.max(vol20, 1);
  const atr = avg(
    candles.slice(-14).map((candle, index) =>
      index
        ? Math.max(
            candle.high - candle.low,
            Math.abs(candle.high - candles[candles.length - 15 + index].close),
            Math.abs(candle.low - candles[candles.length - 15 + index].close),
          )
        : candle.high - candle.low,
    ),
  ) / last * 100;
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
  return trend + momentum + volume + pattern + risk;
}

function summarize(scores) {
  const counts = new Map();
  for (const score of scores) counts.set(score, (counts.get(score) ?? 0) + 1);
  const repeatedPairs = [...counts.values()].reduce((sum, count) => sum + count * (count - 1) / 2, 0);
  const totalPairs = scores.length * (scores.length - 1) / 2;
  const peaks = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    samples: scores.length,
    uniqueScores: counts.size,
    collisionRate: totalPairs ? repeatedPairs / totalPairs : 0,
    peaks,
  };
}

const oldScores = [];
const newScores = [];
for (const file of files) {
  const snapshot = JSON.parse(await readFile(new URL(`../public/data/${file}.json`, import.meta.url), "utf8"));
  for (const period of periods) {
    const candles = snapshot.periods[period];
    for (let length = 55; length <= candles.length; length += 1) {
      const window = candles.slice(0, length);
      oldScores.push(oldScore(window));
      const reading = analyze({
        asset: snapshot.asset,
        pair: snapshot.marketSymbol,
        source: snapshot.source,
        updatedAt: snapshot.updatedAt,
        period,
        candles: window,
      }, Number.POSITIVE_INFINITY);
      if (reading) newScores.push(reading.score);
    }
  }
}

const oldSummary = summarize(oldScores.filter(Number.isFinite));
const newSummary = summarize(newScores);
console.log("AUDITORIA DE DISTRIBUIÇÃO DAS NOTAS");
console.log(`Amostras históricas: ${newSummary.samples}`);
console.log(`Sistema anterior: ${oldSummary.uniqueScores} notas distintas • colisão ${(oldSummary.collisionRate * 100).toFixed(1)}% • picos ${oldSummary.peaks.map(([score, count]) => `${score} (${count}×)`).join(", ")}`);
console.log(`Sistema gradual: ${newSummary.uniqueScores} notas distintas • colisão ${(newSummary.collisionRate * 100).toFixed(1)}% • picos ${newSummary.peaks.map(([score, count]) => `${score} (${count}×)`).join(", ")}`);
if (newSummary.collisionRate >= oldSummary.collisionRate) {
  throw new Error("A pontuação gradual não reduziu os empates históricos");
}

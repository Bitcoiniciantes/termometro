import { mkdir, writeFile } from "node:fs/promises";

const endpoint = "https://query2.finance.yahoo.com/v8/finance/chart/MSTR";

async function fetchCandles(interval, range) {
  const url = new URL(endpoint);
  url.searchParams.set("interval", interval);
  url.searchParams.set("range", range);
  url.searchParams.set("includePrePost", "false");
  url.searchParams.set("events", "div,splits");
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; TermometroMarketData/1.0)", Accept: "application/json" } });
  if (!response.ok) throw new Error(`Yahoo Finance respondeu ${response.status}`);
  const payload = await response.json();
  const result = payload?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  if (!result?.timestamp || !quote) throw new Error("Resposta do MSTR sem candles");
  return result.timestamp.flatMap((timestamp, index) => {
    const open = quote.open?.[index], high = quote.high?.[index], low = quote.low?.[index], close = quote.close?.[index], volume = quote.volume?.[index];
    if (![open, high, low, close, volume].every(Number.isFinite)) return [];
    return [{ time: timestamp * 1000, open, high, low, close, volume }];
  });
}

function aggregateFourHours(hourly) {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
  const days = new Map();
  for (const candle of hourly) {
    const day = formatter.format(new Date(candle.time));
    const list = days.get(day) ?? [];
    list.push(candle);
    days.set(day, list);
  }
  return [...days.values()].flatMap((candles) => {
    const result = [];
    for (let index = 0; index < candles.length; index += 4) {
      const group = candles.slice(index, index + 4);
      result.push({ time: group[0].time, open: group[0].open, high: Math.max(...group.map((item) => item.high)), low: Math.min(...group.map((item) => item.low)), close: group.at(-1).close, volume: group.reduce((sum, item) => sum + item.volume, 0) });
    }
    return result;
  });
}

const [hourly, daily, weekly, monthly] = await Promise.all([
  fetchCandles("1h", "3mo"),
  fetchCandles("1d", "1y"),
  fetchCandles("1wk", "5y"),
  fetchCandles("1mo", "max"),
]);
const output = {
  asset: "MSTR", currency: "USD", source: "Yahoo Finance • atualização programada", updatedAt: Date.now(),
  periods: { "1H": hourly.slice(-120), "4H": aggregateFourHours(hourly).slice(-120), "1D": daily.slice(-120), "1S": weekly.slice(-120), "1M": monthly.slice(-120) },
};
for (const [period, candles] of Object.entries(output.periods)) if (candles.length < 55) throw new Error(`MSTR sem histórico suficiente em ${period}`);
await mkdir(new URL("../public/data/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/data/mstr.json", import.meta.url), JSON.stringify(output));
console.log(Object.entries(output.periods).map(([period, candles]) => `${period}: ${candles.length}`).join(" • "));

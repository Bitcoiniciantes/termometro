import { NextRequest, NextResponse } from "next/server";

const allowed = new Set(["BTC", "ETH", "LINK", "AVAX", "SOL"]);
const intervals: Record<string, string> = { "1H": "1h", "4H": "4h", "1D": "1d", "1S": "1w" };

export async function GET(request: NextRequest) {
  const asset = (request.nextUrl.searchParams.get("asset") || "BTC").toUpperCase();
  const period = request.nextUrl.searchParams.get("period") || "1D";
  if (!allowed.has(asset)) return NextResponse.json({ error: "Ativo ainda não disponível na fonte cripto." }, { status: 404 });
  const url = new URL("https://data-api.binance.vision/api/v3/klines");
  url.searchParams.set("symbol", `${asset}USDT`);
  url.searchParams.set("interval", intervals[period] || "1d");
  url.searchParams.set("limit", "120");
  try {
    const response = await fetch(url, { headers: { Accept: "application/json" }, next: { revalidate: 60 } });
    if (!response.ok) throw new Error(`Fonte respondeu ${response.status}`);
    const rows = await response.json() as (string | number)[][];
    const candles = rows.map(row => ({ time: Number(row[0]), open: Number(row[1]), high: Number(row[2]), low: Number(row[3]), close: Number(row[4]), volume: Number(row[5]) }));
    return NextResponse.json({ asset, pair: `${asset}/USDT`, interval: intervals[period] || "1d", source: "Binance Public Market Data", updatedAt: Date.now(), candles });
  } catch {
    return NextResponse.json({ error: "A fonte de mercado está temporariamente indisponível." }, { status: 502 });
  }
}
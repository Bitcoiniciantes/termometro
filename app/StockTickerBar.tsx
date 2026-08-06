"use client";
import { useEffect, useState } from "react";

const TICKERS = [
  "QUBT","QBTS","NVDA","AMD","GOOGL","META","AAPL","SNDK",
  "GLW","MSTR","CRCL","MP","RIO","BHP","SPCX","TSLA"
];

const WORKER = "https://bitcoiniciantes-ia.bitcoiniciantes.workers.dev/api/quotes";
const WINDOW = "24h";

type Quote = { symbol: string; price: number; changePct: number };

export default function StockTickerBar({ onSelect }: { onSelect?: (asset: string) => void }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);

  const fetchQuotes = () => {
    fetch(`${WORKER}?assets=${encodeURIComponent(TICKERS.join(","))}&window=${WINDOW}`, { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data || !Array.isArray(data.quotes)) return;
        setQuotes(data.quotes.map((q: { symbol: string; price: number; changePct: number }) => ({
          symbol: q.symbol,
          price: q.price,
          changePct: q.changePct,
        })));
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchQuotes();
    const timer = window.setInterval(fetchQuotes, 5000);
    return () => window.clearInterval(timer);
  }, []);

  if (!quotes.length) return null;

  const renderItems = () =>
    quotes.map(q => {
      const pct = q.changePct;
      const cls = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
      return (
        <button
          key={q.symbol}
          type="button"
          className={`stockTickerItem ${cls}`}
          onClick={() => onSelect?.(q.symbol)}
          title={`Analisar ${q.symbol} no termômetro`}
        >
          <b>{q.symbol}</b>
          <em>{pct >= 0 ? "+" : ""}{pct.toFixed(2)}%</em>
        </button>
      );
    });

  return (
    <div className="stockTickerBar">
      <span className="stockTickerLabel">STOCKS {WINDOW}</span>
      <div className="stockTickerList">
        <div className="stockTickerTrack">
          {renderItems()}
          <span className="stockTickerSep" aria-hidden="true">•</span>
          {renderItems()}
        </div>
      </div>
    </div>
  );
}

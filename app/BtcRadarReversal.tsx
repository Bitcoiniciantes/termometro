"use client";

import { useEffect, useMemo, useState } from "react";
import { analyzeBrakeRadar, BRAKE_ASSETS, fetchBrakeKlines, fetchBrakeSpotQuote, type BrakeAssetSymbol, type BrakeKlinesSnapshot, type BrakeTone } from "../lib/brake-radar";
import { analyzeTopRadar } from "../lib/top-radar";
import { BtcBrakeRadar } from "./BtcBrakeRadar";
import { BtcTopRadar } from "./BtcTopRadar";

const REFRESH_MS = 60_000;
type RadarTab = "fundos" | "topos";
type Quote = { price: number; changePct24h: number };
const fundLabels: Record<string, string> = { REACTION: "CONFIRMADA", REBOUND: "OBSERVAR", SLOWING: "DESACELERANDO", ACCELERATING: "QUEDA", UNSTABLE: "QUEDA", NO_DROP: "STAND-BY", UNAVAILABLE: "SEM DADOS" };
const topLabels: Record<string, string> = { EXHAUSTION_CONFIRMED: "EXAUSTÃO", TOP_WATCH: "OBSERVAR", DECELERATING: "DESACELERA", STRONG_UPTREND: "ALTA", ORIGIN_LOST: "ORIGEM", NEUTRAL: "NEUTRO", UNAVAILABLE: "SEM DADOS" };

function pillReading(snapshot: BrakeKlinesSnapshot | undefined, now: number, tab: RadarTab) {
  const input = { h1: snapshot?.h1 ?? [], m15: snapshot?.m15 ?? [], fetchedAt: snapshot?.fetchedAt ?? null, now };
  const reading = tab === "fundos" ? analyzeBrakeRadar(input) : analyzeTopRadar(input);
  return { label: (tab === "fundos" ? fundLabels : topLabels)[reading.state] ?? "SEM DADOS", tone: reading.tone as BrakeTone };
}

export function BtcRadarReversal({ currentPrice }: { currentPrice?: number }) {
  const [tab, setTab] = useState<RadarTab>("fundos");
  const [selectedSymbol, setSelectedSymbol] = useState<BrakeAssetSymbol>("BTCUSDT");
  const [btcSnapshot, setBtcSnapshot] = useState<BrakeKlinesSnapshot | null>(null);
  const [snapshots, setSnapshots] = useState<Partial<Record<BrakeAssetSymbol, BrakeKlinesSnapshot>>>({});
  const [quotes, setQuotes] = useState<Partial<Record<BrakeAssetSymbol, Quote>>>({});
  const [now, setNow] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000); setNow(Date.now());
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true; let running = false; const controller = new AbortController();
    const load = async () => {
      if (running) return; running = true;
      try {
        const results = await Promise.allSettled(BRAKE_ASSETS.map((asset) => fetchBrakeKlines(controller.signal, asset.symbol)));
        if (!active) return;
        const btc = results[0]; if (btc.status === "fulfilled") setBtcSnapshot(btc.value);
        setSnapshots((previous) => {
          const next = { ...previous };
          BRAKE_ASSETS.slice(1).forEach((asset, index) => { const result = results[index + 1]; if (result.status === "fulfilled") next[asset.symbol] = result.value; });
          return next;
        });
      } finally { running = false; }
    };
    load(); const timer = window.setInterval(load, REFRESH_MS);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, []);
  useEffect(() => {
    let active = true; let running = false; const controller = new AbortController();
    const load = async () => {
      if (running) return; running = true;
      try {
        const results = await Promise.allSettled(BRAKE_ASSETS.slice(1).map((asset) => fetchBrakeSpotQuote(asset.symbol, controller.signal)));
        if (!active) return;
        setQuotes((previous) => {
          const next = { ...previous };
          BRAKE_ASSETS.slice(1).forEach((asset, index) => { const result = results[index]; if (result.status === "fulfilled") next[asset.symbol] = result.value; });
          return next;
        });
      } finally { running = false; }
    };
    load(); const timer = window.setInterval(load, REFRESH_MS);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, []);

  const effectiveSnapshots = useMemo(() => ({ ...snapshots, BTCUSDT: btcSnapshot ?? undefined }), [btcSnapshot, snapshots]);
  const selectedAsset = BRAKE_ASSETS.find((asset) => asset.symbol === selectedSymbol) ?? BRAKE_ASSETS[0];
  const selectedSnapshot = effectiveSnapshots[selectedSymbol] ?? null;
  const btcDailyChangePct = useMemo(() => {
    const reference = btcSnapshot?.h1.at(-25)?.close; const price = currentPrice ?? btcSnapshot?.h1.at(-1)?.close;
    return reference && price && Number.isFinite(reference) && Number.isFinite(price) ? (price / reference - 1) * 100 : null;
  }, [btcSnapshot, currentPrice]);
  const selectedQuote = selectedSymbol === "BTCUSDT" ? { price: currentPrice ?? null, changePct24h: btcDailyChangePct } : quotes[selectedSymbol] ?? { price: null, changePct24h: null };

  return <section className="radarReversal" aria-label="Radar de Reversão">
    <div className="rrShell"><div className="rrHead"><div className="rrHeadMain"><span className="rrKicker">CANDLES FECHADOS</span><h3 className="rrTitle">RADAR DE REVERSÃO</h3></div><span className="rrSource">BINANCE SPOT · 15M + 1H</span></div>
      <div className="rrTabs" role="tablist" aria-label="Radar de reversão">{(["fundos", "topos"] as const).map((mode) => <button key={mode} type="button" role="tab" aria-selected={tab === mode} className="rrTab" onClick={() => setTab(mode)}>{mode === "fundos" ? "CAÇA-FUNDOS" : "CAÇA-TOPOS"}</button>)}</div>
      <div className="rrAssets" role="group" aria-label="Ativos monitorados">{BRAKE_ASSETS.map((asset) => { const status = pillReading(effectiveSnapshots[asset.symbol], now, tab); return <button key={asset.symbol} type="button" className={`rrAsset tone-${status.tone}`} aria-pressed={selectedSymbol === asset.symbol} onClick={() => setSelectedSymbol(asset.symbol)}><span><i />{asset.ticker}</span><small>{status.label}</small></button>; })}</div>
    </div>
    <div className="rrPanel" role="tabpanel">{tab === "fundos" ? <BtcBrakeRadar asset={selectedAsset} snapshot={selectedSnapshot} now={now} currentPrice={selectedQuote.price ?? undefined} dailyChangePct={selectedQuote.changePct24h} /> : <BtcTopRadar asset={selectedAsset} snapshot={selectedSnapshot} now={now} livePrice={selectedQuote.price} dailyChangePct={selectedQuote.changePct24h} />}</div>
  </section>;
}

export default BtcRadarReversal;

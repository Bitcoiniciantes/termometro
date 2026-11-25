"use client";

import { useCallback, useEffect, useState } from "react";
import "./rsi-projetado.css";
import {
  REVERSE_RSI_CONFIG,
  REVERSE_RSI_REF_LABEL,
  computeReverseRsi,
  fetchReverseRsiCandles,
  fetchReverseRsiLivePrice,
  type ReverseRsiMarket,
  type ReverseRsiResult,
  type ReverseRsiTimeframe,
} from "../lib/reverse-rsi";

type PanelConfig = {
  market: ReverseRsiMarket;
  initialAsset: string;
  periods: ReverseRsiTimeframe[];
  targets: number[];
  initialTarget: number;
};

const PANELS: PanelConfig[] = [
  {
    market: "STOCKS",
    initialAsset: REVERSE_RSI_CONFIG.STOCKS.defaultAsset,
    periods: REVERSE_RSI_CONFIG.STOCKS.timeframes,
    targets: REVERSE_RSI_CONFIG.STOCKS.targets,
    initialTarget: 25,
  },
  {
    market: "CRIPTO",
    initialAsset: REVERSE_RSI_CONFIG.CRIPTO.defaultAsset,
    periods: REVERSE_RSI_CONFIG.CRIPTO.timeframes,
    targets: REVERSE_RSI_CONFIG.CRIPTO.targets,
    initialTarget: 25,
  },
];

const REFRESH_MS = 60_000;

function cleanAsset(value: string, market: ReverseRsiMarket) {
  const asset = value.trim().toUpperCase().replace(/[^A-Z0-9.\-^=]/g, "");
  return market === "CRIPTO" ? asset.replace(/USDT$/, "") : asset;
}

function formatNumber(value: number, digits = 2) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "Cenário inviável";
  const abs = Math.abs(value);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${formatNumber(value)}%`;
}

function ProjectionPanel({ config }: { config: PanelConfig }) {
  const [asset, setAsset] = useState(config.initialAsset);
  const [query, setQuery] = useState(config.initialAsset);
  const [period, setPeriod] = useState<ReverseRsiTimeframe>(config.market === "STOCKS" ? "1D" : "4H");
  const [target, setTarget] = useState(config.initialTarget);
  const [result, setResult] = useState<ReverseRsiResult | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">("loading");

  const load = useCallback(async (nextAsset: string, nextPeriod: ReverseRsiTimeframe, nextTarget: number, silent = false) => {
    if (!silent) setStatus("loading");
    try {
      const [candlesData, livePriceRaw] = await Promise.all([
        fetchReverseRsiCandles({ asset: nextAsset, market: config.market, timeframe: nextPeriod }),
        fetchReverseRsiLivePrice({ asset: nextAsset, market: config.market }),
      ]);
      const livePrice = livePriceRaw ?? candlesData.referencePrice;
      if (!livePrice || !Number.isFinite(livePrice) || livePrice <= 0) {
        throw new Error("Cotação indisponível");
      }
      const next = computeReverseRsi({
        asset: nextAsset,
        market: config.market,
        timeframe: nextPeriod,
        targetRsi: nextTarget,
        closes: candlesData.closes,
        livePrice,
        referencePrice: candlesData.referencePrice,
      });
      setResult(next);
      setStatus("ready");
    } catch {
      if (!silent) {
        setResult(null);
        setStatus("unavailable");
      }
    }
  }, [config.market]);

  useEffect(() => {
    void load(asset, period, target, false);
    const timer = window.setInterval(() => {
      void load(asset, period, target, true);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [asset, period, target, load]);

  const submit = () => {
    const next = cleanAsset(query, config.market);
    if (next) {
      setAsset(next);
      setQuery(next);
    }
  };

  const unavailable = status === "unavailable" || (status === "ready" && !result);
  const roundedAverageChange = result?.percent === null || result?.percent === undefined ? null : Number(result.percent.toFixed(2));
  const averageTrend = roundedAverageChange === null || roundedAverageChange === 0 ? "neutral" : roundedAverageChange > 0 ? "up" : "down";
  const categoryLabel = config.market === "STOCKS" ? "STOCKS" : "CRIPTO";

  return (
    <article className={`reverseRsiPanel ${config.market === "CRIPTO" ? "crypto" : "stock"}`} aria-busy={status === "loading"}>
      <div className="reverseRsiControls">
        <span className="reverseRsiCategory">{categoryLabel}</span>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="reverseRsiSearch"
        >
          <label htmlFor={`reverse-rsi-${config.market.toLowerCase()}`}>BUSCAR ATIVO</label>
          <div>
            <input
              id={`reverse-rsi-${config.market.toLowerCase()}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              spellCheck={false}
              autoCapitalize="characters"
            />
            <button type="submit">Analisar</button>
          </div>
        </form>
        <div className="reverseRsiTimeframes" aria-label={`Timeframe ${categoryLabel}`}>
          {config.periods.map((item) => (
            <button
              type="button"
              key={item}
              className={period === item ? "selected" : ""}
              onClick={() => setPeriod(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="reverseRsiTargets">
        <b>RSI <small>(alvo)</small></b>
        <div>
          {config.targets.map((item) => (
            <button
              type="button"
              key={item}
              className={target === item ? "selected" : ""}
              onClick={() => setTarget(item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      {status === "loading" ? (
        <div className="reverseRsiMessage">Carregando dados…</div>
      ) : unavailable || !result ? (
        <div className="reverseRsiMessage">Dados indisponíveis</div>
      ) : (
        <div className="reverseRsiSummary">
          <div className="reverseRsiQuote">
            <span className="reverseRsiLabel">COTAÇÃO ATUAL</span>
            <strong className="reverseRsiQuoteValue">{formatPrice(result.currentPrice)}</strong>
            <small className="reverseRsiReferenceInline">
              {REVERSE_RSI_REF_LABEL[period]}: {formatPrice(result.referencePrice)}
            </small>
            <div className="reverseRsiRsiLine">
              RSI <strong>{formatNumber(result.currentRsi ?? 0)}</strong> <span aria-hidden="true">→</span> ALVO <strong>{formatNumber(target)}</strong>
            </div>
          </div>
          <div className={`reverseRsiFeatured ${averageTrend}`}>
            <span className="reverseRsiLabel">PREÇO PROJETADO MÉDIO</span>
            <strong className="reverseRsiFeaturedValue">{result.averagePrice !== null && Number.isFinite(result.averagePrice) ? `$ ${formatPrice(result.averagePrice)}` : formatPrice(result.averagePrice)}</strong>
            <b className="reverseRsiFeaturedChange">
              {averageTrend !== "neutral" && <span aria-hidden="true">{averageTrend === "up" ? "↑" : "↓"}</span>}
              {formatPercent(result.percent)}
            </b>
          </div>
        </div>
      )}
    </article>
  );
}

export default function RsiProjetadoCard() {
  return (
    <section className="reverseRsiCard" id="rsi-projetado" aria-label="RSI Projetado Reverse RSI">
      <header>
        <span aria-hidden="true">▂▅▇</span>
        <h2>TERMÔMETRO <em>— RSI PROJETADO (REVERSE RSI)</em></h2>
      </header>
      <div className="reverseRsiPanels">
        {PANELS.map((config) => (
          <ProjectionPanel key={config.market} config={config} />
        ))}
      </div>
      <p>Cotação ao vivo • RSI Wilder 14 • Média das projeções de 1, 3 e 6 candles.</p>
    </section>
  );
}
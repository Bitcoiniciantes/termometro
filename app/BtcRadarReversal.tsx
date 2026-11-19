"use client";
// app/BtcRadarReversal.tsx — painel de seleção e comparação do RADAR DE REVERSÃO.
//
// Estrutura:
//   - ativos fixos do Termômetro + até 3 adicionais (Binance Spot) persistidos
//     em chave própria (`termometro-radar-extra-assets-v1`);
//   - um único snapshot por símbolo alimenta pílula, radar principal e comparação;
//   - `COMPARAR` apenas apresenta as leituras nativas do modo atual, sem
//     recalcular métricas nem alterar a seleção principal.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeBrakeRadar,
  BRAKE_ASSETS,
  BRAKE_EXTRA_STORAGE_KEY,
  BRAKE_MAX_EXTRA_ASSETS,
  brakeAssetMeta,
  fetchBrakeKlines,
  fetchBrakeSpotQuote,
  isBaseBrakeAssetSymbol,
  normalizeRadarExtraSymbols,
  parseRadarExtraAssets,
  serializeRadarExtraAssets,
  toBrakeSpotSymbol,
  type BrakeKlinesSnapshot,
  type BrakeTone,
} from "../lib/brake-radar";
import { analyzeTopRadar } from "../lib/top-radar";
import { BtcBrakeRadar } from "./BtcBrakeRadar";
import { BtcTopRadar } from "./BtcTopRadar";
import { RadarComparePanel } from "./RadarComparePanel";

const REFRESH_MS = 60_000;
type RadarTab = "fundos" | "topos";
type RadarQuote = { price: number | null; changePct24h: number | null };
type AssetMeta = { symbol: string; name: string; ticker: string; base: boolean };

const fundLabels: Record<string, string> = {
  REACTION: "CONFIRMADA",
  REBOUND: "OBSERVAR",
  SLOWING: "DESACELERANDO",
  ACCELERATING: "QUEDA",
  UNSTABLE: "QUEDA",
  NO_DROP: "STAND-BY",
  UNAVAILABLE: "SEM DADOS",
};
const topLabels: Record<string, string> = {
  EXHAUSTION_CONFIRMED: "EXAUSTÃO",
  TOP_WATCH: "OBSERVAR",
  DECELERATING: "DESACELERA",
  STRONG_UPTREND: "ALTA",
  ORIGIN_LOST: "ORIGEM",
  NEUTRAL: "NEUTRO",
  UNAVAILABLE: "SEM DADOS",
};

const EMPTY_KLINE_INPUT = { h1: [], m15: [], fetchedAt: null };

function readingFor(
  snapshot: BrakeKlinesSnapshot | undefined,
  now: number,
  tab: RadarTab,
) {
  const input = {
    h1: snapshot?.h1 ?? [],
    m15: snapshot?.m15 ?? [],
    fetchedAt: snapshot?.fetchedAt ?? null,
    now,
  };
  return tab === "fundos" ? analyzeBrakeRadar(input) : analyzeTopRadar(input);
}

function pillReading(snapshot: BrakeKlinesSnapshot | undefined, now: number, tab: RadarTab) {
  const reading = readingFor(snapshot, now, tab);
  return {
    label: (tab === "fundos" ? fundLabels : topLabels)[reading.state] ?? "SEM DADOS",
    tone: reading.tone as BrakeTone,
  };
}

export function BtcRadarReversal({ currentPrice }: { currentPrice?: number }) {
  const [tab, setTab] = useState<RadarTab>("fundos");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [extraSymbols, setExtraSymbols] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [snapshots, setSnapshots] = useState<Record<string, BrakeKlinesSnapshot>>({});
  const [quotes, setQuotes] = useState<Record<string, RadarQuote>>({});
  const [now, setNow] = useState(0);

  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addBusy, setAddBusy] = useState(false);
  const [addError, setAddError] = useState("");
  const addInputRef = useRef<HTMLInputElement | null>(null);

  const [compareOpen, setCompareOpen] = useState(false);
  const [compareA, setCompareA] = useState("");
  const [compareB, setCompareB] = useState("");
  const [compareQuotes, setCompareQuotes] = useState<Record<string, RadarQuote | null>>({});
  const [compareQuoteLoading, setCompareQuoteLoading] = useState<Record<string, boolean>>({});

  const allowedSymbolsRef = useRef<Set<string>>(new Set());
  const selectedPillRef = useRef<HTMLButtonElement | null>(null);

  // Hidratação exclusivamente client-side, evitando mismatch de SSR.
  useEffect(() => {
    try {
      setExtraSymbols(parseRadarExtraAssets(window.localStorage.getItem(BRAKE_EXTRA_STORAGE_KEY)));
    } catch {
      setExtraSymbols([]);
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(BRAKE_EXTRA_STORAGE_KEY, serializeRadarExtraAssets(extraSymbols));
    } catch {
      /* storage indisponível: mantém a sessão em memória */
    }
  }, [extraSymbols, hydrated]);

  const assets = useMemo<AssetMeta[]>(() => {
    const base: AssetMeta[] = BRAKE_ASSETS.map((asset) => ({ ...asset, base: true }));
    const extras: AssetMeta[] = normalizeRadarExtraSymbols(extraSymbols)
      .filter((symbol) => !isBaseBrakeAssetSymbol(symbol))
      .map((symbol) => ({ ...brakeAssetMeta(symbol), base: false }));
    return [...base, ...extras];
  }, [extraSymbols]);

  const allSymbols = useMemo(() => assets.map((asset) => asset.symbol), [assets]);
  const symbolsKey = allSymbols.join("|");

  useEffect(() => {
    allowedSymbolsRef.current = new Set(allSymbols);
  }, [allSymbols]);

  // Ativo selecionado removido volta ao primeiro padrão válido, sem trocar o modo.
  useEffect(() => {
    setSelectedSymbol((current) => (allSymbols.includes(current) ? current : "BTCUSDT"));
  }, [allSymbols]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    setNow(Date.now());
    return () => window.clearInterval(timer);
  }, []);

  // Um snapshot por ativo (BTC incluído) alimenta pílula, radar e comparação.
  useEffect(() => {
    let active = true;
    let running = false;
    const controller = new AbortController();
    const symbols = allSymbols;

    const load = async () => {
      if (running) return;
      running = true;
      try {
        const results = await Promise.allSettled(
          symbols.map((symbol) => fetchBrakeKlines(controller.signal, symbol)),
        );
        if (!active) return;
        setSnapshots((previous) => {
          const allowed = allowedSymbolsRef.current;
          const next = { ...previous };
          results.forEach((result, index) => {
            const symbol = symbols[index];
            if (result.status === "fulfilled" && allowed.has(symbol)) {
              next[symbol] = result.value;
            }
          });
          for (const key of Object.keys(next)) {
            if (!allowed.has(key)) delete next[key];
          }
          return next;
        });
      } finally {
        running = false;
      }
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [symbolsKey]);

  // Cotações informativas: uma chamada por par, no mesmo ciclo do snapshot.
  useEffect(() => {
    let active = true;
    let running = false;
    const controller = new AbortController();
    const symbols = allSymbols.filter((symbol) => symbol !== "BTCUSDT");

    const load = async () => {
      if (running) return;
      running = true;
      try {
        const results = await Promise.allSettled(
          symbols.map((symbol) => fetchBrakeSpotQuote(symbol, controller.signal)),
        );
        if (!active) return;
        setQuotes((previous) => {
          const allowed = allowedSymbolsRef.current;
          const next = { ...previous };
          results.forEach((result, index) => {
            const symbol = symbols[index];
            if (result.status === "fulfilled" && allowed.has(symbol)) {
              next[symbol] = result.value;
            }
          });
          for (const key of Object.keys(next)) {
            if (!allowed.has(key)) delete next[key];
          }
          return next;
        });
      } finally {
        running = false;
      }
    };

    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [symbolsKey]);

  const btcDailyChangePct = useMemo(() => {
    const snapshot = snapshots.BTCUSDT;
    const reference = snapshot?.h1.at(-25)?.close;
    const price = currentPrice ?? snapshot?.h1.at(-1)?.close;
    return reference && price && Number.isFinite(reference) && Number.isFinite(price)
      ? (price / reference - 1) * 100
      : null;
  }, [snapshots, currentPrice]);

  const quoteFor = useCallback(
    (symbol: string): RadarQuote | null => {
      if (symbol === "BTCUSDT") {
        return { price: currentPrice ?? null, changePct24h: btcDailyChangePct };
      }
      return quotes[symbol] ?? compareQuotes[symbol] ?? null;
    },
    [btcDailyChangePct, compareQuotes, currentPrice, quotes],
  );

  const readings = useMemo(() => {
    const entries = allSymbols.map((symbol) => {
      const input = {
        h1: snapshots[symbol]?.h1 ?? EMPTY_KLINE_INPUT.h1,
        m15: snapshots[symbol]?.m15 ?? EMPTY_KLINE_INPUT.m15,
        fetchedAt: snapshots[symbol]?.fetchedAt ?? EMPTY_KLINE_INPUT.fetchedAt,
        now,
      };
      return [symbol, tab === "fundos" ? analyzeBrakeRadar(input) : analyzeTopRadar(input)] as const;
    });
    return Object.fromEntries(entries);
  }, [allSymbols, snapshots, tab, now]);

  const validCompareSymbols = useMemo(
    () =>
      allSymbols.filter((symbol) => {
        const reading = readings[symbol];
        return !!snapshots[symbol] && reading && reading.state !== "UNAVAILABLE";
      }),
    [allSymbols, readings, snapshots],
  );

  useEffect(() => {
    if (!compareOpen) return;
    setCompareA((current) => (current && validCompareSymbols.includes(current) ? current : ""));
    setCompareB((current) => (current && validCompareSymbols.includes(current) ? current : ""));
  }, [compareOpen, validCompareSymbols]);

  // Cotação sob demanda apenas do que ainda não teve cache no ciclo atual.
  useEffect(() => {
    if (!compareOpen) return;
    const needed = [compareA, compareB].filter(
      (symbol) => symbol && symbol !== "BTCUSDT" && quoteFor(symbol) === null,
    );
    if (!needed.length) return;
    let active = true;
    for (const symbol of needed) {
      setCompareQuoteLoading((current) => ({ ...current, [symbol]: true }));
      fetchBrakeSpotQuote(symbol)
        .then((quote) => {
          if (active && allowedSymbolsRef.current.has(symbol)) {
            setCompareQuotes((current) => ({ ...current, [symbol]: quote }));
          }
        })
        .catch(() => {
          if (active && allowedSymbolsRef.current.has(symbol)) {
            setCompareQuotes((current) => ({ ...current, [symbol]: null }));
          }
        })
        .finally(() => {
          if (active) setCompareQuoteLoading((current) => ({ ...current, [symbol]: false }));
        });
    }
    return () => {
      active = false;
    };
  }, [compareOpen, compareA, compareB, quoteFor]);

  useEffect(() => {
    if (addOpen) window.setTimeout(() => addInputRef.current?.focus(), 0);
  }, [addOpen]);

  const addDisabled = extraSymbols.length >= BRAKE_MAX_EXTRA_ASSETS;
  const limitNotice = `Limite de ${BRAKE_MAX_EXTRA_ASSETS} ativos atingido. Remova um ativo pelo × para adicionar outro.`;

  useEffect(() => {
    if (addDisabled && addOpen) {
      setAddOpen(false);
      setAddQuery("");
      setAddError("");
    }
  }, [addDisabled, addOpen]);

  const handleAddExtra = useCallback((symbol: string, snapshot: BrakeKlinesSnapshot) => {
    setExtraSymbols((current) => {
      if (isBaseBrakeAssetSymbol(symbol)) return current;
      if (current.includes(symbol) || current.length >= BRAKE_MAX_EXTRA_ASSETS) return current;
      return [...current, symbol];
    });
    setSnapshots((current) => ({ ...current, [symbol]: snapshot }));
  }, []);

  const handleRemoveExtra = useCallback((symbol: string) => {
    if (isBaseBrakeAssetSymbol(symbol)) return;
    setExtraSymbols((current) => current.filter((item) => item !== symbol));
    setSnapshots((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setQuotes((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setCompareQuotes((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setCompareQuoteLoading((current) => {
      const next = { ...current };
      delete next[symbol];
      return next;
    });
    setCompareA((current) => (current === symbol ? "" : current));
    setCompareB((current) => (current === symbol ? "" : current));
    setSelectedSymbol((current) => (current === symbol ? "BTCUSDT" : current));
    // A pílula removida deixa de existir: devolve o foco ao ativo selecionado.
    window.setTimeout(() => selectedPillRef.current?.focus(), 0);
  }, []);

  const submitAdd = async () => {
    if (addBusy) return;
    const candidate = toBrakeSpotSymbol(addQuery);
    if (!candidate) {
      setAddError("Informe um ticker de criptomoeda válido (ex.: XRP).");
      return;
    }
    if (allSymbols.includes(candidate)) {
      setAddError("Este ativo já está no radar.");
      return;
    }
    if (extraSymbols.length >= BRAKE_MAX_EXTRA_ASSETS) {
      setAddError(limitNotice);
      return;
    }
    setAddBusy(true);
    setAddError("");
    try {
      const [snapshot, quote] = await Promise.all([
        fetchBrakeKlines(undefined, candidate),
        fetchBrakeSpotQuote(candidate).catch(() => null),
      ]);
      if (!snapshot.h1.length || !snapshot.m15.length) {
        setAddError("Dados históricos insuficientes (1h/15m) para este ativo.");
        return;
      }
      if (!quote || quote.price === null || quote.price <= 0) {
        setAddError("Cotação correspondente indisponível para este par Binance Spot.");
        return;
      }
      handleAddExtra(candidate, snapshot);
      setCompareQuotes((current) => ({ ...current, [candidate]: quote }));
      setAddQuery("");
      setAddError("");
      setAddOpen(false);
      setSelectedSymbol(candidate);
    } catch {
      setAddError(
        "Ativo não compatível com o Radar de Reversão. Aceitos apenas criptoativos da Binance Spot com candles 1h/15m disponíveis.",
      );
    } finally {
      setAddBusy(false);
    }
  };

  const selectedAsset = assets.find((asset) => asset.symbol === selectedSymbol) ?? assets[0];
  const selectedSnapshot = snapshots[selectedSymbol] ?? null;
  const selectedQuote = quoteFor(selectedSymbol) ?? { price: null, changePct24h: null };

  return (
    <section className="radarReversal" aria-label="Radar de Reversão">
      <div className="rrShell">
        <div className="rrHead">
          <div className="rrHeadMain">
            <span className="rrKicker">CANDLES FECHADOS</span>
            <h3 className="rrTitle">RADAR DE REVERSÃO</h3>
          </div>
          <span className="rrSource">BINANCE SPOT · 15M + 1H</span>
        </div>
        <div className="rrTabs" role="tablist" aria-label="Radar de reversão">
          {(["fundos", "topos"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={tab === mode}
              className="rrTab"
              onClick={() => setTab(mode)}
            >
              {mode === "fundos" ? "CAÇA-FUNDOS" : "CAÇA-TOPOS"}
            </button>
          ))}
        </div>

        <div className="rrAssets" role="group" aria-label="Ativos monitorados">
          {assets.map((asset) => {
            const status = pillReading(snapshots[asset.symbol], now, tab);
            return (
              <div className="rrAssetWrap" key={asset.symbol}>
                <button
                  type="button"
                  ref={selectedSymbol === asset.symbol ? selectedPillRef : null}
                  className={`rrAsset tone-${status.tone}${asset.base ? "" : " removable"}`}
                  aria-pressed={selectedSymbol === asset.symbol}
                  aria-label={`Selecionar ${asset.name} (${asset.ticker})`}
                  title={asset.name}
                  onClick={() => setSelectedSymbol(asset.symbol)}
                >
                  <span>
                    <i aria-hidden="true" />
                    {asset.ticker}
                  </span>
                  <small>{status.label}</small>
                </button>
                {!asset.base && (
                  <button
                    type="button"
                    className="rrPillRemove"
                    aria-label={`Remover ${asset.ticker}`}
                    title={`Remover ${asset.ticker}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      event.preventDefault();
                      handleRemoveExtra(asset.symbol);
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            );
          })}

          <button
            type="button"
            className={`rrActionPill rrAddPill ${addOpen ? "active" : ""}`}
            onClick={() => {
              if (addDisabled) return;
              setAddOpen((current) => !current);
              setAddError("");
              if (compareOpen) setCompareOpen(false);
            }}
            aria-expanded={addOpen}
            aria-label="Adicionar ativo ao radar"
            title={addDisabled ? "Limite de 3 ativos adicionais atingido" : "Buscar e incluir ativo compatível"}
            disabled={addDisabled}
          >
            <b>+ ATIVO</b>
          </button>
          <button
            type="button"
            className={`rrActionPill rrComparePill ${compareOpen ? "active" : ""}`}
            onClick={() => {
              setCompareOpen((current) => !current);
              if (!compareOpen) setAddOpen(false);
            }}
            aria-expanded={compareOpen}
            aria-label="Comparar ativos"
            title="Comparar dois ativos no modo técnico atual"
          >
            <b>COMPARAR</b>
          </button>
        </div>

        {addDisabled && (
          <p className="rrLimitNotice" role="status">
            {limitNotice}
          </p>
        )}

        {addOpen && (
          <div className="rrAddPanel" role="region" aria-label="Buscar ativo para o radar">
            <div className="rrAddForm">
              <label className="rrAddLabel" htmlFor="rr-add-input">
                Buscar cripto (Binance Spot)
              </label>
              <div className="rrAddRow">
                <input
                  id="rr-add-input"
                  ref={addInputRef}
                  className="rrAddInput"
                  value={addQuery}
                  onChange={(event) => setAddQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      void submitAdd();
                    }
                    if (event.key === "Escape") setAddOpen(false);
                  }}
                  placeholder="XRP"
                  type="search"
                  enterKeyHint="search"
                  autoCapitalize="characters"
                  spellCheck={false}
                  autoComplete="off"
                  disabled={addBusy}
                />
                <button
                  type="button"
                  className="rrAddSubmit"
                  onClick={() => void submitAdd()}
                  disabled={addBusy || addDisabled}
                >
                  {addBusy ? "Validando…" : "Incluir"}
                </button>
                <button
                  type="button"
                  className="rrAddCancel"
                  onClick={() => setAddOpen(false)}
                  disabled={addBusy}
                >
                  Fechar
                </button>
              </div>
              <p className="rrAddHint">
                Somente criptomoedas da Binance Spot com candles 1h/15m compatíveis com o radar.
                Máx. 3 adicionais.
              </p>
              {addError && (
                <p className="rrAddError" role="alert">
                  {addError}
                </p>
              )}
            </div>
          </div>
        )}

        {compareOpen && (
          <RadarComparePanel
            mode={tab}
            symbols={validCompareSymbols}
            readings={readings}
            quotes={Object.fromEntries(
              [compareA, compareB].filter(Boolean).map((symbol) => [symbol, quoteFor(symbol)]),
            )}
            quoteLoading={compareQuoteLoading}
            a={compareA}
            b={compareB}
            onChangeA={setCompareA}
            onChangeB={setCompareB}
            onClose={() => setCompareOpen(false)}
          />
        )}
      </div>

      <div className="rrPanel" role="tabpanel">
        {tab === "fundos" ? (
          <BtcBrakeRadar
            asset={selectedAsset}
            snapshot={selectedSnapshot}
            now={now}
            currentPrice={selectedQuote.price ?? undefined}
            dailyChangePct={selectedQuote.changePct24h}
          />
        ) : (
          <BtcTopRadar
            asset={selectedAsset}
            snapshot={selectedSnapshot}
            now={now}
            livePrice={selectedQuote.price}
            dailyChangePct={selectedQuote.changePct24h}
          />
        )}
      </div>
    </section>
  );
}

export default BtcRadarReversal;

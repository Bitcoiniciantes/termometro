"use client";
// app/RadarComparePanel.tsx — comparação A/B no mesmo modo técnico do radar.
//
// Recebe as leituras já calculadas pelo motor nativo (lib/brake-radar.ts /
// lib/top-radar.ts) e apenas apresenta um subconjunto comparável. Não dispara
// análise alternativa, não escolhe vencedor e não interfere na seleção do
// painel principal.

import {
  formatPreservedMinutes,
  type BrakeRadarReading,
  type BrakeTone,
} from "../lib/brake-radar";
import type { TopRadarReading } from "../lib/top-radar";

type RadarMode = "fundos" | "topos";
type CompareReading = BrakeRadarReading | TopRadarReading;
type CompareQuote = { price: number | null; changePct24h: number | null };

export function fmtComparePct(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 10) / 10;
  const absolute = Math.abs(rounded).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${absolute}%`;
}

/** Cotação informativa: valor pequeno continua visível com até 8 casas. */
export function fmtCompareQuote(quote: CompareQuote | null | undefined): string {
  const value = quote?.price;
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return "Indisponível";
  }
  const decimals = value >= 1 ? 2 : value >= 0.01 ? 4 : 8;
  return `US$ ${value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: decimals,
  })}`;
}

function fmtCompareTime(updatedAt: number | null | undefined): string {
  if (!updatedAt || !Number.isFinite(updatedAt)) return "—";
  return new Date(updatedAt).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toneOf(reading: CompareReading | undefined): BrakeTone {
  return (reading?.tone as BrakeTone | undefined) ?? "gray";
}

export function RadarComparePanel({
  mode,
  symbols,
  readings,
  quotes,
  quoteLoading,
  a,
  b,
  onChangeA,
  onChangeB,
  onClose,
}: {
  mode: RadarMode;
  /** Ativos com snapshot e leitura válidos no modo atual. */
  symbols: string[];
  readings: Record<string, CompareReading>;
  quotes: Record<string, CompareQuote | null | undefined>;
  quoteLoading: Record<string, boolean>;
  a: string;
  b: string;
  onChangeA: (symbol: string) => void;
  onChangeB: (symbol: string) => void;
  onClose: () => void;
}) {
  const modeLabel = mode === "fundos" ? "CAÇA-FUNDOS" : "CAÇA-TOPOS";

  const renderCard = (symbol: string) => {
    if (!symbol) {
      return (
        <div className="rrCompareCard rrCompareEmptyCard">
          <span>Selecione um ativo</span>
        </div>
      );
    }
    const reading = readings[symbol];
    const quote = quotes[symbol];
    const ticker = symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
    const loading = quoteLoading[symbol];

    if (!reading || reading.state === "UNAVAILABLE") {
      return (
        <div className={`rrCompareCard tone-${toneOf(reading)}`}>
          <div className="rrCompareHead">
            <b>{ticker}</b>
            <span>{loading ? "Carregando…" : fmtCompareQuote(quote)}</span>
          </div>
          <div className="rrCompareEmpty">Dados insuficientes para este ativo no modo atual.</div>
        </div>
      );
    }

    if (mode === "fundos") {
      const r = reading as BrakeRadarReading;
      return (
        <div className={`rrCompareCard tone-${r.tone}`}>
          <div className="rrCompareHead">
            <b>{ticker}</b>
            <span>{loading ? "Carregando…" : fmtCompareQuote(quote)}</span>
          </div>
          <dl className="rrCompareGrid">
            <div>
              <dt>Estado técnico</dt>
              <dd className="rrCompareState">{r.label}</dd>
            </div>
            <div>
              <dt>Movimento recente (3h)</dt>
              <dd>{fmtComparePct(r.recentReturnPct, true)}</dd>
            </div>
            <div>
              <dt>Recuperação da queda</dt>
              <dd>{fmtComparePct(r.retracementPct)}</dd>
            </div>
            <div>
              <dt>Fundo preservado</dt>
              <dd>{formatPreservedMinutes(r.preservedMinutes)}</dd>
            </div>
            <div>
              <dt>Freio da queda</dt>
              <dd>{r.brakeApplicable && r.brakePct !== null ? fmtComparePct(r.brakePct) : "Não aplicável"}</dd>
            </div>
            <div>
              <dt>Atualização</dt>
              <dd>{fmtCompareTime(r.updatedAt)}</dd>
            </div>
            <div className="rrCompareWide">
              <dt>Diagnóstico operacional</dt>
              <dd>
                <strong>{r.action}</strong>
                <small>{r.reason}</small>
              </dd>
            </div>
          </dl>
        </div>
      );
    }

    const r = reading as TopRadarReading;
    const criteriaMet = r.criteria.filter((criterion) => criterion.met).length;
    return (
      <div className={`rrCompareCard tone-${r.tone}`}>
        <div className="rrCompareHead">
          <b>{ticker}</b>
          <span>{loading ? "Carregando…" : fmtCompareQuote(quote)}</span>
        </div>
        <dl className="rrCompareGrid">
          <div>
            <dt>Estado técnico</dt>
            <dd className="rrCompareState">{r.label}</dd>
          </div>
          <div>
            <dt>Movimento recente (3h)</dt>
            <dd>{fmtComparePct(r.recentReturnPct, true)}</dd>
          </div>
          <div>
            <dt>Recuo do topo</dt>
            <dd>{fmtComparePct(r.drawdownPct)}</dd>
          </div>
          <div>
            <dt>Sem nova máxima</dt>
            <dd>{formatPreservedMinutes(r.minutesWithoutNewHigh)}</dd>
          </div>
          <div>
            <dt>Idade do topo</dt>
            <dd>{formatPreservedMinutes(r.peakAgeMinutes)}</dd>
          </div>
          <div>
            <dt>Critérios</dt>
            <dd>{`${criteriaMet}/5 · 1H ${r.h1Filter.met ? "aprovado" : "reprovado"}`}</dd>
          </div>
          <div>
            <dt>Atualização</dt>
            <dd>{fmtCompareTime(r.updatedAt)}</dd>
          </div>
          <div className="rrCompareWide">
            <dt>Diagnóstico operacional</dt>
            <dd>
              <strong>{r.action}</strong>
              <small>{r.reason}</small>
            </dd>
          </div>
        </dl>
      </div>
    );
  };

  return (
    <div
      className="rrComparePanel"
      role="region"
      aria-label={`Comparar ativos — ${modeLabel}`}
    >
      <div className="rrCompareBar">
        <span className="rrCompareTitle">COMPARAR · {modeLabel}</span>
        <div className="rrComparePickers">
          <label>
            <span>Ativo A</span>
            <select value={a} onChange={(event) => onChangeA(event.target.value)}>
              <option value="">Selecionar</option>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Ativo B</span>
            <select value={b} onChange={(event) => onChangeB(event.target.value)}>
              <option value="">Selecionar</option>
              {symbols.map((symbol) => (
                <option key={symbol} value={symbol}>
                  {symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button type="button" className="rrCompareClose" onClick={onClose}>
          Fechar
        </button>
      </div>
      {a && b && a === b ? (
        <p className="rrCompareWarn" role="status">
          Escolha dois ativos diferentes para comparar.
        </p>
      ) : symbols.length < 2 ? (
        <p className="rrCompareWarn" role="status">
          Dados válidos insuficientes para comparação no momento.
        </p>
      ) : (
        <div className="rrCompareGridWrap">
          {renderCard(a)}
          {renderCard(b)}
        </div>
      )}
      <p className="rrCompareNote">
        Cotações em USDT (Binance Spot). Comparação informativa, baseada nos dados e indicadores
        disponíveis; não é recomendação de investimento.
      </p>
    </div>
  );
}

export default RadarComparePanel;

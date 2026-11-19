"use client";
// app/BtcBrakeRadar.tsx — RADAR DE FREIO DA QUEDA (BTCUSDT).
//
// Card independente do ativo selecionado no Termômetro. Lê somente candles
// públicos e fechados da Binance spot (1h + 15m), a cada 60s, e delega toda a
// matemática para lib/brake-radar.ts. Não repete CVD, funding, OI, RSI, order
// book nem qualquer métrica de microestrutura. Não executa ordens.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  analyzeBrakeRadar,
  fetchBrakeKlines,
  formatPreservedMinutes,
  BRAKE_PRESERVED_REFERENCE_MIN,
  type BrakeKlinesSnapshot,
  type BrakeRadarReading,
} from "../lib/brake-radar";

const REFRESH_MS = 60_000;

type Props = {
  asset?: { symbol: string; name: string; ticker: string };
  /** Cotação spot ao vivo (informativa; não entra nos cálculos). */
  currentPrice?: number;
  /** Variação percentual em 24h já disponível no contexto. */
  dailyChangePct?: number | null;
  /** Snapshot compartilhado com o Radar de Reversão. */
  snapshot?: BrakeKlinesSnapshot | null;
  /** Relógio compartilhado com o wrapper de abas. */
  now?: number;
};

function fmtPct(value: number | null, signed = false): string {
  if (value === null || !Number.isFinite(value)) return "—";
  // Arredonda antes de decidir o sinal: −0,04% deve aparecer como 0,0%, não −0,0%.
  const rounded = Math.round(value * 10) / 10;
  const absolute = Math.abs(rounded).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sign = rounded < 0 ? "−" : signed && rounded > 0 ? "+" : "";
  return `${sign}${absolute}%`;
}

function fmtPrice(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  return `US$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtLivePrice(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return "—";
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmt24hChange(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
}

function fmtTime(value: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

type BarView = {
  label: string;
  value: number;
  display: string;
  mark: number | null;
  markTitle: string;
  track: boolean;
};

function clampPct(value: number | null): number {
  if (value === null || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, value));
}

// A barra única representa a métrica do estado atual: freio durante a queda,
// retração durante repique/reção. Sem métrica válida, nenhuma barra é desenhada
// (e nenhum percentual falso é inventado).
function barView(reading: BrakeRadarReading): BarView {
  if (reading.barMetric === "recovery") {
    return {
      label: "RECUPERAÇÃO DA AMPLITUDE (%)",
      value: clampPct(reading.retracementPct),
      display: fmtPct(reading.retracementPct),
      mark: 20,
      markTitle: "Referência de 20% da amplitude",
      track: true,
    };
  }
  if (reading.barMetric === "brake") {
    return {
      label: "FREIO DA QUEDA (%)",
      value: clampPct(reading.brakePct),
      display: fmtPct(reading.brakePct),
      mark: 25,
      markTitle: "Mínimo de 25% para sinal de reação",
      track: true,
    };
  }
  return {
    label: "FREIO NÃO APLICÁVEL",
    value: 0,
    display: "",
    mark: null,
    markTitle: "",
    track: false,
  };
}

function returnTone(value: number | null): string {
  if (value === null) return "brMuted";
  const rounded = Math.round(value * 10) / 10;
  if (rounded < 0) return "brNegative";
  if (rounded > 0) return "brPositive";
  return "brMuted";
}

function recoveryTone(reading: BrakeRadarReading): string {
  if (!reading.hasDrop) return "brMuted";
  const value = reading.retracementPct;
  if (value === null) return "brMuted";
  if (value >= 20) return "brPositive";
  if (value >= 15) return "brCaution";
  return "brMuted";
}

function preservedTone(reading: BrakeRadarReading): string {
  if (!reading.hasDrop || reading.preservedMinutes === null) return "brMuted";
  if (reading.preservedMinutes >= BRAKE_PRESERVED_REFERENCE_MIN) return "brPositive";
  if (reading.preservedMinutes >= 30) return "brCaution";
  return "brNegative";
}

function diagnosticStatus(value: boolean | null): string {
  return value === null ? "Dados insuficientes" : value ? "Atendida" : "Bloqueou";
}

function diagnosticClass(value: boolean | null): string {
  return value === null ? "brDiagUnknown" : value ? "brDiagPass" : "brDiagFail";
}

export function BtcBrakeRadar({ asset = { symbol: "BTCUSDT", name: "Bitcoin", ticker: "BTC" }, currentPrice, dailyChangePct, snapshot: externalSnapshot, now: externalNow }: Props) {
  const [internalSnapshot, setInternalSnapshot] = useState<BrakeKlinesSnapshot | null>(null);
  const [internalNow, setInternalNow] = useState(0);
  const shared = externalSnapshot !== undefined;
  const snapshot = shared ? (externalSnapshot ?? null) : internalSnapshot;
  const now = externalNow ?? internalNow;
  const previousPrice = useRef<number | null>(null);
  const [liveMove, setLiveMove] = useState<"up" | "down" | "neutral">("neutral");
  const [isStructureInfoOpen, setStructureInfoOpen] = useState(false);
  const structureInfoRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    previousPrice.current = null;
    setLiveMove("neutral");
  }, [asset.symbol]);

  useEffect(() => {
    if (!isStructureInfoOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setStructureInfoOpen(false);
    };
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (structureInfoRef.current && !structureInfoRef.current.contains(event.target as Node)) {
        setStructureInfoOpen(false);
      }
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("mousedown", closeOnOutsideClick);
    };
  }, [isStructureInfoOpen]);

  useEffect(() => {
    const valid = currentPrice !== undefined && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
    if (valid === null) return;
    if (previousPrice.current !== null && valid !== previousPrice.current) {
      setLiveMove(valid > previousPrice.current ? "up" : valid < previousPrice.current ? "down" : "neutral");
    } else if (previousPrice.current === null) {
      setLiveMove("neutral");
    }
    previousPrice.current = valid;
  }, [currentPrice]);

  useEffect(() => {
    if (shared) return;
    const timer = window.setInterval(() => setInternalNow(Date.now()), 1000);
    setInternalNow(Date.now());
    return () => window.clearInterval(timer);
  }, [shared]);

  useEffect(() => {
    if (shared) return;
    let active = true;
    let running = false;
    const controller = new AbortController();

    const load = async () => {
      if (running) return;
      running = true;
      try {
        const next = await fetchBrakeKlines(controller.signal);
        if (active) setInternalSnapshot(next);
      } catch (error) {
        // Mantém a última leitura válida. Se ela envelhecer > 2 min, o próprio
        // analisador classifica DADOS INDISPONÍVEIS e bloqueia qualquer sinal.
        if ((error as Error)?.name !== "AbortError") {
          /* sem dados novos; o estado de staleness cuida do bloqueio */
        }
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
  }, [shared]);

  const reading = useMemo(
    () => analyzeBrakeRadar({
      h1: snapshot?.h1 ?? [],
      m15: snapshot?.m15 ?? [],
      fetchedAt: snapshot?.fetchedAt ?? null,
      now,
    }),
    [snapshot, now],
  );

  const bar = barView(reading);
  const preservedText = formatPreservedMinutes(reading.preservedMinutes);
  const preservedMet = reading.preservedMinutes !== null
    && reading.preservedMinutes >= BRAKE_PRESERVED_REFERENCE_MIN;
  const preservedTrack = reading.preservedMinutes === null
    ? 0
    : Math.max(0, Math.min(100, (reading.preservedMinutes / (BRAKE_PRESERVED_REFERENCE_MIN * 2)) * 100));
  const computedChange24h = useMemo(() => {
    const reference = snapshot?.h1.at(-25)?.close;
    const price = currentPrice ?? snapshot?.h1.at(-1)?.close;
    if (!reference || !price || !Number.isFinite(reference) || !Number.isFinite(price)) return null;
    return (price / reference - 1) * 100;
  }, [currentPrice, snapshot]);
  const change24h = dailyChangePct !== undefined ? dailyChangePct : computedChange24h;
  const change24hTone = change24h === null || !Number.isFinite(change24h) || change24h === 0
    ? "neutral"
    : change24h > 0
      ? "up"
      : "down";
  const validLivePrice = currentPrice !== undefined && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
  const showStructureInfo = reading.badge.startsWith("DCA BLOQUEADO — ESTRUTURA 1H")
    || reading.badge.startsWith("DCA BLOQUEADO — DADOS 1H");
  const structureFilterStatus = !reading.structure1hAvailable
    ? "Indisponível"
    : reading.structure1hApproved ? "Aprovado" : "Bloqueado";
  const criteriaText = reading.updatedAt === null
    ? "Dados insuficientes"
    : `${reading.originalCriteriaMet}/5 atendidos`;

  return (
    <article
      className={`card brakeRadar tone-${reading.tone}`}
      aria-live="polite"
      aria-label={`Radar de freio da queda de ${asset.name}`}
    >
      <div className="brHead">
        <div className="brHeadMain">
          <h3 className="brTitle">{asset.name.toUpperCase()} — RADAR DE FREIO DA QUEDA</h3>
          <span className="brKicker">{asset.ticker}/USDT</span>
          <p className="brState">{reading.label}</p>
        </div>
        <div className="brHeadSide">
          <div className="brBadgeRow">
            <span className="brBadge">{reading.badge}</span>
            {showStructureInfo && (
              <div
                className="brStructureInfo"
                ref={structureInfoRef}
                onMouseEnter={() => setStructureInfoOpen(true)}
                onMouseLeave={() => setStructureInfoOpen(false)}
              >
                <button
                  type="button"
                  className="brInfoButton"
                  aria-label="Explicar bloqueio estrutural 1H"
                  aria-expanded={isStructureInfoOpen}
                  aria-controls="br-structure-info-panel"
                  onFocus={() => setStructureInfoOpen(true)}
                  onClick={() => setStructureInfoOpen((open) => !open)}
                >ⓘ</button>
                {isStructureInfoOpen && (
                  <div className="brInfoPanel" id="br-structure-info-panel" role="dialog" aria-label="Diagnóstico do bloqueio estrutural 1H">
                    <button type="button" className="brInfoClose" aria-label="Fechar explicação" onClick={() => setStructureInfoOpen(false)}>×</button>
                    <strong>Por que o DCA está bloqueado?</strong>
                    <p><b>Critérios originais:</b> {criteriaText}. São cinco critérios de curto prazo; o filtro 1H é um veto adicional.</p>
                    <p><b>Filtro 1H:</b> <span className={reading.structure1hAvailable ? (reading.structure1hApproved ? "brDiagPass" : "brDiagFail") : "brDiagUnknown"}>{structureFilterStatus}</span></p>
                    <p><b>EMA20 1H:</b> fechamento {fmtPrice(reading.structure1hClose)} · EMA20 {fmtPrice(reading.structure1hEma20)}. Quando o fechamento está abaixo da EMA20, o motor exige confirmação adicional.</p>
                    <ul className="brDiagList">
                      <li className={diagnosticClass(reading.structure1hCloseAboveEma9)}>Fechamento 1H acima da EMA9: {diagnosticStatus(reading.structure1hCloseAboveEma9)}.</li>
                      <li className={diagnosticClass(reading.structure1hLowPreserved)}>Mínima 1H não inferior à mínima anterior: {diagnosticStatus(reading.structure1hLowPreserved)}.</li>
                      <li className={diagnosticClass(reading.structure1hCloseAscending)}>Fechamento 1H superior ao anterior: {diagnosticStatus(reading.structure1hCloseAscending)}.</li>
                    </ul>
                    <p className="brInfoFinal">Reação de curto prazo identificada. DCA permanece bloqueado até a confirmação estrutural 1H.</p>
                  </div>
                )}
              </div>
            )}
          </div>
          <small className="brUpdated">Atualizado às {fmtTime(reading.updatedAt)}</small>
        </div>
      </div>

      <div className="brMetrics">
        <div className="brMetric">
          <span>MOVIMENTO RECENTE (3H)</span>
          <b className={returnTone(reading.recentReturnPct)}>{fmtPct(reading.recentReturnPct, true)}</b>
          <small className="brMetricSub">
            Anterior: <span className={returnTone(reading.previousReturnPct)}>{fmtPct(reading.previousReturnPct, true)}</span>
          </small>
        </div>
        <div className="brMetric">
          <span>RECUPERAÇÃO DA QUEDA</span>
          <b className={recoveryTone(reading)}>{fmtPct(reading.retracementPct)}</b>
          <small className="brMetricSub">
            {reading.hasDrop ? "amplitude topo → mínima" : "contexto · sem DCA"}
          </small>
        </div>
        <div className="brMetric">
          <span>FUNDO PRESERVADO</span>
          <b className={preservedTone(reading)}>{preservedText}</b>
          <div className="brPreserveTrack" aria-hidden="true">
            <i style={{ width: `${preservedTrack}%` }} />
            <em title="Referência de 60 minutos" />
          </div>
          <small className="brMetricSub">
            {preservedMet
              ? reading.state === "REACTION"
                ? "meta temporal atingida"
                : "meta temporal atingida · sem confirmação"
              : "meta 60 min"}
          </small>
        </div>
      </div>

      <div className={`brBarArea${bar.track ? "" : " brBarAreaEmpty"}`}>
        <div className="brBarHead">
          <span>{bar.label}</span>
          {bar.display ? <b>{bar.display}</b> : null}
        </div>
        {bar.track && (
          <div
            className="brBarTrack"
            role="progressbar"
            aria-label={`${bar.label}: ${bar.display}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(bar.value)}
          >
            <i style={{ width: `${bar.value}%` }} />
            {bar.mark !== null && <em style={{ left: `${bar.mark}%` }} title={bar.markTitle} />}
          </div>
        )}
      </div>

      <div className="brStructure">
        <div className="brContext">
            <span>Mínima: <b>{fmtPrice(reading.minimum12h)}</b></span>
          <span>Máxima da amplitude: <b>{fmtPrice(reading.maximum12h)}</b></span>
          <span>Recuperação: <b>{fmtPct(reading.retracementPct)}</b></span>
          <span>EMA9: <b>{fmtPrice(reading.ema9)}</b></span>
        </div>
        <div className="brLiveQuote" aria-label="Cotação ao vivo e fechamento de 15 minutos (base dos cálculos)">
          <div className="brLiveQuoteValues">
            {validLivePrice !== null ? (
              <>
                <b className={`brLivePrice ${liveMove}`}>US$ {fmtLivePrice(validLivePrice)}</b>
                {change24h !== null && Number.isFinite(change24h) && (
                  <b className={`brLiveChange ${change24hTone}`} aria-label={`Variação em 24 horas: ${fmt24hChange(change24h)}`}>{fmt24hChange(change24h)}</b>
                )}
              </>
            ) : (
              <b className="brLivePrice neutral brLiveUnavailable">Indisponível</b>
            )}
          </div>
          <div className="brSpotReference brCalcBase">
            <span>ref. cálculo: US$ {fmtLivePrice(reading.lastClose15m)}</span>
          </div>
        </div>
      </div>
      <div className="brAction">
        <span className="brActionLabel">AÇÃO</span>
        <b>{reading.action}</b>
        <p>{reading.reason}</p>
      </div>

      <p className="brNote">
        Nível 20% é referência de recuperação, não ordem nem gatilho de compra. Somente candles fechados · Binance spot · atualização a cada 60s · não é recomendação.
      </p>
    </article>
  );
}

export default BtcBrakeRadar;


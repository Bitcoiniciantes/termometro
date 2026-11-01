"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildPriceGeometry,
  clampViewport,
  DEFAULT_VISIBLE_CANDLES,
  getAutoPriceRange,
  getPriceBounds,
  panPriceRange,
  panViewport,
  priceFromPlotY,
  zoomPriceRange,
  zoomViewport,
  type HorizontalViewport,
  type PriceRange,
} from "../lib/chart";
import { useGlobalAlerts } from "./GlobalAlertContext";
import type { Candle } from "../lib/types";

type Props = {
  asset: string;
  ticker: string;
  candles: Candle[];
  currentPrice: number;
  currency: string;
  loading: boolean;
  period: string;
  resistance: number;
  support: number;
};

function formatPriceNumber(value: number) {
  const maximumFractionDigits = value >= 1 ? 2 : 6;
  return value.toLocaleString("pt-BR", { maximumFractionDigits });
}

function formatPrice(value: number, currency: string) {
  return `${currency} ${formatPriceNumber(value)}`;
}

function formatDate(time: number, period: string) {
  const options: Intl.DateTimeFormatOptions = period === "1H" || period === "4H"
    ? { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short", year: "2-digit" };
  return new Date(time).toLocaleString("pt-BR", { ...options, timeZone: "America/Sao_Paulo" });
}

type VerticalViewport = { mode: "auto" | "manual"; range: PriceRange | null };
type ChartViewport = { horizontal: HorizontalViewport; vertical: VerticalViewport };
type Interaction = {
  kind: "pan" | "scale";
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  baseHorizontal: Pick<HorizontalViewport, "start" | "visibleCount">;
  baseRange: PriceRange;
  width: number;
  height: number;
  target: HTMLDivElement;
};
type PinchInteraction = {
  startDistance: number;
  currentDistance: number;
  anchorRatio: number;
  baseHorizontal: Pick<HorizontalViewport, "start" | "visibleCount">;
  target: HTMLDivElement;
  pointerIds: [number, number];
};

export default function PriceStructureChart({ asset, ticker, candles, currentPrice, currency, loading, period, resistance, support }: Props) {
  const [viewport, setViewport] = useState<ChartViewport>({
    horizontal: { start: 0, visibleCount: DEFAULT_VISIBLE_CANDLES, followLatest: true },
    vertical: { mode: "auto", range: null },
  });
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const plotRef = useRef<HTMLDivElement | null>(null);
  const interactionRef = useRef<Interaction | null>(null);
  const pinchRef = useRef<PinchInteraction | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const frameRef = useRef<number | null>(null);
  const { configs, toggleAlert, updateConfigLevels } = useGlobalAlerts();
  const symbol = `${ticker}USDT`;
  const isAlertEnabled = configs[symbol]?.enabled ?? false;

  useEffect(() => {
    setViewport({
      horizontal: { start: 0, visibleCount: DEFAULT_VISIBLE_CANDLES, followLatest: true },
      vertical: { mode: "auto", range: null },
    });
    setHoveredIndex(null);
  }, [ticker, period]);

  useEffect(() => {
    if (support > 0 && resistance > 0) {
      updateConfigLevels(symbol, support, resistance, "GRAPH", period);
    }
  }, [symbol, support, resistance, updateConfigLevels, period]);

  const totalCandles = candles.length;
  const horizontal = useMemo(() => {
    const normalized = clampViewport(viewport.horizontal, totalCandles);
    return {
      ...normalized,
      followLatest: viewport.horizontal.followLatest,
      start: viewport.horizontal.followLatest
        ? Math.max(0, totalCandles - normalized.visibleCount)
        : normalized.start,
    };
  }, [totalCandles, viewport.horizontal]);
  const visibleCandles = useMemo(
    () => candles.slice(horizontal.start, horizontal.start + horizontal.visibleCount),
    [candles, horizontal.start, horizontal.visibleCount],
  );
  const automaticRange = useMemo(
    () => getAutoPriceRange(visibleCandles, horizontal.followLatest ? currentPrice : undefined),
    [visibleCandles, horizontal.followLatest, currentPrice],
  );
  const priceBounds = useMemo(
    () => getPriceBounds(candles, horizontal.followLatest ? currentPrice : undefined) ?? automaticRange,
    [candles, horizontal.followLatest, currentPrice, automaticRange],
  );
  const activeRange = viewport.vertical.mode === "manual" && viewport.vertical.range
    ? viewport.vertical.range
    : automaticRange;
  const geometry = useMemo(
    () => buildPriceGeometry(visibleCandles, visibleCandles.length, activeRange ?? undefined),
    [visibleCandles, activeRange],
  );

  const finishInteraction = useCallback(() => {
    const interaction = interactionRef.current;
    const pinch = pinchRef.current;
    interactionRef.current = null;
    pinchRef.current = null;
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (interaction && interaction.target.hasPointerCapture(interaction.pointerId)) {
      interaction.target.releasePointerCapture(interaction.pointerId);
    }
    if (pinch) {
      pinch.pointerIds.forEach((pointerId) => {
        if (pinch.target.hasPointerCapture(pointerId)) pinch.target.releasePointerCapture(pointerId);
      });
    }
    touchPointsRef.current.clear();
  }, []);

  const applyInteraction = useCallback(() => {
    frameRef.current = null;
    const interaction = interactionRef.current;
    const pinch = pinchRef.current;
    if (pinch && priceBounds) {
      const factor = pinch.startDistance / Math.max(pinch.currentDistance, 1);
      const nextHorizontal = zoomViewport(pinch.baseHorizontal, pinch.anchorRatio, factor, totalCandles);
      setViewport((current) => ({ ...current, horizontal: { ...nextHorizontal, followLatest: false } }));
      return;
    }
    if (!interaction || !priceBounds) return;

    if (interaction.kind === "pan") {
      const indexDelta = -(interaction.currentX - interaction.startX) * interaction.baseHorizontal.visibleCount / Math.max(interaction.width, 1);
      const nextHorizontal = panViewport(interaction.baseHorizontal, indexDelta, totalCandles);
      setViewport((current) => ({
        ...current,
        horizontal: { ...nextHorizontal, followLatest: false },
      }));
      return;
    }

    const priceDelta = -(interaction.currentY - interaction.startY) * (interaction.baseRange.max - interaction.baseRange.min) / Math.max(interaction.height, 1);
    const nextRange = panPriceRange(interaction.baseRange, priceDelta, priceBounds);
    setViewport((current) => ({
      ...current,
      vertical: { mode: "manual", range: nextRange },
    }));
  }, [priceBounds, totalCandles]);

  const scheduleInteraction = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(applyInteraction);
  }, [applyInteraction]);

  useEffect(() => {
    const finish = () => finishInteraction();
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") finishInteraction();
    };
    window.addEventListener("blur", finish);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("blur", finish);
      document.removeEventListener("visibilitychange", handleVisibility);
      finishInteraction();
    };
  }, [finishInteraction]);

  const startInteraction = (kind: Interaction["kind"], event: React.PointerEvent<HTMLDivElement>) => {
    if ((!event.isPrimary && event.pointerType !== "touch") || !activeRange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType === "touch") {
      touchPointsRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touchPointsRef.current.size >= 2) {
        const points = [...touchPointsRef.current.entries()].slice(0, 2);
        const first = points[0][1];
        const second = points[1][1];
        const distance = Math.hypot(second.x - first.x, second.y - first.y);
        interactionRef.current = null;
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        for (const pointerId of [points[0][0], points[1][0]]) {
          if (!event.currentTarget.hasPointerCapture(pointerId)) {
            try {
              event.currentTarget.setPointerCapture(pointerId);
            } catch {
              // The pointer may have ended between the two pointerdown events.
            }
          }
        }
        pinchRef.current = {
          startDistance: Math.max(distance, 1),
          currentDistance: Math.max(distance, 1),
          anchorRatio: ((first.x + second.x) / 2 - rect.left) / Math.max(rect.width, 1),
          baseHorizontal: horizontal,
          target: event.currentTarget,
          pointerIds: [points[0][0], points[1][0]],
        };
        setViewport((current) => ({ ...current, horizontal: { ...current.horizontal, followLatest: false } }));
        return;
      }
    }
    interactionRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      currentY: event.clientY,
      baseHorizontal: horizontal,
      baseRange: activeRange,
      width: rect.width,
      height: rect.height,
      target: event.currentTarget,
    };
    if (kind === "pan") {
      setViewport((current) => ({ ...current, horizontal: { ...current.horizontal, followLatest: false } }));
    } else {
      setViewport((current) => ({ ...current, vertical: { mode: "manual", range: activeRange } }));
    }
  };

  const moveInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      const point = touchPointsRef.current.get(event.pointerId);
      if (point) {
        point.x = event.clientX;
        point.y = event.clientY;
      }
      const pinch = pinchRef.current;
      if (pinch) {
        const first = touchPointsRef.current.get(pinch.pointerIds[0]);
        const second = touchPointsRef.current.get(pinch.pointerIds[1]);
        if (first && second) {
          pinch.currentDistance = Math.max(Math.hypot(second.x - first.x, second.y - first.y), 1);
          scheduleInteraction();
        }
        return;
      }
    }
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) return;
    interaction.currentX = event.clientX;
    interaction.currentY = event.clientY;
    scheduleInteraction();
  };

  const endInteraction = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") touchPointsRef.current.delete(event.pointerId);
    finishInteraction();
  };

  const zoomHorizontal = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const anchorRatio = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const factor = event.deltaY > 0 ? 1.15 : 0.87;
    setViewport((current) => {
      const base = clampViewport(current.horizontal, totalCandles);
      const next = zoomViewport(base, anchorRatio, factor, totalCandles);
      return { ...current, horizontal: { ...next, followLatest: false } };
    });
  };

  const zoomVertical = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!priceBounds || !automaticRange) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const range = viewport.vertical.mode === "manual" && viewport.vertical.range ? viewport.vertical.range : automaticRange;
    const anchorPrice = priceFromPlotY(event.clientY - rect.top, rect.height, range);
    const factor = event.deltaY > 0 ? 1.15 : 0.87;
    setViewport((current) => ({
      ...current,
      vertical: { mode: "manual", range: zoomPriceRange(range, anchorPrice, factor, priceBounds) },
    }));
  };

  const adjustVerticalZoom = (factor: number) => {
    if (!priceBounds || !automaticRange) return;
    const range = viewport.vertical.mode === "manual" && viewport.vertical.range ? viewport.vertical.range : automaticRange;
    const anchorPrice = (range.min + range.max) / 2;
    setViewport((current) => ({
      ...current,
      vertical: { mode: "manual", range: zoomPriceRange(range, anchorPrice, factor, priceBounds) },
    }));
  };

  const resetVerticalScale = () => setViewport((current) => ({ ...current, vertical: { mode: "auto", range: null } }));
  const goToLatest = () => {
    setViewport((current) => ({ ...current, horizontal: { ...current.horizontal, followLatest: true } }));
    setHoveredIndex(null);
  };

  if (!geometry) {
    return <div className="priceChart priceChartEmpty" aria-busy={loading}>
      <span>{loading ? "Carregando candles reais…" : "Histórico insuficiente para desenhar o gráfico"}</span>
    </div>;
  }

  const selectedIndex = Math.min(hoveredIndex ?? geometry.candles.length - 1, geometry.candles.length - 1);
  const selected = geometry.candles[selectedIndex];
  const first = geometry.candles[0];
  const middle = geometry.candles[Math.floor(geometry.candles.length / 2)];
  const last = geometry.candles.at(-1)!;
  const selectedTone = selected.direction === "up" ? "up" : "down";
  const level = (value: number) => `${geometry.scale(value)}%`;
  const levelPosition = (value: number) => {
    const outside = value > geometry.max ? "above" : value < geometry.min ? "below" : null;
    return { top: `${Math.max(0, Math.min(100, geometry.scale(value)))}%`, outside };
  };
  const resistancePosition = resistance > 0 ? levelPosition(resistance) : null;
  const supportPosition = support > 0 ? levelPosition(support) : null;

  return <div className="priceChart realPriceChart">
    <div className="chartIdentity" aria-hidden="true"><b>{asset}</b><span>{period} · OHLC REAL</span></div>
    <div className="chartViewportControls" aria-label="Controles do gráfico">
      <button type="button" onClick={() => adjustVerticalZoom(0.87)} aria-label="Aumentar escala vertical" title="Aumentar escala vertical">Y+</button>
      <button type="button" onClick={() => adjustVerticalZoom(1.15)} aria-label="Reduzir escala vertical" title="Reduzir escala vertical">Y−</button>
      <button type="button" onClick={resetVerticalScale} aria-label="Autoescala vertical" title="Autoescala vertical">AUTO</button>
      <button type="button" onClick={goToLatest} aria-label="Ir para o candle mais recente" title="Ir para o candle mais recente">ÚLTIMO</button>
    </div>
    <button type="button" onClick={() => toggleAlert(symbol, support, resistance, "GRAPH", period)} className={`alertToggleBtn ${isAlertEnabled ? "active" : ""}`} aria-pressed={isAlertEnabled}>{isAlertEnabled ? "🔔 Alertas Ativos" : "🔕 Ativar Alertas"}</button>
    <div className={`chartOhlc ${selectedTone}`} aria-live="polite">
      <span>{formatDate(selected.time, period)}</span>
      <dl>
        <div><dt>A</dt><dd>{formatPrice(selected.open, currency)}</dd></div>
        <div><dt>Máx</dt><dd>{formatPrice(selected.high, currency)}</dd></div>
        <div><dt>Mín</dt><dd>{formatPrice(selected.low, currency)}</dd></div>
        <div><dt>F</dt><dd>{formatPrice(selected.close, currency)}</dd></div>
      </dl>
    </div>
    <div className="chartAxis" aria-hidden="true">
      {Array.from({ length: 5 }, (_, index) => {
        const position = index * 25;
        const value = geometry.max - (geometry.max - geometry.min) * (position / 100);
        return <span key={position} style={{ top: `${position}%` }}>{formatPrice(value, currency)}</span>;
      })}
    </div>
    <div
      ref={plotRef}
      className="candlePlot"
      onPointerDown={(event) => startInteraction("pan", event)}
      onPointerMove={moveInteraction}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onLostPointerCapture={finishInteraction}
      onWheel={zoomHorizontal}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {resistancePosition && <div className={`priceLevel resistanceLevel${resistancePosition.outside ? " outOfRange" : ""}`} data-out-of-range={resistancePosition.outside ?? undefined} style={{ top: resistancePosition.top }}><span>Resistência · {formatPriceNumber(resistance)}{resistancePosition.outside && <small> · fora da escala</small>}</span></div>}
      {supportPosition && <div className={`priceLevel supportLevel${supportPosition.outside ? " outOfRange" : ""}`} data-out-of-range={supportPosition.outside ?? undefined} style={{ top: supportPosition.top }}><span>Suporte · {formatPriceNumber(support)}{supportPosition.outside && <small> · fora da escala</small>}</span></div>}
      {currentPrice > 0 && <div className="priceLevel currentPriceLevel" style={{ top: level(currentPrice) }} />}
      {geometry.candles.map((candle, index) => <button
        type="button"
        key={`${candle.time}-${index}`}
        className={`realCandle ${candle.direction} ${index === geometry.candles.length - 1 ? "forming" : ""}`}
        style={{ left: `${index / geometry.candles.length * 100}%`, width: `${100 / geometry.candles.length}%` }}
        onMouseEnter={() => setHoveredIndex(index)}
        onFocus={() => setHoveredIndex(index)}
        onBlur={() => setHoveredIndex(null)}
        aria-label={`${formatDate(candle.time, period)}: abertura ${formatPrice(candle.open, currency)}, máxima ${formatPrice(candle.high, currency)}, mínima ${formatPrice(candle.low, currency)}, fechamento ${formatPrice(candle.close, currency)}`}
      >
        <i className="candleWick" style={{ top: `${candle.wickTop}%`, height: `${candle.wickHeight}%` }}/>
        <b className="candleBody" style={{ top: `${candle.bodyTop}%`, height: `${candle.bodyHeight}%` }}/>
      </button>)}
    </div>
    <div
      className="chartPriceScaleInteraction"
      role="slider"
      aria-label="Escala de preços. Arraste verticalmente ou use a roda do mouse."
      aria-valuemin={geometry.min}
      aria-valuemax={geometry.max}
      aria-valuenow={(geometry.min + geometry.max) / 2}
      onPointerDown={(event) => startInteraction("scale", event)}
      onPointerMove={moveInteraction}
      onPointerUp={endInteraction}
      onPointerCancel={endInteraction}
      onLostPointerCapture={finishInteraction}
      onWheel={zoomVertical}
    />
    {currentPrice > 0 && <div className="priceTagLayer" aria-hidden="true">
      <span className="priceTagCurrent" style={{ top: level(currentPrice) }}>{formatPriceNumber(currentPrice)}</span>
    </div>}
    <div className="chartDates" aria-hidden="true"><span>{formatDate(first.time, period)}</span><span>{formatDate(middle.time, period)}</span><span>{formatDate(last.time, period)}</span></div>
  </div>;
}

"use client";
import { NUPL_ZONES } from "../lib/nupl";
import type { NuplReading } from "../lib/types";

const PHASE_RANGES: Record<string, [number, number]> = {
  euphoria: [0.6, 1],
  belief: [0.2, 0.6],
  optimism: [-0.2, 0.2],
  hopeFear: [-0.6, -0.2],
  capitulation: [-1, -0.6],
};

const SHORT_LABEL: Record<string, string> = {
  euphoria: "Ganância",
  belief: "Negação",
  optimism: "Otimismo",
  hopeFear: "Medo",
  capitulation: "Desespero",
};

const RULER_TICKS = [1, 0.6, 0.2, -0.2, -0.6, -1];

function markerPct(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return ((1 - clamped) / 2) * 100;
}

export default function NuplBar({ nupl }: { nupl: NuplReading }) {
  const pct = markerPct(nupl.value);
  const phaseLabel = nupl.zone === "hopeFear" ? "Medo" : nupl.phase.split("/")[0];

  return (
    <div className="nuplBar">
      <div className="nuplRuler" aria-hidden="true">
        {RULER_TICKS.map((tick) => (
          <span
            key={tick}
            className="nuplTick"
            style={{ left: `${((1 - tick) / 2) * 100}%` }}
          >
            <span className="nuplTickLine" />
            <span className="nuplTickLabel">{tick > 0 ? `+${tick}` : tick}</span>
          </span>
        ))}
        <span className="nuplPhaseLabel" style={{ left: `${pct}%`, color: nupl.color }}>
          {phaseLabel}
        </span>
      </div>
      <div
        className="nuplTrack"
        role="img"
        aria-label={`NUPL ${nupl.value.toFixed(3)} — ${phaseLabel}`}
        style={{ "--nupl-marker": nupl.color } as React.CSSProperties}
      >
        {NUPL_ZONES.map((zone) => {
          const range = PHASE_RANGES[zone.key];
          const widthPct = ((range[1] - range[0]) / 2) * 100;
          return (
            <div
              key={zone.key}
              className={`nuplSeg ${nupl.zone === zone.key ? "active" : ""}`}
              style={{ width: `${widthPct}%`, background: zone.color }}
              title={SHORT_LABEL[zone.key]}
            >
              <span className="nuplSegLabel">{SHORT_LABEL[zone.key]}</span>
              <span className="nuplSegLine" style={{ background: zone.color }} />
            </div>
          );
        })}
        <div
          className="nuplMarker"
          style={{ left: `${pct}%` }}
          title={`Você: ${nupl.value.toFixed(3)}`}
        >
          <span className="nuplMarkerLabel">
            {nupl.value.toLocaleString("pt-BR", {
              minimumFractionDigits: 3,
              maximumFractionDigits: 3,
            })}
          </span>
        </div>
      </div>
    </div>
  );
}

"use client";
import { NUPL_ZONES } from "../lib/nupl";
import type { NuplReading } from "../lib/types";

const PHASE_RANGES: Record<string, [number, number]> = {
  euphoria: [0.8, 1],
  belief: [0.6, 0.8],
  optimism: [0.2, 0.6],
  hopeFear: [-0.2, 0.2],
  capitulation: [-1, -0.2],
};

const SHORT_LABEL: Record<string, string> = {
  euphoria: "Ganância",
  belief: "Negação",
  optimism: "Otimismo",
  hopeFear: "Medo",
  capitulation: "Desespero",
};

function markerPct(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return ((1 - clamped) / 2) * 100;
}

export default function NuplBar({ nupl }: { nupl: NuplReading }) {
  const pct = markerPct(nupl.value);
  const phaseLabel = nupl.zone === "hopeFear" ? "Medo" : nupl.phase.split("/")[0];

  return (
    <div className="nuplBar">
      <div className="nuplPhaseNow" style={{ color: nupl.color }}>{phaseLabel}</div>
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

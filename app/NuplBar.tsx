"use client";
import { NUPL_ZONES } from "../lib/nupl";
import type { NuplReading } from "../lib/types";

const ZONE_BANDS: Record<string, [number, number]> = {
  capitulation: [-0.4, 0],
  hopeFear: [0, 0.25],
  optimism: [0.25, 0.5],
  belief: [0.5, 0.75],
  euphoria: [0.75, 1.5],
};

const SEGMENT_PCT = 100 / NUPL_ZONES.length;

const SHORT_LABEL: Record<string, string> = {
  euphoria: "Ganância",
  belief: "Negação",
  optimism: "Otimismo",
  hopeFear: "Medo",
  capitulation: "Desespero",
};

function markerPct(value: number, zoneKey: string): number {
  const index = NUPL_ZONES.findIndex((zone) => zone.key === zoneKey);
  if (index < 0) return 0;
  const [lo, hi] = ZONE_BANDS[zoneKey];
  const clamped = Math.max(lo, Math.min(hi, value));
  const frac = (clamped - lo) / (hi - lo);
  return (index + Math.max(0, Math.min(1, frac))) * SEGMENT_PCT;
}

export default function NuplBar({ nupl }: { nupl: NuplReading }) {
  const pct = markerPct(nupl.value, nupl.zone);
  const phaseLabel = nupl.zone === "hopeFear" ? "Medo" : nupl.phase.split("/")[0];

  return (
    <div className="nuplBar">
      <div
        className="nuplTrack"
        role="img"
        aria-label={`NUPL ${nupl.value.toFixed(3)} — ${phaseLabel}`}
        style={{ "--nupl-marker": nupl.color } as React.CSSProperties}
      >
        {NUPL_ZONES.map((zone) => (
          <div
            key={zone.key}
            className={`nuplSeg ${nupl.zone === zone.key ? "active" : ""}`}
            style={{ width: `${SEGMENT_PCT}%`, background: zone.color }}
            title={SHORT_LABEL[zone.key]}
          >
            <span className="nuplSegLabel">{SHORT_LABEL[zone.key]}</span>
            <span className="nuplSegLine" style={{ background: zone.color }} />
          </div>
        ))}
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
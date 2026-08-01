import type { NuplReading, NuplZoneKey } from "./types";

type NuplZone = {
  key: NuplZoneKey;
  phase: string;
  color: string;
};

type NuplPayload = {
  source?: unknown;
  sourcePage?: unknown;
  updatedAt?: unknown;
  dates?: unknown;
} & Partial<Record<NuplZoneKey, unknown>>;

export const NUPL_ZONES: readonly NuplZone[] = [
  { key: "euphoria", phase: "Euforia/Ganância", color: "#45a9f3" },
  { key: "belief", phase: "Crença/Negação", color: "#48d7aa" },
  { key: "optimism", phase: "Otimismo", color: "#f2a33b" },
  { key: "hopeFear", phase: "Esperança/Medo", color: "#e8c14c" },
  { key: "capitulation", phase: "Capitulação/Desespero", color: "#f05b78" },
] as const;

export function latestNuplReading(body: unknown): NuplReading {
  if (!body || typeof body !== "object") throw new Error("Dados do NUPL inválidos");

  const payload = body as NuplPayload;
  if (!Array.isArray(payload.dates)) throw new Error("Histórico do NUPL incompleto");

  const zones = NUPL_ZONES.map((zone) => ({ ...zone, values: payload[zone.key] }));
  if (zones.some((zone) => !Array.isArray(zone.values))) {
    throw new Error("Faixas do NUPL incompletas");
  }

  for (let index = payload.dates.length - 1; index >= 0; index -= 1) {
    const dataDate = payload.dates[index];
    if (typeof dataDate !== "string") continue;
    
    // Itera de trás pra frente (como no gráfico)
    for (let z = zones.length - 1; z >= 0; z -= 1) {
      const zone = zones[z];
      const rawValue = (zone.values as unknown[])[index];
      if (rawValue === null || rawValue === undefined || rawValue === "") continue;
      const value = Number(rawValue);
      if (!Number.isFinite(value)) continue;
      return {
        value,
        phase: zone.phase,
        zone: zone.key,
        color: zone.color,
        dataDate,
        updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : dataDate,
        source: typeof payload.source === "string" ? payload.source : "Checkonchain",
        sourcePage: typeof payload.sourcePage === "string" ? payload.sourcePage : "",
      };
    }
  }

  throw new Error("NUPL atual indisponível");
}
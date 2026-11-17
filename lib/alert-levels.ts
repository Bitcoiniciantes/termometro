export type AlertLevelInput = {
  currentPrice: number;
  supportCandidate?: number;
  resistanceCandidate?: number;
  atr?: number;
  period?: string;
};

export type AlertLevels = {
  support: number;
  resistance: number;
  today: number;
};

const FALLBACK_PERCENT_BY_PERIOD: Record<string, number> = {
  "15M": 0.01,
  "1H": 0.02,
  "4H": 0.03,
  "1D": 0.05,
  "1S": 0.08,
  "1M": 0.12,
};

const validPositive = (value: number | undefined): value is number =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

export function calculateAlertLevels({
  currentPrice,
  supportCandidate,
  resistanceCandidate,
  atr,
  period = "1H",
}: AlertLevelInput): AlertLevels {
  if (!validPositive(currentPrice)) {
    throw new RangeError("O preço atual deve ser positivo e finito.");
  }

  const fallbackPercent = FALLBACK_PERCENT_BY_PERIOD[period] ?? FALLBACK_PERCENT_BY_PERIOD["1H"];
  const percentageDistance = currentPrice * fallbackPercent;
  const fallbackDistance = Math.max(validPositive(atr) ? atr : 0, percentageDistance, Number.EPSILON);

  const support = validPositive(supportCandidate) && supportCandidate < currentPrice
    ? supportCandidate
    : Math.max(Number.EPSILON, currentPrice - fallbackDistance);
  const resistance = validPositive(resistanceCandidate) && resistanceCandidate > currentPrice
    ? resistanceCandidate
    : currentPrice + fallbackDistance;

  return { support, resistance, today: currentPrice };
}

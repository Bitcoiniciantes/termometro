export type Signal = {
  title: string;
  summary: string;
  score: number;
  group: string;
  detail: string;
  context?: boolean;
};

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type MarketData = {
  asset: string;
  pair: string;
  source: string;
  updatedAt: number;
  period: string;
  candles: Candle[];
};

export type BiasItem = {
  asset: string;
  score: number;
  confidence: number;
  change: number;
  rsi?: number;
};

export type StaticSnapshot = {
  source: string;
  updatedAt: number;
  periods: Record<string, Candle[]>;
};

export type RsiRow = {
  label: string;
  value: number;
  previous: number;
};

export type MultiRsi = {
  rows: RsiRow[];
  general: number;
  previousGeneral: number;
  bullCount: number;
  bearCount: number;
  signal: string;
};

export type ExtremeTone = "positive" | "negative" | "warning" | "neutral";

export type ExtremeReading = {
  status: string;
  summary: string;
  detail: string;
  tone: ExtremeTone;
  rsi: number;
  adx: number;
  atrDistance: number;
  divergence: "bullish" | "bearish" | null;
};

export type Analysis = {
  signals: Signal[];
  score: number;
  confidence: number;
  change: number;
  rsi: number;
  extreme: ExtremeReading;
};
export type NuplZoneKey =
  | "euphoria"
  | "belief"
  | "optimism"
  | "hopeFear"
  | "capitulation";

export type NuplReading = {
  value: number;
  phase: string;
  zone: NuplZoneKey;
  color: string;
  dataDate: string;
  updatedAt: string;
  source: string;
  sourcePage: string;
};
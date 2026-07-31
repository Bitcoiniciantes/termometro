import type { MultiRsi, Signal } from "./types";

export type AiAnalysisRequest = {
  asset: string;
  period: string;
  currentPrice: number;
  score: number;
  confidence: number;
  change: number;
  support: number;
  resistance: number;
  entry: number;
  stop: number;
  target: number;
  volumeRatio: number;
  multiRsi: Pick<MultiRsi, "general" | "bullCount" | "bearCount" | "signal"> | null;
  signals: Pick<Signal, "title" | "summary" | "score" | "group" | "context">[];
};

export type AiAnalysisResponse = {
  headline: string;
  scenario: "ALTA" | "BAIXA" | "NEUTRO" | "RISCO ELEVADO";
  summary: string;
  strategy: string[];
  risks: string[];
  invalidation: string;
  generatedAt: string;
};

export class AiAnalysisError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryAfterSeconds = 0,
  ) {
    super(message);
    this.name = "AiAnalysisError";
  }
}
export async function fetchAiAnalysis(payload: AiAnalysisRequest, signal?: AbortSignal): Promise<AiAnalysisResponse> {
  const endpoint = typeof window !== "undefined" && window.location.hostname === "bitcoiniciantes.github.io"
    ? "https://termometro-estude-bitcoin.bitcoiniciantes.chatgpt.site/api/ai-analysis"
    : "/api/ai-analysis";
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const body = (await response.json().catch(() => null)) as
    | AiAnalysisResponse
    | { error?: string; retryAfterSeconds?: number }
    | null;
  if (!response.ok) {
    const retryAfterHeader = Number(response.headers.get("Retry-After"));
    const retryAfterSeconds = body && "retryAfterSeconds" in body && Number.isFinite(body.retryAfterSeconds)
      ? Number(body.retryAfterSeconds)
      : Number.isFinite(retryAfterHeader)
        ? retryAfterHeader
        : 0;
    throw new AiAnalysisError(
      body && "error" in body && body.error ? body.error : "Análise por IA indisponível.",
      response.status,
      retryAfterSeconds,
    );
  }
  return body as AiAnalysisResponse;
}
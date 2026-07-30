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
  const body = (await response.json().catch(() => null)) as AiAnalysisResponse | { error?: string } | null;
  if (!response.ok) {
    throw new Error(body && "error" in body && body.error ? body.error : "Análise por IA indisponível.");
  }
  return body as AiAnalysisResponse;
}
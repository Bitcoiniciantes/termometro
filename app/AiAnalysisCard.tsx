"use client";

import { useEffect, useRef, useState } from "react";
import {
  AiAnalysisError,
  buildLocalAiPreview,
  fetchAiAnalysis,
  fetchAssetNews,
  type AssetNewsResponse,
  readCachedAiAnalysis,
  writeCachedAiAnalysis,
  type AiAnalysisRequest,
  type AiAnalysisResponse,
} from "../lib/ai";

type AnalysisSource = "local" | "groq" | "mimo" | "gemini" | "cache" | null;

export default function AiAnalysisCard({
  payload,
  disabled,
  autoRunKey = 0,
}: {
  payload: AiAnalysisRequest;
  disabled: boolean;
  autoRunKey?: number;
}) {
  const [analysis, setAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [source, setSource] = useState<AnalysisSource>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [news, setNews] = useState<AssetNewsResponse | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  useEffect(() => {
    if (retryAfter <= 0) return;
    const timer = window.setTimeout(() => {
      if (retryAfter <= 1) {
        setRetryAfter(0);
        setError("");
      } else {
        setRetryAfter(retryAfter - 1);
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [retryAfter]);



  useEffect(() => {
    const controller = new AbortController();
    setNewsLoading(true);
    setNews(null);
    fetchAssetNews(payload.asset, controller.signal)
      .then(result => { if (!controller.signal.aborted) setNews(result); })
      .catch(() => { if (!controller.signal.aborted) setNews(null); })
      .finally(() => { if (!controller.signal.aborted) setNewsLoading(false); });
    return () => controller.abort();
  }, [payload.asset]);

  const generate = async (force = false) => {
    if (loading) return;
    setError("");
    setRetryAfter(0);
    if (!force) {
      const cached = readCachedAiAnalysis(payload);
      if (cached) {
        setAnalysis(cached);
        setSource("cache");
        return;
      }
    }

    const localPreview = buildLocalAiPreview(payload);
    if (!analysis) {
      setAnalysis(localPreview);
      setSource("local");
    }
    setLoading(true);
    const controller = new AbortController();
    requestRef.current = controller;
    try {
      const refined = await fetchAiAnalysis({ ...payload, localPreview }, controller.signal);
      if (controller.signal.aborted) return;
      setAnalysis(refined);
      setSource(refined.provider || "groq");
      writeCachedAiAnalysis(payload, refined);
    } catch (cause) {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Análise por IA indisponível.");
      setRetryAfter(cause instanceof AiAnalysisError ? cause.retryAfterSeconds : 0);
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (!autoRunKey || disabled) return;
    void generate(false);
  }, [autoRunKey, disabled]);
  const sourceLabel = source === "local"
    ? loading ? "PRÉ-ANÁLISE LOCAL • IA REFINANDO…" : "PRÉ-ANÁLISE LOCAL"
    : source === "cache"
      ? "LEITURA SALVA • ATÉ 5 MINUTOS"
      : source === "mimo"
      ? "ANÁLISE DIGITAL CONCLUÍDA"
      : source === "gemini"
        ? "ANÁLISE DIGITAL CONCLUÍDA"
        : "";
  const providerLabel = analysis?.provider === "gemini"
    ? "Gemini"
    : analysis?.provider === "groq"
      ? "Groq"
      : analysis?.provider === "mimo"
        ? "MiMo"
        : source === "local"
          ? "Local"
          : null;

  return (
    <article id="analista-digital" className="card aiAnalysis" aria-busy={loading}>
      <div className="cardTitle">
        <div><span>ANÁLISE ASSISTIDA</span><b>Analista Digital{providerLabel ? ` (${providerLabel})` : ""}</b></div>
        <span className="aiBadge">IA</span>
      </div>
      {!analysis ? (
        <div className="aiIntro">
          <p>A IA interpreta os sinais já calculados pelo Termômetro. Ela não altera notas, preços ou níveis.</p>
          <button type="button" onClick={() => void generate(false)} disabled={disabled || loading || retryAfter > 0}>
            {loading ? "ANALISANDO…" : retryAfter > 0 ? `AGUARDE ${retryAfter}s` : "GERAR LEITURA"}
          </button>
          {error && <small className="aiError" role="alert">{retryAfter > 0 ? `Limite temporário da API atingido. Aguarde ${retryAfter}s.` : error}</small>}
        </div>
      ) : (
        <div className="aiResult">
          {sourceLabel && <small className={`aiSource ${source}`} role="status">{sourceLabel}</small>}
          <div className={`aiScenario ${analysis.scenario.toLowerCase().replace(" ", "-")}`}>
            <span>CENÁRIO</span><b>{analysis.scenario}</b>
          </div>
          <h3>{analysis.headline}</h3>
          <p>{analysis.summary}</p>
          <div className="aiSection"><b>ESTRATÉGIA CONDICIONAL</b><ol>{analysis.strategy.map(item => <li key={item}>{item}</li>)}</ol></div>
          <div className="aiSection aiRisks"><b>RISCOS</b><ul>{analysis.risks.map(item => <li key={item}>{item}</li>)}</ul></div>
          <div className="aiInvalidation"><span>INVALIDAÇÃO DA LEITURA</span><p>{analysis.invalidation}</p></div>

          <div className="aiSection aiNews">
            <b>FATOS RELEVANTES</b>
            {newsLoading ? <p>Buscando notícias recentes?</p> : news?.items.length ? (
              <ul>{news.items.map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title}</a><small>{item.source}{item.publishedAt ? " • " + new Date(item.publishedAt).toLocaleDateString("pt-BR") : ""}</small></li>)}</ul>
            ) : <p>Sem notícias relevantes encontradas nas últimas 48 horas.</p>}
          </div>
          <div className="aiActions"><small>{new Date(analysis.generatedAt).toLocaleString("pt-BR")}</small><button type="button" onClick={() => void generate(true)} disabled={loading || retryAfter > 0}>{loading ? "REFINANDO…" : retryAfter > 0 ? `AGUARDE ${retryAfter}s` : "ATUALIZAR"}</button></div>
          {error && <small className="aiError" role="alert">{retryAfter > 0 ? `Limite temporário da API atingido. Aguarde ${retryAfter}s.` : error}</small>}
        </div>
      )}
      <p className="aiDisclaimer">Conteúdo educacional gerado por IA. Não constitui recomendação financeira.</p>
    </article>
  );
}
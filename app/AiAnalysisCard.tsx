"use client";

import { useEffect, useState } from "react";
import {
  AiAnalysisError,
  fetchAiAnalysis,
  type AiAnalysisRequest,
  type AiAnalysisResponse,
} from "../lib/ai";

export default function AiAnalysisCard({
  payload,
  disabled,
}: {
  payload: AiAnalysisRequest;
  disabled: boolean;
}) {
  const [analysis, setAnalysis] = useState<AiAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);

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

  const generate = async () => {
    setLoading(true);
    setError("");
    setRetryAfter(0);
    try {
      setAnalysis(await fetchAiAnalysis(payload));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Análise por IA indisponível.");
      setRetryAfter(cause instanceof AiAnalysisError ? cause.retryAfterSeconds : 0);
    } finally {
      setLoading(false);
    }
  };

  return (
    <article className="card aiAnalysis" aria-busy={loading}>
      <div className="cardTitle">
        <div><span>ANÁLISE ASSISTIDA</span><b>Interpretação com Gemini</b></div>
        <span className="aiBadge">IA</span>
      </div>
      {!analysis ? (
        <div className="aiIntro">
          <p>O Gemini interpreta os sinais já calculados pelo Termômetro. Ele não altera notas, preços ou níveis.</p>
          <button type="button" onClick={generate} disabled={disabled || loading || retryAfter > 0}>
            {loading ? "ANALISANDO…" : retryAfter > 0 ? `AGUARDE ${retryAfter}s` : "GERAR LEITURA"}
          </button>
          {error && <small className="aiError" role="alert">{retryAfter > 0 ? `Limite temporário da API atingido. Aguarde ${retryAfter}s.` : error}</small>}
        </div>
      ) : (
        <div className="aiResult">
          <div className={`aiScenario ${analysis.scenario.toLowerCase().replace(" ", "-")}`}>
            <span>CENÁRIO</span><b>{analysis.scenario}</b>
          </div>
          <h3>{analysis.headline}</h3>
          <p>{analysis.summary}</p>
          <div className="aiSection"><b>ESTRATÉGIA CONDICIONAL</b><ol>{analysis.strategy.map(item => <li key={item}>{item}</li>)}</ol></div>
          <div className="aiSection aiRisks"><b>RISCOS</b><ul>{analysis.risks.map(item => <li key={item}>{item}</li>)}</ul></div>
          <div className="aiInvalidation"><span>INVALIDAÇÃO DA LEITURA</span><p>{analysis.invalidation}</p></div>
          <div className="aiActions"><small>{new Date(analysis.generatedAt).toLocaleString("pt-BR")}</small><button type="button" onClick={generate} disabled={loading || retryAfter > 0}>{loading ? "ATUALIZANDO…" : retryAfter > 0 ? `AGUARDE ${retryAfter}s` : "ATUALIZAR"}</button></div>
          {error && <small className="aiError" role="alert">{retryAfter > 0 ? `Limite temporário da API atingido. Aguarde ${retryAfter}s.` : error}</small>}
        </div>
      )}
      <p className="aiDisclaimer">Conteúdo educacional gerado por IA. Não constitui recomendação financeira.</p>
    </article>
  );
}
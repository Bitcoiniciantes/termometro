import type { MultiRsi, Signal } from "./types";

export type AiAnalysisRequest = {
  asset:string; period:string; currentPrice:number; score:number; confidence:number; change:number;
  support:number; resistance:number; entry:number; stop:number; target:number; volumeRatio:number;
  multiRsi:Pick<MultiRsi,"general"|"bullCount"|"bearCount"|"signal">|null;
  signals:Pick<Signal,"title"|"summary"|"score"|"group"|"context">[];
  localPreview?:AiAnalysisResponse;
};

export type AiAnalysisResponse = {
  headline:string;
  scenario:"ALTA"|"BAIXA"|"NEUTRO"|"RISCO ELEVADO";
  summary:string;
  strategy:string[];
  risks:string[];
  invalidation:string;
  generatedAt:string;
  provider?:"local"|"groq"|"gemini"|"mimo";
};

function price(value:number){return value>0?value.toLocaleString("pt-BR",{maximumFractionDigits:2}):"não calculado";}

export function buildLocalAiPreview(payload:AiAnalysisRequest):AiAnalysisResponse {
  const scenario=payload.score>=20?"ALTA":payload.score<=-20?"BAIXA":"NEUTRO";
  const direction=scenario==="ALTA"?"viés de alta":scenario==="BAIXA"?"pressão de baixa":"equilíbrio técnico";
  const strategy=scenario==="ALTA"
    ? ["Observar confirmação acima da resistência em "+price(payload.resistance)+" com aumento de volume.","Usar o suporte em "+price(payload.support)+" como referência de sustentação."]
    : scenario==="BAIXA"
      ? ["Acompanhar a reação no suporte em "+price(payload.support)+" antes de considerar melhora.","Uma recuperação acima de "+price(payload.resistance)+" reduz a pressão vendedora."]
      : ["Aguardar rompimento confirmado de "+price(payload.resistance)+" ou perda de "+price(payload.support)+".","Evitar antecipar direção enquanto os sinais permanecerem divididos."];
  if(payload.multiRsi)strategy.push("Monitorar o RSI geral em "+payload.multiRsi.general.toFixed(1)+" para confirmar mudança de força.");
  const risks:string[]=[];
  if(payload.volumeRatio<1)risks.push("Volume em "+payload.volumeRatio.toFixed(2)+"× a média reduz a confirmação do movimento.");
  if(payload.confidence<60)risks.push("Concordância de "+payload.confidence+"% indica sinais técnicos ainda divididos.");
  if(Math.abs(payload.change)>=4)risks.push("Variação de "+payload.change.toFixed(2)+"% aumenta o risco de volatilidade.");
  if(!risks.length)risks.push("Mudanças rápidas de preço podem invalidar a leitura entre fechamentos de candle.");
  const invalidation=scenario==="ALTA"
    ? "A leitura perde força com fechamento abaixo do suporte em "+price(payload.support)+"."
    : scenario==="BAIXA"
      ? "A pressão de baixa é invalidada por fechamento acima da resistência em "+price(payload.resistance)+"."
      : "O cenário neutro deixa de valer após rompimento de "+price(payload.resistance)+" ou perda de "+price(payload.support)+".";
  return {headline:payload.asset+" em "+direction+" no período "+payload.period,scenario,summary:payload.asset+" registra nota "+(payload.score>0?"+":"")+payload.score+", confiança de "+payload.confidence+"% e preço atual em "+price(payload.currentPrice)+". Esta leitura é calculada localmente por regras transparentes.",strategy,risks:risks.slice(0,3),invalidation,generatedAt:new Date().toISOString(),provider:"local"};
}

const cacheKey=(payload:AiAnalysisRequest)=>"termometro-leitura-"+encodeURIComponent(payload.asset)+"-"+encodeURIComponent(payload.period);
export function readCachedAiAnalysis(payload:AiAnalysisRequest):AiAnalysisResponse|null{if(typeof window==="undefined")return null;try{const cached=JSON.parse(window.localStorage.getItem(cacheKey(payload))||"null");return cached?.expiresAt>Date.now()?cached.analysis:null;}catch{return null;}}
export function writeCachedAiAnalysis(payload:AiAnalysisRequest,analysis:AiAnalysisResponse){if(typeof window==="undefined")return;try{window.localStorage.setItem(cacheKey(payload),JSON.stringify({expiresAt:Date.now()+300000,analysis}));}catch{}}

export class AiAnalysisError extends Error {
  readonly status:number;
  readonly retryAfterSeconds:number;
  constructor(message:string,status:number,retryAfterSeconds=0){super(message);this.name="AiAnalysisError";this.status=status;this.retryAfterSeconds=retryAfterSeconds;}
}
export async function fetchAiAnalysis(payload:AiAnalysisRequest,signal?:AbortSignal):Promise<AiAnalysisResponse>{if(signal?.aborted)throw new DOMException("Solicitação cancelada.","AbortError");return payload.localPreview||buildLocalAiPreview(payload);}

export type AssetNewsItem={title:string;url:string;source:string;publishedAt:string|null};
export type AssetNewsResponse={asset:string;updatedAt:string;items:AssetNewsItem[]};
export async function fetchAssetNews(asset:string,signal?:AbortSignal):Promise<AssetNewsResponse>{if(signal?.aborted)throw new DOMException("Solicitação cancelada.","AbortError");return {asset,updatedAt:new Date().toISOString(),items:[]};}

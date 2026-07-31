/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  GROQ_API_KEY?: string;
  GEMINI_API_KEY?: string;
  OPENCODE_API_KEY?: string;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}
const ALLOWED_AI_ORIGINS = new Set([
  "https://bitcoiniciantes.github.io",
  "https://termometro-estude-bitcoin.bitcoiniciantes.chatgpt.site",
]);

function aiCorsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return new Headers();
  const parsed = new URL(origin);
  const local = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if (!ALLOWED_AI_ORIGINS.has(origin) && !local) return null;
  return new Headers({
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  });
}

type NewsItem = { title: string; url: string; source: string; publishedAt: string | null };

function decodeXml(value: string) {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").trim();
}

function rssTag(xml: string, tag: string) {
  return decodeXml(xml.match(new RegExp("<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*?)<\\/" + tag + ">", "i"))?.[1] || "");
}

async function handleAssetNews(request: Request): Promise<Response> {
  if (request.method !== "GET") return Response.json({ error: "M?todo n?o permitido." }, { status: 405 });
  const asset = (new URL(request.url).searchParams.get("asset") || "").toUpperCase();
  if (!/^[A-Z0-9]{2,12}$/.test(asset)) return Response.json({ error: "Ativo inv?lido." }, { status: 400 });
  const query = asset + " cryptocurrency when:2d";
  const rssUrl = "https://news.google.com/rss/search?q=" + encodeURIComponent(query) + "&hl=pt-BR&gl=BR&ceid=BR:pt-419";
  try {
    const response = await fetch(rssUrl, { headers: { "User-Agent": "TermometroEstudeBitcoin/1.0" } });
    if (!response.ok) throw new Error("news source unavailable");
    const xml = await response.text();
    const items: NewsItem[] = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/gi)].slice(0, 3).map(match => {
      const item = match[1];
      const title = rssTag(item, "title").replace(/\s+-\s+[^-]+$/, "");
      const url = rssTag(item, "link");
      const source = rssTag(item, "source") || "Google News";
      const date = rssTag(item, "pubDate");
      const publishedAt = date && !Number.isNaN(Date.parse(date)) ? new Date(date).toISOString() : null;
      return { title, url, source, publishedAt };
    }).filter(item => item.title && /^https:\/\//.test(item.url));
    return Response.json({ asset, updatedAt: new Date().toISOString(), items });
  } catch {
    return Response.json({ asset, updatedAt: new Date().toISOString(), items: [] });
  }
}

const AI_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["headline", "scenario", "summary", "strategy", "risks", "invalidation"],
  properties: {
    headline: { type: "string" },
    scenario: { type: "string", enum: ["ALTA", "BAIXA", "NEUTRO", "RISCO ELEVADO"] },
    summary: { type: "string" },
    strategy: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
    risks: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
    invalidation: { type: "string" },
  },
} as const;

type AiProvider = "groq" | "gemini" | "mimo";
type AiAnalysis = {
  headline: string;
  scenario: "ALTA" | "BAIXA" | "NEUTRO" | "RISCO ELEVADO";
  summary: string;
  strategy: string[];
  risks: string[];
  invalidation: string;
};

function parseAiAnalysis(text: string): AiAnalysis | null {
  try {
    const cleaned = text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, "");
    const analysis = JSON.parse(cleaned) as Record<string, unknown>;
    const scenarios = new Set(["ALTA", "BAIXA", "NEUTRO", "RISCO ELEVADO"]);
    const strings = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every(item => typeof item === "string");
    const valid = typeof analysis.headline === "string"
      && typeof analysis.scenario === "string" && scenarios.has(analysis.scenario)
      && typeof analysis.summary === "string"
      && strings(analysis.strategy) && analysis.strategy.length >= 2 && analysis.strategy.length <= 4
      && strings(analysis.risks) && analysis.risks.length >= 1 && analysis.risks.length <= 3
      && typeof analysis.invalidation === "string";
    return valid ? analysis as AiAnalysis : null;
  } catch {
    return null;
  }
}

function completedAnalysis(analysis: AiAnalysis, provider: AiProvider) {
  return Response.json({ ...analysis, provider, generatedAt: new Date().toISOString() });
}

async function requestMimo(prompt: string, apiKey: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch("https://opencode.ai/zen/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "mimo-v2.5-free",
        messages: [
          {
            role: "system",
            content: "Responda somente com um objeto JSON válido, sem markdown ou comentários.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.warn("OpenCode MiMo request failed", response.status);
      return null;
    }
    type OpenCodeBody = { choices?: Array<{ message?: { content?: string } }> };
    const body = await response.json().catch(() => null) as OpenCodeBody | null;
    const text = body?.choices?.[0]?.message?.content;
    if (!text) return null;
    const analysis = parseAiAnalysis(text);
    return analysis ? completedAnalysis(analysis, "mimo") : null;
  } catch (error) {
    console.warn(
      "OpenCode MiMo request error",
      error instanceof Error ? error.name : "unknown",
    );
    return null;
  } finally {
    clearTimeout(timeout);
  }
}


async function requestGroq(prompt: string, apiKey: string): Promise<Response | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + apiKey,
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Responda somente com um objeto JSON válido, sem markdown ou comentários." },
          { role: "user", content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 1800,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });
    if (!response.ok) return null;
    type GroqBody = { choices?: Array<{ message?: { content?: string } }> };
    const body = await response.json().catch(() => null) as GroqBody | null;
    const text = body?.choices?.[0]?.message?.content;
    const analysis = text ? parseAiAnalysis(text) : null;
    return analysis ? completedAnalysis(analysis, "groq") : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

async function requestGemini(prompt: string, apiKey: string): Promise<Response> {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      model: "gemini-3.6-flash",
      input: prompt,
      generation_config: { thinking_level: "minimal", max_output_tokens: 3000 },
      response_format: { type: "text", mime_type: "application/json", schema: AI_SCHEMA },
    }),
  });
  type GeminiBody = {
    error?: { message?: string };
    status?: string;
    output_text?: string;
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  const parsed = await response.json().catch(() => null) as GeminiBody | GeminiBody[] | null;
  const body = Array.isArray(parsed) ? parsed[0] : parsed;
  if (!response.ok) {
    const retryMatch = body?.error?.message?.match(/Please retry in ([0-9.]+)s/i);
    const retryAfterSeconds = retryMatch ? Math.max(1, Math.ceil(Number(retryMatch[1]))) : undefined;
    const message = response.status === 429
      ? retryAfterSeconds
        ? "Limite temporário da API atingido. Aguarde " + retryAfterSeconds + "s."
        : "Limite temporário da API atingido. Tente novamente em instantes."
      : body?.error?.message || "Os serviços de IA não responderam.";
    return Response.json(
      { error: message, retryAfterSeconds },
      {
        status: response.status,
        headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined,
      },
    );
  }
  if (body?.status !== "completed") {
    return Response.json({ error: "A IA não concluiu a análise. Tente novamente." }, { status: 502 });
  }
  const outputs = body?.steps?.filter(step => step.type === "model_output") || [];
  const last = outputs[outputs.length - 1];
  const text = body?.output_text || last?.content
    ?.filter(content => content.type === "text")
    .map(content => content.text || "")
    .join("");
  if (!text) return Response.json({ error: "A IA não retornou uma análise válida." }, { status: 502 });
  const analysis = parseAiAnalysis(text);
  return analysis
    ? completedAnalysis(analysis, "gemini")
    : Response.json({ error: "A IA retornou um formato inesperado." }, { status: 502 });
}

async function handleAiAnalysis(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });
  if (!env.GROQ_API_KEY && !env.GEMINI_API_KEY && !env.OPENCODE_API_KEY) {
    return Response.json({ error: "Os serviços de IA ainda não foram configurados." }, { status: 503 });
  }
  if (Number(request.headers.get("content-length") || 0) > 24_000) {
    return Response.json({ error: "Solicitação muito grande." }, { status: 413 });
  }
  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return Response.json({ error: "Dados técnicos inválidos." }, { status: 400 });
  }
  const prompt = [
    "Você é um analista educacional de mercado.",
    "Interprete somente os indicadores fornecidos, sem inventar preços, notícias ou dados.",
    "Não prometa retorno e não dê ordem personalizada de compra ou venda.",
    "Apresente um cenário condicional, objetivo e prudente em português do Brasil.",
    "Explique o que observar, os riscos e o que invalidaria a leitura.",
    "Use a pré-análise local do payload como base e escreva no máximo 220 palavras.",
    "Retorne exatamente um JSON com headline, scenario, summary, strategy, risks e invalidation.",
    "scenario deve ser ALTA, BAIXA, NEUTRO ou RISCO ELEVADO.",
    "strategy deve ter de 2 a 4 itens e risks de 1 a 3 itens.",
    "Dados técnicos determinísticos:",
    JSON.stringify(payload),
  ].join("\n");
  if (env.GROQ_API_KEY) {
    try {
      const groq = await requestGroq(prompt, env.GROQ_API_KEY);
      if (groq) return groq;
    } catch {}
  }
  if (env.GEMINI_API_KEY) {
    const gemini = await requestGemini(prompt, env.GEMINI_API_KEY);
    if (gemini.ok) return gemini;
  }
  if (env.OPENCODE_API_KEY) {
    try {
      const mimo = await requestMimo(prompt, env.OPENCODE_API_KEY);
      if (mimo) return mimo;
    } catch {}
  }
  return Response.json({ error: "Os serviços de IA estão temporariamente indisponíveis." }, { status: 503 });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (url.pathname === "/api/ai-analysis") {
      const cors = aiCorsHeaders(request);
      if (!cors) return Response.json({ error: "Origem não autorizada." }, { status: 403 });
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const response = await handleAiAnalysis(request, env);
      const headers = new Headers(response.headers);
      cors.forEach((value, key) => headers.set(key, value));
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }


    if (url.pathname === "/api/asset-news") {
      const cors = aiCorsHeaders(request);
      if (!cors) return Response.json({ error: "Origem n?o autorizada." }, { status: 403 });
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
      const response = await handleAssetNews(request);
      const headers = new Headers(response.headers);
      cors.forEach((value, key) => headers.set(key, value));
      return new Response(response.body, { status: response.status, headers });
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

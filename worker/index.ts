/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  GEMINI_API_KEY?: string;
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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  });
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

async function handleAiAnalysis(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "Método não permitido." }, { status: 405 });
  if (!env.GEMINI_API_KEY) {
    return Response.json({ error: "A chave do Gemini ainda não foi configurada no servidor." }, { status: 503 });
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
    "Dados técnicos determinísticos:",
    JSON.stringify(payload),
  ].join("\n");
  const geminiResponse = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/interactions",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        model: "gemini-3.6-flash",
        input: prompt,
        generation_config: {
          temperature: 0.2,
          max_output_tokens: 1000,
        },
        response_format: [{
          type: "text",
          mime_type: "application/json",
          schema: AI_SCHEMA,
        }],
      }),
    },
  );
  type GeminiBody = {
    error?: { message?: string };
    steps?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }>;
  };
  const parsedGeminiBody = (await geminiResponse.json().catch(() => null)) as GeminiBody | GeminiBody[] | null;
  const geminiBody = Array.isArray(parsedGeminiBody) ? parsedGeminiBody[0] : parsedGeminiBody;
  if (!geminiResponse.ok) {
    const message = geminiResponse.status === 429
      ? "Limite temporário da API atingido. Tente novamente em instantes."
      : geminiBody?.error?.message || "O Gemini não respondeu.";
    return Response.json({ error: message }, { status: geminiResponse.status });
  }
  const text = geminiBody?.steps
    ?.filter(step => step.type === "model_output")
    .flatMap(step => step.content || [])
    .filter(content => content.type === "text")
    .map(content => content.text || "")
    .join("");
  if (!text) return Response.json({ error: "O Gemini não retornou uma análise válida." }, { status: 502 });
  try {
    return Response.json({ ...JSON.parse(text), generatedAt: new Date().toISOString() });
  } catch {
    return Response.json({ error: "O Gemini retornou um formato inesperado." }, { status: 502 });
  }
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

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

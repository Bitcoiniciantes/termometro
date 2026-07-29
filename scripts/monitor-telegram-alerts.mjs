import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

import { alertBand, alertTransition } from "../lib/alerts.ts";
import { analyze, completedCandles, scoreLabel } from "../lib/analysis.ts";

const SITE_URL = "https://bitcoiniciantes.github.io/termometro/";
const STATE_PATH = new URL("../.alert-state/state.json", import.meta.url);
const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SETUP_TEST = process.env.TELEGRAM_SETUP_TEST === "true";

const assets = [
  { asset: "BTC", period: "15M", source: "binance" },
  { asset: "ETH", period: "15M", source: "binance" },
  { asset: "LINK", period: "15M", source: "binance" },
  { asset: "AVAX", period: "15M", source: "binance" },
  { asset: "SOL", period: "15M", source: "binance" },
  { asset: "MSTR", period: "1H", source: "static", file: "mstr" },
  { asset: "PRATA", period: "1H", source: "static", file: "prata" },
  { asset: "COBRE", period: "1H", source: "static", file: "cobre" },
  { asset: "URÂNIO", marketAsset: "URANIO", period: "1H", source: "static", file: "uranio" },
];

function finiteCandle(row) {
  if (!Array.isArray(row) || row.length < 6) return null;
  const [time, open, high, low, close, volume] = row.slice(0, 6).map(Number);
  if (![time, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

async function fetchJson(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(12_000),
      });
      const body = await response.json().catch(() => null);
      if (response.ok) return body;
      throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, attempt * 750));
      }
    }
  }
  throw lastError;
}

async function marketData(config) {
  if (config.source === "binance") {
    const body = await fetchJson(
      `https://data-api.binance.vision/api/v3/klines?symbol=${config.asset}USDT&interval=15m&limit=120`,
    );
    const candles = Array.isArray(body) ? body.map(finiteCandle).filter(Boolean) : [];
    if (candles.length < 55) throw new Error("histórico insuficiente");
    return {
      asset: config.asset,
      pair: `${config.asset}/USDT`,
      source: "Binance Public Market Data",
      updatedAt: Date.now(),
      period: config.period,
      candles,
    };
  }

  const snapshot = await fetchJson(
    `${SITE_URL}data/${config.file}.json?v=${Math.floor(Date.now() / 60_000)}`,
    { headers: { "User-Agent": "TermometroTelegramAlerts/1.0" } },
  );
  const candles = snapshot?.periods?.[config.period] ?? [];
  if (candles.length < 55) throw new Error("histórico insuficiente");
  const asset = config.marketAsset ?? config.asset;
  return {
    asset,
    pair: `${asset}/USD`,
    source: snapshot.source,
    updatedAt: snapshot.updatedAt,
    period: config.period,
    candles,
  };
}

async function readState() {
  try {
    const content = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(content);
    return parsed?.version === 1 && parsed.readings ? parsed : { version: 1, readings: {} };
  } catch {
    return { version: 1, readings: {} };
  }
}

async function saveState(state) {
  await mkdir(new URL("../.alert-state/", import.meta.url), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function telegramUrl(method) {
  return `https://api.telegram.org/bot${TOKEN}/${method}`;
}

async function findPrivateChatId() {
  const updates = await fetchJson(`${telegramUrl("getUpdates")}?limit=100&timeout=0`);
  const messages = (updates?.result ?? [])
    .map((update) => update.message)
    .filter((message) => message?.chat?.type === "private");
  const started = messages.find((message) => message.text?.startsWith("/start"));
  const message = started ?? messages[0];
  if (!message?.chat?.id) {
    throw new Error("Conversa privada não localizada. Envie /start ao bot e execute novamente.");
  }
  return message.chat.id;
}

async function sendMessage(chatId, text) {
  const result = await fetchJson(telegramUrl("sendMessage"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  });
  if (!result?.ok) throw new Error("Telegram recusou a mensagem");
}

function localTime(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function signalSummary(reading, group) {
  return reading.signals.find((signal) => signal.group === group)?.summary;
}

function alertMessage(config, reading, transition, candleTime) {
  const icon = transition === "ENCERROU" ? "⚪" : transition === "FORTALECEU" ? "🚀" : "🟢";
  const title =
    transition === "ENCERROU"
      ? "CONDIÇÃO DE COMPRA ENCERRADA"
      : transition === "FORTALECEU"
        ? "CONDIÇÃO DE COMPRA FORTALECEU"
        : transition === "ENFRAQUECEU"
          ? "CONDIÇÃO CONTINUA, MAS PERDEU FORÇA"
          : "NOVA CONDIÇÃO TÉCNICA DE COMPRA";
  const details = [
    signalSummary(reading, "Momentum"),
    `ADX ${reading.extreme.adx.toFixed(1)}`,
    signalSummary(reading, "Volume"),
  ].filter(Boolean);

  return [
    `${icon} ${title}`,
    "",
    `Ativo: ${config.asset}`,
    `Período: ${config.period}`,
    `Nota: ${reading.score >= 0 ? "+" : ""}${reading.score} • ${scoreLabel(reading.score)}`,
    `Concordância dos sinais: ${reading.confidence}%`,
    ...details,
    `Candle encerrado: ${localTime(candleTime)}`,
    "",
    SITE_URL,
    "",
    "Alerta técnico educacional. Não representa garantia de resultado ou recomendação personalizada.",
  ].join("\n");
}

async function setOutput(name, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

async function main() {
  if (!TOKEN) throw new Error("TELEGRAM_BOT_TOKEN não configurado");

  const state = await readState();
  let stateChanged = false;
  const chatId = state.chatId ?? await findPrivateChatId();
  if (!state.chatId) {
    state.chatId = chatId;
    stateChanged = true;
  }
  let successful = 0;
  const errors = [];
  const pendingMessages = [];

  for (const config of assets) {
    try {
      const market = await marketData(config);
      const closed = completedCandles(market.candles, config.period);
      const lastClosed = closed.at(-1);
      const reading = analyze(market);
      if (!reading || !lastClosed) throw new Error("leitura indisponível");

      successful += 1;
      const key = `${config.marketAsset ?? config.asset}-${config.period}`;
      const currentBand = alertBand(reading.score);
      const previous = state.readings[key];

      if (previous?.candleTime === lastClosed.time) continue;

      const transition = alertTransition(previous?.band, currentBand);
      if (transition) {
        pendingMessages.push(alertMessage(config, reading, transition, lastClosed.time));
      }

      state.readings[key] = {
        band: currentBand,
        score: reading.score,
        candleTime: lastClosed.time,
        checkedAt: Date.now(),
      };
      stateChanged = true;
    } catch (error) {
      errors.push(`${config.asset}: ${error instanceof Error ? error.message : "falha desconhecida"}`);
    }
  }

  if (!successful) throw new Error(`Nenhum ativo analisado. ${errors.join(" • ")}`);

  if (SETUP_TEST) {
    await sendMessage(
      chatId,
      [
        "✅ ALERTAS DO TERMÔMETRO ATIVADOS",
        "",
        `${successful} de ${assets.length} ativos verificados.`,
        "Criptomoedas: candles de 15 minutos.",
        "MSTR, prata, cobre e urânio: candles de 1 hora.",
        "",
        "Você receberá mensagens somente quando uma condição de Compra ou Compra Forte surgir, mudar de intensidade ou terminar.",
      ].join("\n"),
    );
  } else {
    for (const message of pendingMessages) {
      await sendMessage(chatId, message);
    }
  }

  if (stateChanged) await saveState(state);
  await setOutput("state_changed", stateChanged ? "true" : "false");
  await setOutput("assets_ok", String(successful));
  console.log(
    `Monitoramento concluído: ${successful}/${assets.length} ativos • ${pendingMessages.length} transições${errors.length ? ` • ${errors.length} falhas` : ""}`,
  );
  for (const error of errors) console.warn(error);
}

await main();
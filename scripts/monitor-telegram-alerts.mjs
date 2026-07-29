import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";

import { alertBand, alertTransition, subscriberCommand } from "../lib/alerts.ts";
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

function emptyState() {
  return { version: 2, updateOffset: 0, subscribers: {}, readings: {} };
}

async function readState() {
  try {
    const content = await readFile(STATE_PATH, "utf8");
    const parsed = JSON.parse(content);
    if (parsed?.version === 2) {
      return {
        state: {
          version: 2,
          updateOffset: Number(parsed.updateOffset) || 0,
          subscribers: parsed.subscribers ?? {},
          readings: parsed.readings ?? {},
        },
        migrated: false,
      };
    }
    if (parsed?.version === 1) {
      const subscribers = {};
      if (parsed.chatId) {
        subscribers[String(parsed.chatId)] = {
          active: true,
          joinedAt: Date.now(),
        };
      }
      return {
        state: {
          version: 2,
          updateOffset: 0,
          subscribers,
          readings: parsed.readings ?? {},
        },
        migrated: true,
      };
    }
  } catch {
    // Primeira execução: o estado será criado depois do primeiro /start.
  }
  return { state: emptyState(), migrated: false };
}

async function saveState(state) {
  await mkdir(new URL("../.alert-state/", import.meta.url), { recursive: true });
  await writeFile(STATE_PATH, `${JSON.stringify(state, null, 2)}\n`);
}

function telegramUrl(method) {
  return `https://api.telegram.org/bot${TOKEN}/${method}`;
}

async function botUsername() {
  const response = await fetchJson(telegramUrl("getMe"));
  if (!response?.result?.username) throw new Error("Username do bot não localizado");
  return response.result.username;
}

async function getUpdates(offset) {
  const response = await fetchJson(
    `${telegramUrl("getUpdates")}?offset=${offset}&limit=100&timeout=0`,
  );
  return Array.isArray(response?.result) ? response.result : [];
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

function welcomeMessage() {
  return [
    "✅ ALERTAS DO TERMÔMETRO ATIVADOS",
    "",
    "Você receberá os mesmos alertas técnicos dos nove ativos monitorados.",
    "Criptomoedas: candles de 15 minutos.",
    "MSTR, prata, cobre e urânio: candles de 1 hora.",
    "",
    "Comandos:",
    "/status — consultar o monitoramento",
    "/parar — deixar de receber alertas",
    "/ajuda — mostrar estas instruções",
  ].join("\n");
}

function statusMessage(active) {
  return active
    ? "✅ Seus alertas estão ativos. Nove ativos estão sendo monitorados. Para sair, envie /parar."
    : "⏸ Seus alertas estão pausados. Para voltar a receber, envie /start.";
}

function helpMessage() {
  return [
    "COMANDOS DO TERMÔMETRO",
    "",
    "/start — ativar os alertas",
    "/status — verificar se estão ativos",
    "/parar — deixar de receber",
  ].join("\n");
}

async function processSubscriberUpdates(state) {
  const updates = await getUpdates((state.updateOffset || 0) + 1);
  if (!updates.length) return { changed: false, commands: 0 };

  state.updateOffset = Math.max(...updates.map((update) => Number(update.update_id) || 0));
  const latestByChat = new Map();

  for (const update of updates) {
    const message = update.message;
    if (message?.chat?.type !== "private") continue;
    const command = subscriberCommand(message.text);
    if (!command) continue;
    latestByChat.set(String(message.chat.id), command);
  }

  for (const [chatId, command] of latestByChat) {
    const existing = state.subscribers[chatId];
    if (command === "START") {
      state.subscribers[chatId] = {
        active: true,
        joinedAt: existing?.joinedAt ?? Date.now(),
      };
      await sendMessage(chatId, welcomeMessage());
    } else if (command === "STOP") {
      await sendMessage(chatId, "⏸ Alertas pausados. Quando quiser voltar, envie /start.");
      state.subscribers[chatId] = {
        active: false,
        joinedAt: existing?.joinedAt ?? Date.now(),
      };
    } else if (command === "STATUS") {
      await sendMessage(chatId, statusMessage(Boolean(existing?.active)));
    } else if (command === "HELP") {
      await sendMessage(chatId, helpMessage());
    }
  }

  return { changed: true, commands: latestByChat.size };
}

function activeSubscribers(state) {
  return Object.entries(state.subscribers)
    .filter(([, subscriber]) => subscriber?.active)
    .map(([chatId]) => chatId);
}

async function broadcast(state, text) {
  let delivered = 0;
  let disabled = 0;
  let failed = 0;

  for (const chatId of activeSubscribers(state)) {
    try {
      await sendMessage(chatId, text);
      delivered += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/HTTP (400|403)/.test(message)) {
        state.subscribers[chatId].active = false;
        disabled += 1;
      } else {
        failed += 1;
      }
    }
  }

  return { delivered, disabled, failed };
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

  const username = await botUsername();
  const { state, migrated } = await readState();
  let stateChanged = migrated;
  const subscriberUpdates = await processSubscriberUpdates(state);
  stateChanged ||= subscriberUpdates.changed;

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

  let delivery = { delivered: 0, disabled: 0, failed: 0 };
  if (SETUP_TEST) {
    delivery = await broadcast(
      state,
      [
        "✅ BOT PARA AMIGOS ATIVADO",
        "",
        `${successful} de ${assets.length} ativos verificados.`,
        "",
        "Compartilhe este link:",
        `https://t.me/${username}`,
        "",
        "Cada amigo precisa tocar em Iniciar. Para sair, basta enviar /parar.",
      ].join("\n"),
    );
  } else {
    for (const message of pendingMessages) {
      const result = await broadcast(state, message);
      delivery.delivered += result.delivered;
      delivery.disabled += result.disabled;
      delivery.failed += result.failed;
    }
  }

  if (delivery.disabled) stateChanged = true;
  if (stateChanged) await saveState(state);
  await setOutput("state_changed", stateChanged ? "true" : "false");
  await setOutput("assets_ok", String(successful));
  await setOutput("subscribers", String(activeSubscribers(state).length));
  console.log(
    `Monitoramento concluído: ${successful}/${assets.length} ativos • ${activeSubscribers(state).length} assinantes ativos • ${pendingMessages.length} transições • ${subscriberUpdates.commands} comandos`,
  );
  if (delivery.failed) console.warn(`${delivery.failed} entregas temporariamente indisponíveis`);
  for (const error of errors) console.warn(error);
}

await main();
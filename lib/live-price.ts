export type LivePriceStatus = "off" | "connecting" | "live" | "reconnecting";

export type LivePriceTick = {
  price: number;
  eventTime: number;
};

type LivePriceCallbacks = {
  onPrice: (tick: LivePriceTick) => void;
  onStatus: (status: LivePriceStatus) => void;
};

export function livePriceStreamUrl(asset: string) {
  const symbol = asset.trim().toLowerCase();
  if (!/^[a-z0-9]{2,20}$/.test(symbol)) throw new Error("Símbolo inválido para cotação ao vivo");
  return `wss://data-stream.binance.vision/ws/${symbol}usdt@ticker`;
}

export function parseLiveTicker(payload: unknown): LivePriceTick | null {
  let body = payload;
  if (typeof payload === "string") {
    try {
      body = JSON.parse(payload);
    } catch {
      return null;
    }
  }
  if (!body || typeof body !== "object") return null;
  const ticker = body as { c?: unknown; E?: unknown };
  const price = Number(ticker.c);
  const eventTime = Number(ticker.E);
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(eventTime)) return null;
  return { price, eventTime };
}

export function subscribeLivePrice(asset: string, callbacks: LivePriceCallbacks) {
  let socket: WebSocket | null = null;
  let reconnectTimer: number | null = null;
  let heartbeatTimer: number | null = null;
  let lastTickAt = 0;
  let stopped = false;
  let retries = 0;
  const url = livePriceStreamUrl(asset);

  const connect = () => {
    if (stopped) return;
    callbacks.onStatus(retries ? "reconnecting" : "connecting");
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      retries = 0;
      lastTickAt = Date.now();
      heartbeatTimer = window.setInterval(() => {
        if (Date.now() - lastTickAt > 5_000) socket?.close();
      }, 1_000);
    });
    socket.addEventListener("message", (event) => {
      const tick = parseLiveTicker(event.data);
      if (tick) {
        lastTickAt = Date.now();
        callbacks.onStatus("live");
        callbacks.onPrice(tick);
      }
    });
    socket.addEventListener("error", () => socket?.close());
    socket.addEventListener("close", () => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      if (stopped) return;
      retries += 1;
      callbacks.onStatus("reconnecting");
      const delay = Math.min(1_000 * 2 ** Math.min(retries - 1, 4), 15_000);
      reconnectTimer = window.setTimeout(connect, delay);
    });
  };

  connect();
  return () => {
    stopped = true;
    if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
    if (heartbeatTimer !== null) window.clearInterval(heartbeatTimer);
    socket?.close();
  };
}

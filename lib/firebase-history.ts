import { createSign } from "node:crypto";

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ??
  "https://mural-bitcoiniciantes-default-rtdb.firebaseio.com";
const SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

const base64Url = (value: string) => Buffer.from(value).toString("base64url");

function safeKey(value: string | number) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.#$[\]/]/g, "_")
    .toLowerCase();
}

async function accessToken(serviceAccount: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: serviceAccount.client_email,
    scope: [
      "https://www.googleapis.com/auth/firebase.database",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "),
    aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const signer = createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const assertion = `${unsigned}.${signer.sign(serviceAccount.private_key, "base64url")}`;
  const response = await fetch(
    serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      signal: AbortSignal.timeout(12_000),
    },
  );
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) {
    throw new Error(`Firebase recusou a autenticação (${response.status})`);
  }
  return body.access_token as string;
}

export function firebaseHistoryConfigured() {
  return Boolean(SERVICE_ACCOUNT_JSON);
}

export async function saveFirebaseHistory(
  readings: Array<{
    asset: string;
    period: string;
    candleTime: number;
    checkedAt: number;
    price: number;
    score: number;
    band: string;
    agreement: number;
    rsi: number;
    adx: number;
    atrDistance: number;
    volumeRatio: number;
    divergence: string | null;
    capitulation: boolean;
  }>,
  events: Array<{
    asset: string;
    period: string;
    candleTime: number;
    type: string;
    score: number;
    detail?: string;
  }>,
) {
  if (!SERVICE_ACCOUNT_JSON || (!readings.length && !events.length)) {
    return { configured: Boolean(SERVICE_ACCOUNT_JSON), readings: 0, events: 0 };
  }

  const serviceAccount = JSON.parse(SERVICE_ACCOUNT_JSON) as ServiceAccount;
  const token = await accessToken(serviceAccount);
  const updates: Record<string, unknown> = {};

  for (const reading of readings) {
    const key = `${safeKey(reading.asset)}_${safeKey(reading.period)}_${reading.candleTime}`;
    updates[`termometro/leituras/${key}`] = reading;
  }
  for (const event of events) {
    const key = `${event.candleTime}_${safeKey(event.asset)}_${safeKey(event.period)}_${safeKey(event.type)}`;
    updates[`termometro/eventos/${key}`] = { ...event, recordedAt: Date.now() };
  }

  const response = await fetch(
    `${DATABASE_URL.replace(/\/$/, "")}/.json?access_token=${encodeURIComponent(token)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (!response.ok) throw new Error(`Firebase recusou o histórico (${response.status})`);
  return { configured: true, readings: readings.length, events: events.length };
}
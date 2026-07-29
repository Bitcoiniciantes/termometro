export type AlertBand = "FORA" | "COMPRA" | "COMPRA_FORTE";

export type AlertTransition = "ENTRADA" | "FORTALECEU" | "ENFRAQUECEU" | "ENCERROU" | null;
export type AlertPreference = "FORTES" | "TODOS" | "CAPITULACAO";
export type AlertKind = "COMPRA" | "COMPRA_FORTE" | "SAIDA_COMPRA" | "SAIDA_FORTE" | "CAPITULACAO";
export type SubscriberCommand =
  | "START"
  | "STOP"
  | "STATUS"
  | "HELP"
  | AlertPreference
  | null;

export function alertBand(score: number): AlertBand {
  if (score >= 55) return "COMPRA_FORTE";
  if (score >= 20) return "COMPRA";
  return "FORA";
}

export function alertTransition(
  previous: AlertBand | undefined,
  current: AlertBand,
): AlertTransition {
  if (!previous || previous === current) return null;
  if (previous === "FORA" && current !== "FORA") return "ENTRADA";
  if (previous === "COMPRA" && current === "COMPRA_FORTE") return "FORTALECEU";
  if (previous === "COMPRA_FORTE" && current === "COMPRA") return "ENFRAQUECEU";
  if (previous !== "FORA" && current === "FORA") return "ENCERROU";
  return null;
}

export function capitulationDetected(metrics: {
  rsi: number;
  atrDistance: number;
  volumeRatio: number;
}) {
  return metrics.rsi <= 30 && metrics.atrDistance <= -2 && metrics.volumeRatio >= 1.5;
}

export function alertKind(
  transition: AlertTransition,
  current: AlertBand,
  previous?: AlertBand,
): AlertKind | null {
  if (!transition) return null;
  if (transition === "ENFRAQUECEU") return "SAIDA_FORTE";
  if (transition === "ENCERROU") {
    return previous === "COMPRA_FORTE" ? "SAIDA_FORTE" : "SAIDA_COMPRA";
  }
  return current === "COMPRA_FORTE" ? "COMPRA_FORTE" : "COMPRA";
}

export function shouldDeliverAlert(preference: AlertPreference, kind: AlertKind) {
  if (kind === "CAPITULACAO") return true;
  if (preference === "CAPITULACAO") return false;
  if (preference === "TODOS") return true;
  return kind === "COMPRA_FORTE" || kind === "SAIDA_FORTE";
}
export function subscriberCommand(text: unknown): SubscriberCommand {
  if (typeof text !== "string") return null;
  const command = text.trim().toLocaleLowerCase("pt-BR").split(/\s+/, 1)[0];
  if (command === "/start" || command === "/ativar" || command === "ativar") return "START";
  if (command === "/parar" || command === "parar") return "STOP";
  if (command === "/status" || command === "status") return "STATUS";
  if (command === "/ajuda" || command === "/help" || command === "ajuda") return "HELP";
  if (command === "/fortes" || command === "fortes") return "FORTES";
  if (command === "/todos" || command === "todos") return "TODOS";
  if (command === "/capitulacao" || command === "capitulacao" || command === "capitulação") {
    return "CAPITULACAO";
  }
  return null;
}

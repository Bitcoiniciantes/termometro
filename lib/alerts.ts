export type AlertBand = "FORA" | "COMPRA" | "COMPRA_FORTE";

export type AlertTransition = "ENTRADA" | "FORTALECEU" | "ENFRAQUECEU" | "ENCERROU" | null;
export type SubscriberCommand = "START" | "STOP" | "STATUS" | "HELP" | null;

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

export function subscriberCommand(text: unknown): SubscriberCommand {
  if (typeof text !== "string") return null;
  const command = text.trim().toLocaleLowerCase("pt-BR").split(/\s+/, 1)[0];
  if (command === "/start" || command === "/ativar" || command === "ativar") return "START";
  if (command === "/parar" || command === "parar") return "STOP";
  if (command === "/status" || command === "status") return "STATUS";
  if (command === "/ajuda" || command === "/help" || command === "ajuda") return "HELP";
  return null;
}

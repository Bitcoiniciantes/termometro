"use client";

import { useGlobalAlerts } from "./GlobalAlertContext";
import { SupportResistanceAlert } from "./SupportResistanceAlert";
import { displayAsset } from "../lib/config";
import type { TriggeredAlert } from "./GlobalAlertContext";

function FloatingAlert({ alert, currency }: { alert: TriggeredAlert; currency: string }) {
  const { removeActiveAlert } = useGlobalAlerts();

  // O toast permanece visível até o usuário fechar (×) ou confirmar OK no card;
  // o estado do card também só é limpo por essas ações.
  return (
    <SupportResistanceAlert
      alertId={alert.id}
      asset={displayAsset(alert.symbol.replace(/(USDT|USD)$/, ""))}
      currency={currency}
      isVisible={true}
      price={alert.price}
      support={alert.support}
      resistance={alert.resistance}
      removeAlert={removeActiveAlert}
      type={alert.type}
    />
  );
}

export function GlobalAlertRenderer({ currency }: { currency: string }) {
  const { activeAlerts } = useGlobalAlerts();

  if (activeAlerts.length === 0) return null;

  return (
    <div
      className="globalAlertContainer"
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {activeAlerts.map((alert) => (
        <FloatingAlert key={alert.id} alert={alert} currency={currency} />
      ))}
    </div>
  );
}

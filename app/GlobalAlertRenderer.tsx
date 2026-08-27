"use client";

import { useEffect, useState } from "react";
import { useGlobalAlerts } from "./GlobalAlertContext";
import { SupportResistanceAlert } from "./SupportResistanceAlert";
import { displayAsset } from "../lib/config";
import type { TriggeredAlert } from "./GlobalAlertContext";

function FloatingAlert({ alert, currency }: { alert: TriggeredAlert; currency: string }) {
  const { removeActiveAlert } = useGlobalAlerts();
  const [visible, setVisible] = useState(true);

  // A caixa flutuante some sozinha após 4s, mas o alerta continua
  // em activeAlerts: o card mantém o estado "congelado" até o OK.
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 4000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <SupportResistanceAlert
      alertId={alert.id}
      asset={displayAsset(alert.symbol.replace(/(USDT|USD)$/, ""))}
      currency={currency}
      isVisible={visible}
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

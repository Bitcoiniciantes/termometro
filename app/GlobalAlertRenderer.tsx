"use client";

import { useGlobalAlerts } from "./GlobalAlertContext";
import { SupportResistanceAlert } from "./SupportResistanceAlert";
import { displayAsset } from "../lib/config";

export function GlobalAlertRenderer({ currency }: { currency: string }) {
  const { activeAlerts, removeActiveAlert } = useGlobalAlerts();

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
        <SupportResistanceAlert
          key={alert.id}
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
      ))}
    </div>
  );
}

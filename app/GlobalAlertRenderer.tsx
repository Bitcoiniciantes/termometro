"use client";

import { useGlobalAlerts } from "./GlobalAlertContext";
import { SupportResistanceAlert } from "./SupportResistanceAlert";

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
          asset={alert.symbol}
          currency={currency}
          isVisible={true}
          price={alert.price}
          removeAlert={removeActiveAlert}
          type={alert.type}
        />
      ))}
    </div>
  );
}

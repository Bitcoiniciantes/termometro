"use client";

import { useEffect, useRef } from "react";
import { playBeep } from "../lib/audioAlert";

export function SupportResistanceAlert({
  alertId,
  asset,
  type,
  price,
  currency,
  isVisible,
  removeAlert,
}: {
  alertId: string;
  asset: string;
  type: "SUPPORT" | "RESISTANCE";
  price: number;
  currency: string;
  isVisible: boolean;
  removeAlert: (id: string) => void;
}) {
  const hasPlayedRef = useRef(false);

  useEffect(() => {
    if (isVisible && !hasPlayedRef.current) {
      playBeep();
      hasPlayedRef.current = true;
    }
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible) return;

    const timer = setTimeout(() => removeAlert(alertId), 10000);
    return () => clearTimeout(timer);
  }, [isVisible, alertId, removeAlert]);

  if (!isVisible) return null;

  const isSupport = type === "SUPPORT";

  return (
    <div className={`priceAlert ${isSupport ? "supportAlert" : "resistanceAlert"}`} role="alert" aria-live="assertive">
      <div className="priceAlertIcon">
        {isSupport ? "⬇️" : "⬆️"}
      </div>
      <div className="priceAlertContent">
        <strong>{isSupport ? "SUPORTE ATINGIDO" : "RESISTÊNCIA ATINGIDA"}</strong>
        <span>{asset}</span>
        <span className="priceAlertPrice">
          {currency} {price.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
      </div>
      <button
        className="priceAlertClose"
        onClick={() => removeAlert(alertId)}
        aria-label="Fechar alerta"
      >
        ×
      </button>
    </div>
  );
}

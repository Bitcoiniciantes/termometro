"use client";

import { useEffect } from "react";
import { useGlobalAlerts } from "./GlobalAlertContext";
import { displayAsset } from "../lib/config";

function formatNumber(value: number) {
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type AlertPanelProps = {
  livePrices: Record<string, number>;
  currentSymbol?: string;
  currentSupport?: number;
  currentResistance?: number;
  currentPeriod?: string;
  currentPrice?: number;
  currentAtr?: number;
};

export function AlertPanel({
  livePrices,
  currentSymbol,
  currentSupport,
  currentResistance,
  currentPeriod,
  currentPrice: selectedPrice,
  currentAtr,
}: AlertPanelProps) {
  const { configs, activeAlerts, toggleAlert, removeConfig, removeActiveAlert } = useGlobalAlerts();
  const entries = Object.values(configs);

  // No mobile, o estado "congelado" do card se limpa sozinho após alguns segundos,
  // para não travar a tela esperando o OK.
  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth > 768) return;
    if (activeAlerts.length === 0) return;
    const timer = window.setTimeout(() => {
      activeAlerts.forEach((alert) => removeActiveAlert(alert.id));
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [activeAlerts, removeActiveAlert]);

  if (entries.length === 0) {
    return (
      <div className="alertPanel">
        <div className="alertPanelHead">
          <span className="alertPanelEyebrow">ALERTAS DE PREÇO</span>
          <span className="alertPanelSub">Suporte × Resistência</span>
        </div>
        <div className="alertPanelEmpty">Nenhum alerta configurado. Ative pelo botão 🔔 no gráfico.</div>
      </div>
    );
  }

  return (
    <div className="alertPanel">
      <div className="alertPanelHead">
        <span className="alertPanelEyebrow">ALERTAS DE PREÇO</span>
        <span className="alertPanelSub">Suporte × Resistência</span>
      </div>
      <div className="alertPanelGrid">
        {entries.map((config) => {
          const raw = config.symbol.replace(/(USDT|USD)$/, "");
          const displayName = displayAsset(raw);
          const currentPrice = livePrices[raw];
          const usesCurrentChart = config.symbol === currentSymbol && config.period === currentPeriod;
          const activationPrice = usesCurrentChart ? selectedPrice : currentPrice;
          const triggeredAlert = activeAlerts.find(a => a.symbol === config.symbol);
          const today = Number.isFinite(config.today) && config.today > 0
            ? <><span className="alertBaseLabel">Hoje: </span><b className="alertBaseValue">{formatNumber(config.today)}</b></>
            : <><span className="alertBaseLabel">Hoje: </span><em className="alertBaseWaiting">aguardando cotação…</em></>;

          return (
            <div key={config.symbol} className={`alertCard ${config.enabled ? "active" : "paused"}`}>
              <div className="alertCardHead">
                <span className="alertCardAsset">{displayName}</span>
                <div className="alertCardBadges">
                  <span className={`alertCardBadge ${config.enabled ? "on" : "off"}`}>
                    {config.enabled ? "ATIVO" : "PAUSADO"}
                  </span>
                  <span className="alertCardPeriod">{config.period}</span>
                </div>
              </div>
              <div className="alertCardLevels">
                <span className="alertLevel alertSupport">S {formatNumber(config.support)}</span>
                <span className="alertLevel alertResistance">R {formatNumber(config.resistance)}</span>
              </div>
              <div className="alertCardBase">
                <small>{today}</small>
              </div>
              {triggeredAlert && (
                <div className="alertCardTriggeredState">
                  <div className="triggeredTitle">
                    <span>⚡</span>
                    <strong>{triggeredAlert.type === "RESISTANCE" ? "RESISTÊNCIA ATINGIDA" : "SUPORTE ATINGIDO"}</strong>
                  </div>
                  <div className="triggeredFrozen">
                    <span>🧊</span>
                    <small>congelado</small>
                  </div>
                  <div className="triggeredAction">
                    <span>
                      ⏱️ {triggeredAlert.type === "RESISTANCE" ? "Resistência" : "Suporte"} em USDT {formatNumber(triggeredAlert.price)} —
                    </span>
                    <button
                      type="button"
                      className="alertOkBtn"
                      onClick={() => removeActiveAlert(triggeredAlert.id)}
                    >
                      OK
                    </button>
                  </div>
                </div>
              )}
              <div className="alertCardActions">
                <button
                  type="button"
                  className={`alertActionBtn ${config.enabled ? "pause" : "activate"}`}
                  onClick={() => config.enabled
                    ? toggleAlert(config.symbol)
                    : toggleAlert(
                      config.symbol,
                      usesCurrentChart ? currentSupport : undefined,
                      usesCurrentChart ? currentResistance : undefined,
                      config.source,
                      config.period,
                      activationPrice,
                      usesCurrentChart ? currentAtr : undefined,
                    )}
                  disabled={!config.enabled && !(activationPrice && activationPrice > 0)}
                  title={!config.enabled && !(activationPrice && activationPrice > 0) ? "Aguardando cotação atual para ativar" : undefined}
                >
                  {config.enabled ? "Pausar" : "Ativar"}
                </button>
                <button
                  type="button"
                  className="alertRemoveBtn"
                  onClick={() => removeConfig(config.symbol)}
                  aria-label={`Remover alerta de ${displayName}`}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

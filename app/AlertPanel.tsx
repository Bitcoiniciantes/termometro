"use client";

import { useGlobalAlerts } from "./GlobalAlertContext";
import { displayAsset } from "../lib/config";

function formatNumber(value: number) {
  const digits = value >= 1 ? 2 : 6;
  return value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function AlertPanel({ livePrices }: { livePrices: Record<string, number> }) {
  const { configs, activeAlerts, toggleAlert, removeConfig, removeActiveAlert } = useGlobalAlerts();
  const entries = Object.values(configs);

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
          const triggeredAlert = activeAlerts.find(a => a.symbol === config.symbol);
          const base = currentPrice
            ? <><span className="alertBaseLabel">Base: </span><b className="alertBaseValue">{formatNumber(currentPrice)}</b></>
            : <><span className="alertBaseLabel">Base: </span><em className="alertBaseWaiting">aguardando cotação…</em></>;

          return (
            <div key={config.symbol} className={`alertCard ${config.enabled ? "active" : "paused"}`}>
              <div className="alertCardHead">
                <span className="alertCardAsset">{displayName}</span>
                <div className="alertCardBadges">
                  <span className={`alertCardBadge ${config.enabled ? "on" : "off"}`}>
                    {config.enabled ? "ATIVO" : "PAUSADO"}
                  </span>
                </div>
              </div>
              <div className="alertCardLevels">
                <span className="alertLevel alertSupport">S {formatNumber(config.support)}</span>
                <span className="alertLevel alertResistance">R {formatNumber(config.resistance)}</span>
              </div>
              <div className="alertCardBase">
                <small>{base}</small>
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
                  onClick={() => toggleAlert(config.symbol, config.support, config.resistance, config.source, config.period)}
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

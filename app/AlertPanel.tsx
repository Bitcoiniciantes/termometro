"use client";

import { useGlobalAlerts } from "./GlobalAlertContext";
import { displayAsset, staticAssets } from "../lib/config";

function formatPrice(value: number, currency: string) {
  const digits = value >= 1 ? 2 : 6;
  return `${currency} ${value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function getCurrency(symbol: string): string {
  const base = symbol.replace(/(USDT|USD)$/, "");
  return staticAssets[base]?.currency ?? "USDT";
}

export function AlertPanel({ livePrices }: { livePrices: Record<string, number> }) {
  const { configs, toggleAlert, removeConfig } = useGlobalAlerts();
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
          const currency = getCurrency(config.symbol);
          const currentPrice = livePrices[raw];
          const base = currentPrice
            ? formatPrice(currentPrice, currency)
            : "Base: aguardando 1º preço";

          return (
            <div key={config.symbol} className={`alertCard ${config.enabled ? "active" : "paused"}`}>
              <div className="alertCardHead">
                <span className="alertCardAsset">{displayName}</span>
                <div className="alertCardBadges">
                  <span className={`alertCardBadge ${config.enabled ? "on" : "off"}`}>
                    {config.enabled ? "ATIVO" : "PAUSADO"}
                  </span>
                  {config.period && <span className="alertCardPeriod">{config.period}</span>}
                </div>
              </div>
              <div className="alertCardLevels">
                <span className="alertLevel support">S {formatPrice(config.support, currency)}</span>
                <span className="alertLevel resistance">R {formatPrice(config.resistance, currency)}</span>
              </div>
              <div className="alertCardBase">
                <small>{base}</small>
              </div>
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

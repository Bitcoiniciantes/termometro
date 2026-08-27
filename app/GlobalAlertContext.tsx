"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

export type AlertLevelSource = "GRAPH" | "PREDEFINED" | "MANUAL";

export type AssetAlertConfig = {
  symbol: string;
  support: number;
  resistance: number;
  enabled: boolean;
  source: AlertLevelSource;
  period?: string;
};

export type TriggeredAlert = {
  id: string;
  symbol: string;
  type: "SUPPORT" | "RESISTANCE";
  price: number;
  support: number;
  resistance: number;
  timestamp: number;
};

type GlobalAlertState = {
  configs: Record<string, AssetAlertConfig>;
  activeAlerts: TriggeredAlert[];
  toggleAlert: (symbol: string, support: number, resistance: number, source?: AlertLevelSource, period?: string) => void;
  removeActiveAlert: (id: string) => void;
  updateConfigLevels: (symbol: string, support: number, resistance: number, source?: AlertLevelSource, period?: string) => void;
  registerManualAlert: (symbol: string, support: number, resistance: number) => void;
  removeConfig: (symbol: string) => void;
};

export const AlertContext = createContext<GlobalAlertState | null>(null);

const STORAGE_KEY = "termometro-global-alert-configs";

const PREDEFINED_ALERTS: Record<string, AssetAlertConfig> = {
  BTCUSDT: { symbol: "BTCUSDT", support: 110000, resistance: 115000, enabled: false, source: "PREDEFINED" },
  ETHUSDT: { symbol: "ETHUSDT", support: 4400, resistance: 4800, enabled: false, source: "PREDEFINED" },
  SOLUSDT: { symbol: "SOLUSDT", support: 220, resistance: 250, enabled: false, source: "PREDEFINED" },
};

function loadPersistedConfigs(): Record<string, AssetAlertConfig> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, AssetAlertConfig>;
    return { ...PREDEFINED_ALERTS, ...parsed };
  } catch {
    return null;
  }
}

export function GlobalAlertProvider({
  children,
  livePrices,
}: {
  children: React.ReactNode;
  livePrices: Record<string, number>;
}) {
  const [configs, setConfigs] = useState<Record<string, AssetAlertConfig>>(PREDEFINED_ALERTS);
  const [activeAlerts, setActiveAlerts] = useState<TriggeredAlert[]>([]);
  const prevPricesRef = useRef<Record<string, number>>({});

  useEffect(() => {
    const persisted = loadPersistedConfigs();
    if (persisted) setConfigs(persisted);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
    } catch {
      // ignore
    }
  }, [configs]);

  const triggerAlert = useCallback(
    (symbol: string, type: "SUPPORT" | "RESISTANCE", price: number, support: number, resistance: number) => {
      setActiveAlerts((prev) => {
        if (prev.some((a) => a.symbol === symbol && a.type === type)) return prev;
        return [
          ...prev,
          { id: `${symbol}-${type}-${Date.now()}`, symbol, type, price, support, resistance, timestamp: Date.now() },
        ];
      });
    },
    []
  );

  useEffect(() => {
    Object.entries(livePrices).forEach(([symbol, currentPrice]) => {
      if (currentPrice == null || !Number.isFinite(currentPrice)) return;

      const previousPrice = prevPricesRef.current[symbol];
      prevPricesRef.current[symbol] = currentPrice;

      const config = configs[symbol];
      if (!config?.enabled || previousPrice === undefined) return;

      if (previousPrice < config.resistance && currentPrice >= config.resistance) {
        triggerAlert(symbol, "RESISTANCE", currentPrice, config.support, config.resistance);
      }

      if (previousPrice > config.support && currentPrice <= config.support) {
        triggerAlert(symbol, "SUPPORT", currentPrice, config.support, config.resistance);
      }
    });
  }, [livePrices, configs, triggerAlert]);

  const toggleAlert = useCallback(
    (symbol: string, support: number, resistance: number, source: AlertLevelSource = "GRAPH", period?: string) => {
      setConfigs((prev) => {
        const existing = prev[symbol];
        if (!existing) {
          return { ...prev, [symbol]: { symbol, support, resistance, enabled: true, source, period } };
        }
        if (existing.enabled) {
          return { ...prev, [symbol]: { ...existing, enabled: false } };
        }
        return { ...prev, [symbol]: { ...existing, support, resistance, source, enabled: true, period: period ?? existing.period } };
      });
    },
    []
  );

  const updateConfigLevels = useCallback(
    (symbol: string, support: number, resistance: number, source: AlertLevelSource = "GRAPH", period?: string) => {
      setConfigs((prev) => {
        const existing = prev[symbol];
        if (!existing) {
          return { ...prev, [symbol]: { symbol, support, resistance, enabled: false, source, period } };
        }
        if (existing.enabled) return prev;
        if (existing.support === support && existing.resistance === resistance && existing.period === period) return prev;
        return { ...prev, [symbol]: { ...existing, support, resistance, source, period: period ?? existing.period } };
      });
    },
    []
  );

  const registerManualAlert = useCallback(
    (symbol: string, support: number, resistance: number) => {
      setConfigs((prev) => ({
        ...prev,
        [symbol]: { symbol, support, resistance, enabled: true, source: "MANUAL" },
      }));
    },
    []
  );

  const removeConfig = useCallback((symbol: string) => {
    setConfigs((prev) => {
      const next = { ...prev };
      delete next[symbol];
      return next;
    });
    setActiveAlerts((prev) => prev.filter((a) => a.symbol !== symbol));
  }, []);

  const removeActiveAlert = useCallback((id: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const contextValue = useMemo(
    () => ({
      configs,
      activeAlerts,
      toggleAlert,
      removeActiveAlert,
      updateConfigLevels,
      registerManualAlert,
      removeConfig,
    }),
    [configs, activeAlerts, toggleAlert, removeActiveAlert, updateConfigLevels, registerManualAlert, removeConfig]
  );

  return (
    <AlertContext.Provider value={contextValue}>
      {children}
    </AlertContext.Provider>
  );
}

export const useGlobalAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) throw new Error("useGlobalAlerts must be used within GlobalAlertProvider");
  return context;
};

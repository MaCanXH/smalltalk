import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import type { AppSettings } from "../types";
import { DEFAULT_SETTINGS, getSettings, saveSettings } from "../lib/storage";
import { makeColors, type ThemeColors } from "../styles/global";

/**
 * Theme provider. Light lavender by default with a dark variant; the theme
 * mode and accent colour are user-configurable and persisted to storage.
 */

interface ThemeContextValue {
  colors: ThemeColors;
  settings: AppSettings;
  ready: boolean;
  setAccent: (accent: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    getSettings().then((s) => {
      if (active) {
        setSettings(s);
        setReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: AppSettings) => {
    setSettings(next);
    void saveSettings(next);
  }, []);

  const setAccent = useCallback(
    (accent: string) => persist({ ...settings, accent }),
    [persist, settings]
  );

  const updateSettings = useCallback(
    (patch: Partial<AppSettings>) => persist({ ...settings, ...patch }),
    [persist, settings]
  );

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: makeColors(settings.accent, settings.theme),
      settings,
      ready,
      setAccent,
      updateSettings,
    }),
    [settings, ready, setAccent, updateSettings]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";

import { applyTheme, DEFAULT_THEME, persistTheme, readStoredTheme, type Theme } from "./theme";

export interface UseThemeResult {
  theme: Theme;
  toggleTheme: () => void;
}

/** localStorage is the source of truth, so it is the external store React reads. */
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The server cannot read localStorage, so it always renders the default theme. */
function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

/**
 * Exposes the persisted theme without a hydration mismatch: React renders the
 * server snapshot first, then re-renders with the stored value. The DOM
 * attribute is written in an effect, mirroring what the inline script already
 * did before first paint.
 */
export function useTheme(): UseThemeResult {
  const theme = useSyncExternalStore(subscribe, readStoredTheme, getServerSnapshot);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    persistTheme(readStoredTheme() === "dark" ? "light" : "dark");
    for (const listener of listeners) listener();
  }, []);

  return { theme, toggleTheme };
}

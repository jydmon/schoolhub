"use client";

import { useEffect, useState } from "react";

// Refresh-persistent state. Mirrors a value to sessionStorage (per-tab) so that
// list filters, sort order, search text and page selections survive a browser
// refresh but reset when the tab is closed / the user signs out. Use a stable,
// unique key per control.
export function usePersistentState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const storageKey = `siplat.view.${key}`;
  const [value, setValue] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try { const s = window.sessionStorage.getItem(storageKey); return s != null ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  useEffect(() => {
    if (typeof window === "undefined") return;
    try { window.sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* quota / disabled — ignore */ }
  }, [storageKey, value]);
  return [value, setValue];
}

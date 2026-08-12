import { useEffect, useState, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { api } from "@/api/client";

/**
 * Cache-first data hook. Shows the last-synced payload instantly (offline
 * friendly), then revalidates from the live API. If a request fails and a
 * `fallback` was provided, it is used so screens are never blank.
 */
export function useApi<T = any>(path: string | null, fallback?: T) {
  const [data, setData] = useState<T | undefined>(fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!path) { setLoading(false); return; }
    setError(null);
    // cached first
    try {
      const cached = await AsyncStorage.getItem("api:" + path);
      if (cached) setData(JSON.parse(cached));
    } catch {}
    // live
    try {
      const fresh = await api.get<T>(path);
      setData(fresh);
      AsyncStorage.setItem("api:" + path, JSON.stringify(fresh)).catch(() => {});
    } catch (e: any) {
      setError(e?.message || "Couldn't load");
      setData((prev) => (prev !== undefined ? prev : fallback));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => { setLoading(true); load(); }, [load]);

  return { data, loading, error, reload: load };
}

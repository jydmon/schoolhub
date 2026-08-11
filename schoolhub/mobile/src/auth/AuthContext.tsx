import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { api, loadSession, setSession, hasSession } from "@/api/client";
import { registerForPush, unregisterPush } from "@/push/push";

type Bootstrap = { user: { id: string; email: string; name: string }; appRole: string; roles: string[]; schools: string[]; children: any[]; unreadNotifications: number; features: Record<string, boolean> };
type Ctx = {
  loading: boolean;
  boot: Bootstrap | null;
  error: string | null;
  login: (email: string, password: string, mfaToken?: string) => Promise<{ mfaRequired?: boolean } | void>;
  biometricUnlock: () => Promise<boolean>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasStoredSession: boolean;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [boot, setBoot] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pushToken, setPushToken] = useState<string | null>(null);
  const [hasStoredSession, setHasStored] = useState(false);

  const loadBoot = useCallback(async () => {
    const b = await api.get<Bootstrap>("/api/mobile/bootstrap");
    setBoot(b);
    registerForPush(b.appRole).then(setPushToken).catch(() => {});
    return b;
  }, []);

  // On launch: restore session; if present, require biometric before revealing data.
  useEffect(() => {
    (async () => {
      await loadSession();
      setHasStored(hasSession());
      setLoading(false);
    })();
  }, []);

  const biometricUnlock = useCallback(async () => {
    const hasHw = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    if (hasHw && enrolled) {
      const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock SchoolHub", fallbackLabel: "Use passcode" });
      if (!r.success) return false;
    }
    try { await loadBoot(); return true; } catch { setHasStored(false); return false; }
  }, [loadBoot]);

  const login = useCallback(async (email: string, password: string, mfaToken?: string) => {
    setError(null);
    try {
      const res = await api.post("/api/auth/login", { email, password, mfaToken });
      if (res?.mfaRequired) return { mfaRequired: true };
      if (res?.error) { setError(res.error); return; }
      setHasStored(true);
      await loadBoot();
    } catch (e: any) { setError(e?.message || "Login failed"); }
  }, [loadBoot]);

  const logout = useCallback(async () => {
    await unregisterPush(pushToken);
    try { await api.post("/api/auth/logout"); } catch {}
    await setSession(null);
    setBoot(null); setHasStored(false);
  }, [pushToken]);

  const refresh = useCallback(async () => { try { await loadBoot(); } catch {} }, [loadBoot]);

  return <AuthCtx.Provider value={{ loading, boot, error, login, biometricUnlock, logout, refresh, hasStoredSession }}>{children}</AuthCtx.Provider>;
}

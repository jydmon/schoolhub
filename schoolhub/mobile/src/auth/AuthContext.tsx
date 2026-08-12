import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { api, loadToken, setToken, hasToken } from "@/api/client";
import { RoleKey } from "@/data/mock";

/**
 * Real authentication against the SIPlat backend (dev.siplat.com).
 *  login  -> POST /api/auth/login  (returns { token, user } or { mfaRequired })
 *  then   -> GET  /api/mobile/bootstrap  (role, identity, children, unread)
 * The token is stored in the secure keystore and sent as a Bearer header.
 */
export type Boot = {
  role: RoleKey;
  user: { id: string; name: string; email: string };
  roles: string[];
  schools: string[];
  children: { id: string; name: string; yearGroup?: string }[];
  unread: number;
};

type Ctx = {
  loading: boolean;
  boot: Boot | null;
  error: string | null;
  mfaRequired: boolean;
  hasStoredSession: boolean;
  login: (email: string, password: string, mfaToken?: string) => Promise<void>;
  biometricUnlock: () => Promise<void>;
  logout: () => Promise<void>;
  refreshBadge: (n: number) => void;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

const APP_ROLES: RoleKey[] = ["parent", "teacher", "driver", "admin"];
function toRole(appRole: string): RoleKey {
  return (APP_ROLES.includes(appRole as RoleKey) ? appRole : "parent") as RoleKey;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [hasStoredSession, setHasStored] = useState(false);

  const loadBoot = useCallback(async () => {
    const b = await api.get<any>("/api/mobile/bootstrap");
    setBoot({
      role: toRole(b.appRole),
      user: { id: b.user?.id, name: b.user?.name || b.user?.email || "You", email: b.user?.email || "" },
      roles: b.roles || [],
      schools: b.schools || [],
      children: b.children || [],
      unread: b.unreadNotifications || 0,
    });
  }, []);

  // On launch: restore a stored token; if present, offer biometric unlock.
  useEffect(() => {
    (async () => {
      await loadToken();
      setHasStored(hasToken());
      setLoading(false);
    })();
  }, []);

  const login = useCallback(async (email: string, password: string, mfaToken?: string) => {
    setError(null);
    try {
      const res = await api.post<any>("/api/auth/login", { email: email.trim(), password, mfaToken });
      if (res?.mfaRequired) { setMfaRequired(true); return; }
      if (res?.token) { await setToken(res.token); setHasStored(true); setMfaRequired(false); }
      await loadBoot();
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Sign-in failed");
    }
  }, [loadBoot]);

  const biometricUnlock = useCallback(async () => {
    setError(null);
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHw && enrolled) {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock SIPlat", fallbackLabel: "Use passcode" });
        if (!r.success) return;
      }
      await loadBoot();
    } catch (e: any) {
      setError("Session expired — please sign in again.");
      await setToken(null); setHasStored(false);
    }
  }, [loadBoot]);

  const logout = useCallback(async () => {
    try { await api.post("/api/auth/logout"); } catch {}
    await setToken(null);
    setBoot(null); setHasStored(false); setMfaRequired(false);
  }, []);

  const refreshBadge = useCallback((n: number) => {
    setBoot((b) => (b ? { ...b, unread: n } : b));
  }, []);

  return (
    <AuthCtx.Provider value={{ loading, boot, error, mfaRequired, hasStoredSession, login, biometricUnlock, logout, refreshBadge }}>
      {children}
    </AuthCtx.Provider>
  );
}

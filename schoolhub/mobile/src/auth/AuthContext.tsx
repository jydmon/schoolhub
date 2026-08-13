import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { api, loadToken, setToken, hasToken } from "@/api/client";
import { RoleKey } from "@/data/mock";

export type Boot = {
  role: RoleKey;
  user: { id: string; name: string; email: string };
  roles: string[];
  schools: string[];
  children: { id: string; name: string; yearGroup?: string }[];
  unread: number;
  security?: any;
};

type Enroll = { secret: string; otpauthUrl: string } | null;

type Ctx = {
  loading: boolean;
  boot: Boot | null;
  error: string | null;
  mfaRequired: boolean;          // account already has 2FA — code needed
  enroll: Enroll;                // mandatory MFA enrolment in progress
  expired: { canDefer: boolean } | null; // password expired prompt
  hasStoredSession: boolean;
  login: (email: string, password: string, mfaToken?: string, remember?: boolean) => Promise<void>;
  submitEnroll: (code: string) => Promise<void>;
  submitNewPassword: (newPassword: string) => Promise<void>;
  deferPassword: () => Promise<void>;
  biometricUnlock: () => Promise<void>;
  logout: () => Promise<void>;
  refreshBadge: (n: number) => void;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

const APP_ROLES: RoleKey[] = ["parent", "teacher", "driver", "admin"];
const toRole = (r: string): RoleKey => (APP_ROLES.includes(r as RoleKey) ? r : "parent") as RoleKey;
const REMEMBER_KEY = "siplat.remember";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [enroll, setEnroll] = useState<Enroll>(null);
  const [expired, setExpired] = useState<{ canDefer: boolean } | null>(null);
  const [hasStoredSession, setHasStored] = useState(false);
  const creds = useRef<{ email: string; password: string; remember: boolean }>({ email: "", password: "", remember: true });

  const loadBoot = useCallback(async () => {
    const b = await api.get<any>("/api/mobile/bootstrap");
    setBoot({
      role: toRole(b.appRole),
      user: { id: b.user?.id, name: b.user?.name || b.user?.email || "You", email: b.user?.email || "" },
      roles: b.roles || [], schools: b.schools || [], children: b.children || [],
      unread: b.unreadNotifications || 0, security: b.security,
    });
    setEnroll(null); setExpired(null); setMfaRequired(false);
  }, []);

  useEffect(() => {
    (async () => {
      await loadToken();
      const remembered = (await SecureStore.getItemAsync(REMEMBER_KEY)) === "1";
      setHasStored(hasToken());
      if (hasToken() && remembered) {
        try { await loadBoot(); } catch { /* fall through to login */ }
      }
      setLoading(false);
    })();
  }, []);

  // Runs the post-auth gates (enrol / expiry) after we have a valid token.
  const applyGates = useCallback(async (data: any) => {
    if (data.mfaEnrollmentRequired) {
      const d = await api.post<any>("/api/auth/mfa", {});
      setEnroll({ secret: d.secret, otpauthUrl: d.otpauthUrl });
      return;
    }
    if (data.passwordExpired) { setExpired({ canDefer: !!data.passwordCanDefer }); return; }
    await loadBoot();
  }, [loadBoot]);

  const login = useCallback(async (email: string, password: string, mfaToken?: string, remember = true) => {
    setError(null);
    try {
      const res = await api.post<any>("/api/auth/login", { email: email.trim(), password, mfaToken, remember });
      if (res?.mfaRequired) { setMfaRequired(true); return; }
      if (res?.token) {
        await setToken(res.token);
        await SecureStore.setItemAsync(REMEMBER_KEY, remember ? "1" : "0");
        setHasStored(true); setMfaRequired(false);
      }
      creds.current = { email: email.trim(), password, remember };
      await applyGates(res);
    } catch (e: any) {
      setError(e?.data?.error || e?.message || "Sign-in failed");
    }
  }, [applyGates]);

  const submitEnroll = useCallback(async (code: string) => {
    setError(null);
    try {
      await api.put("/api/auth/mfa", { token: code });
      await loadBoot();
    } catch (e: any) { setError(e?.data?.error || "Invalid code"); }
  }, [loadBoot]);

  const submitNewPassword = useCallback(async (newPassword: string) => {
    setError(null);
    try {
      await api.post("/api/me/password", { currentPassword: creds.current.password, newPassword });
      // Password change rotates the session — sign in again with the new one.
      const res = await api.post<any>("/api/auth/login", { email: creds.current.email, password: newPassword, remember: creds.current.remember });
      if (res?.token) { await setToken(res.token); }
      creds.current.password = newPassword;
      await applyGates(res);
    } catch (e: any) { setError(e?.data?.error || "Couldn't update password"); }
  }, [applyGates]);

  const deferPassword = useCallback(async () => { setError(null); try { await loadBoot(); } catch (e: any) { setError("Please try again"); } }, [loadBoot]);

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
    } catch { setError("Session expired — please sign in again."); await setToken(null); setHasStored(false); }
  }, [loadBoot]);

  const logout = useCallback(async () => {
    try { await api.post("/api/auth/logout"); } catch {}
    await setToken(null);
    await SecureStore.deleteItemAsync(REMEMBER_KEY);
    setBoot(null); setHasStored(false); setMfaRequired(false); setEnroll(null); setExpired(null);
  }, []);

  const refreshBadge = useCallback((n: number) => setBoot((b) => (b ? { ...b, unread: n } : b)), []);

  return (
    <AuthCtx.Provider value={{ loading, boot, error, mfaRequired, enroll, expired, hasStoredSession, login, submitEnroll, submitNewPassword, deferPassword, biometricUnlock, logout, refreshBadge }}>
      {children}
    </AuthCtx.Provider>
  );
}

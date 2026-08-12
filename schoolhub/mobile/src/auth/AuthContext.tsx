import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import * as LocalAuthentication from "expo-local-authentication";
import { RoleKey, ACCOUNTS } from "@/data/mock";

/**
 * Auth for the SIPlat demo build. In production this reads a server bootstrap
 * (role, user, schools) after login; here we open straight into a chosen role
 * so every screen renders from the built-in demo data. Swap signInAs() for the
 * real /api/auth/login + /api/mobile/bootstrap flow (see src/api/client.ts).
 */
type Boot = { role: RoleKey; user: { name: string; email: string } };
type Ctx = {
  loading: boolean;
  boot: Boot | null;
  signInAs: (role: RoleKey) => void;
  biometricUnlock: () => Promise<void>;
  logout: () => void;
};

const AuthCtx = createContext<Ctx>(null as any);
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [boot, setBoot] = useState<Boot | null>(null);

  useEffect(() => { const t = setTimeout(() => setLoading(false), 350); return () => clearTimeout(t); }, []);

  const signInAs = useCallback((role: RoleKey) => {
    const a = ACCOUNTS[role];
    setBoot({ role, user: { name: a.name, email: a.email } });
  }, []);

  const biometricUnlock = useCallback(async () => {
    try {
      const hasHw = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (hasHw && enrolled) {
        const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock SIPlat", fallbackLabel: "Use passcode" });
        if (!r.success) return;
      }
      signInAs("parent");
    } catch { signInAs("parent"); }
  }, [signInAs]);

  const logout = useCallback(() => setBoot(null), []);

  return <AuthCtx.Provider value={{ loading, boot, signInAs, biometricUnlock, logout }}>{children}</AuthCtx.Provider>;
}

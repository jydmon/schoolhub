"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaToken, setMfaToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Forgot-password flow
  const [mode, setMode] = useState<"login" | "forgot">("login");
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mfaToken: mfaToken || undefined }),
      });
      const data = await res.json();
      if (data.mfaRequired) {
        setMfaRequired(true);
        setError("");
        return;
      }
      if (!res.ok || data.error) {
        setError(data.error || "Login failed");
        return;
      }
      router.replace("/");
      router.refresh();
    } catch {
      setError("Network error");
    } finally {
      setBusy(false);
    }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setResetBusy(true);
    setResetMsg("");
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      setResetMsg(data.message || "If the account exists, a reset link has been sent.");
    } catch {
      setResetMsg("Network error — please try again.");
    } finally {
      setResetBusy(false);
    }
  }

  return (
    <div className="narrow">
      <div className="brand" style={{ justifyContent: "center", marginBottom: 20, fontSize: 20 }}>
        <span className="logo-dot" />
        <span style={{ fontWeight: 700 }}>SIPlat</span>
      </div>

      {mode === "login" ? (
        <div className="panel">
          <h2>Sign in</h2>
          <p className="sub">Access your school platform</p>
          <form onSubmit={submit}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <label>Password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
            {mfaRequired && (
              <>
                <label>Authenticator code</label>
                <input inputMode="numeric" value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="6-digit code" autoFocus />
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>This account has multi-factor authentication enabled.</p>
              </>
            )}
            {error && <div className="notice err">{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 16 }}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p style={{ textAlign: "center", marginTop: 12 }}>
            <button type="button" className="linklike" onClick={() => { setMode("forgot"); setResetEmail(email); setResetMsg(""); }} style={{ background: "none", border: "none", color: "var(--brand, #4F46E5)", cursor: "pointer", padding: 0, fontSize: 14, textDecoration: "underline" }}>
              Forgot password?
            </button>
          </p>
        </div>
      ) : (
        <div className="panel">
          <h2>Reset your password</h2>
          <p className="sub">Enter your email and we&apos;ll send you a reset link.</p>
          <form onSubmit={requestReset}>
            <label>Email</label>
            <input type="email" value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} autoComplete="username" required />
            {resetMsg && <div className="notice ok" style={{ marginTop: 10 }}>{resetMsg}</div>}
            <button type="submit" disabled={resetBusy} style={{ width: "100%", marginTop: 16 }}>{resetBusy ? "Sending…" : "Send reset link"}</button>
          </form>
          <p style={{ textAlign: "center", marginTop: 12 }}>
            <button type="button" onClick={() => setMode("login")} style={{ background: "none", border: "none", color: "var(--brand, #4F46E5)", cursor: "pointer", padding: 0, fontSize: 14, textDecoration: "underline" }}>
              ← Back to sign in
            </button>
          </p>
        </div>
      )}

      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        SSO with Google &amp; Microsoft, and SAML/OIDC, are planned — see the auth module.
      </p>
    </div>
  );
}

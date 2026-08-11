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

  return (
    <div className="narrow">
      <div className="brand" style={{ justifyContent: "center", marginBottom: 20, fontSize: 20 }}>
        <span className="logo-dot" />
        <span style={{ fontWeight: 700 }}>SchoolHub</span>
      </div>
      <div className="panel">
        <h2>Sign in</h2>
        <p className="sub">Access your school platform</p>
        <form onSubmit={submit}>
          <label>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
            required
          />
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          {mfaRequired && (
            <>
              <label>Authenticator code</label>
              <input
                inputMode="numeric"
                value={mfaToken}
                onChange={(e) => setMfaToken(e.target.value)}
                placeholder="6-digit code"
                autoFocus
              />
              <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                This account has multi-factor authentication enabled.
              </p>
            </>
          )}
          {error && <div className="notice err">{error}</div>}
          <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 16 }}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>
        SSO with Google &amp; Microsoft, and SAML/OIDC, are planned — see the auth module.
      </p>
    </div>
  );
}

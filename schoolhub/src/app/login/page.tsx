"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SiplatMark } from "@/components/TopBar";

type Phase = "login" | "forgot" | "mfaEnroll" | "expired";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [remember, setRemember] = useState(true);
  const [mfaToken, setMfaToken] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>("login");

  // MFA enrolment
  const [enroll, setEnroll] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [enrollCode, setEnrollCode] = useState("");

  // Password expiry
  const [canDefer, setCanDefer] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);

  // Forgot-password flow
  const [resetEmail, setResetEmail] = useState("");
  const [resetMsg, setResetMsg] = useState("");
  const [resetBusy, setResetBusy] = useState(false);

  function finish() { router.replace("/"); router.refresh(); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, mfaToken: mfaToken || undefined, remember }),
      });
      const data = await res.json();
      if (data.mfaRequired) { setMfaRequired(true); setError(""); return; }
      if (!res.ok || data.error) { setError(data.error || "Login failed"); return; }

      // Post-auth gates, in priority order.
      if (data.mfaEnrollmentRequired) {
        const r = await fetch("/api/auth/mfa", { method: "POST" });
        const d = await r.json();
        setEnroll({ secret: d.secret, otpauthUrl: d.otpauthUrl });
        setPhase("mfaEnroll");
        return;
      }
      if (data.passwordExpired) {
        setCanDefer(!!data.passwordCanDefer);
        setPhase("expired");
        return;
      }
      finish();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  async function confirmEnroll(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/auth/mfa", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: enrollCode }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || "Invalid code"); return; }
      finish();
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  async function changeExpired(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      const r = await fetch("/api/me/password", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword: newPw }),
      });
      const d = await r.json();
      if (!r.ok || d.error) { setError(d.error || "Couldn't update password"); return; }
      // Password change rotates the session — sign in again with the new password.
      setPhase("login"); setPassword(""); setNewPw("");
      setError("Password updated — please sign in with your new password.");
    } catch { setError("Network error"); }
    finally { setBusy(false); }
  }

  async function requestReset(e: React.FormEvent) {
    e.preventDefault();
    setResetBusy(true); setResetMsg("");
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: resetEmail }),
      });
      const data = await res.json();
      setResetMsg(data.message || "If the account exists, a reset link has been sent.");
    } catch { setResetMsg("Network error — please try again."); }
    finally { setResetBusy(false); }
  }

  const eye = (shown: boolean, toggle: () => void) => (
    <button type="button" onClick={toggle} aria-label={shown ? "Hide password" : "Show password"}
      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 13, padding: 4 }}>
      {shown ? "Hide" : "Show"}
    </button>
  );

  return (
    <div className="narrow">
      <div className="brand" style={{ justifyContent: "center", marginBottom: 22 }}>
        <SiplatMark size={34} />
        <span className="wordmark" style={{ fontSize: 24 }}>SIPlat</span>
      </div>

      {phase === "login" && (
        <div className="panel">
          <h2>Sign in</h2>
          <p className="sub">Access your school platform</p>
          <form onSubmit={submit}>
            <label>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required />
            <label>Password</label>
            <div style={{ position: "relative" }}>
              <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required style={{ width: "100%", paddingRight: 56 }} />
              {eye(showPw, () => setShowPw((v) => !v))}
            </div>
            {mfaRequired && (
              <>
                <label>Authenticator code</label>
                <input inputMode="numeric" value={mfaToken} onChange={(e) => setMfaToken(e.target.value)} placeholder="6-digit code" autoFocus />
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>This account has multi-factor authentication enabled.</p>
              </>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 14, fontWeight: 400 }}>
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} style={{ width: "auto", margin: 0 }} />
              Keep me logged in on this device
            </label>
            {error && <div className={error.startsWith("Password updated") ? "notice ok" : "notice err"}>{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 16 }}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p style={{ textAlign: "center", marginTop: 12 }}>
            <button type="button" className="linklike" onClick={() => { setPhase("forgot"); setResetEmail(email); setResetMsg(""); }} style={{ background: "none", border: "none", color: "var(--brand, #4F46E5)", cursor: "pointer", padding: 0, fontSize: 14, textDecoration: "underline" }}>
              Forgot password?
            </button>
          </p>
        </div>
      )}

      {phase === "mfaEnroll" && (
        <div className="panel">
          <h2>Set up two-factor authentication</h2>
          <p className="sub">Your organisation requires MFA. Add this account to an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code.</p>
          <div className="notice" style={{ wordBreak: "break-all", fontFamily: "monospace", fontSize: 13 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>Setup key</div>
            {enroll?.secret}
          </div>
          <form onSubmit={confirmEnroll}>
            <label>Authenticator code</label>
            <input inputMode="numeric" value={enrollCode} onChange={(e) => setEnrollCode(e.target.value)} placeholder="6-digit code" autoFocus />
            {error && <div className="notice err">{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 16 }}>{busy ? "Verifying…" : "Verify & continue"}</button>
          </form>
        </div>
      )}

      {phase === "expired" && (
        <div className="panel">
          <h2>Your password has expired</h2>
          <p className="sub">For security, please choose a new password to continue.</p>
          <form onSubmit={changeExpired}>
            <label>New password</label>
            <div style={{ position: "relative" }}>
              <input type={showNewPw ? "text" : "password"} value={newPw} onChange={(e) => setNewPw(e.target.value)} autoComplete="new-password" required minLength={8} style={{ width: "100%", paddingRight: 56 }} />
              {eye(showNewPw, () => setShowNewPw((v) => !v))}
            </div>
            {error && <div className="notice err">{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 16 }}>{busy ? "Updating…" : "Update password"}</button>
          </form>
          {canDefer && (
            <p style={{ textAlign: "center", marginTop: 12 }}>
              <button type="button" onClick={finish} style={{ background: "none", border: "none", color: "var(--brand, #4F46E5)", cursor: "pointer", padding: 0, fontSize: 14, textDecoration: "underline" }}>
                Remind me later
              </button>
            </p>
          )}
        </div>
      )}

      {phase === "forgot" && (
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
            <button type="button" onClick={() => setPhase("login")} style={{ background: "none", border: "none", color: "var(--brand, #4F46E5)", cursor: "pointer", padding: 0, fontSize: 14, textDecoration: "underline" }}>
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

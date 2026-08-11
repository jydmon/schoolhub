"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { SiplatMark } from "@/components/TopBar";

// Password reset confirmation. The emailed link is /reset?token=... — we read
// the token on the client (avoids static-render constraints) and PUT the new
// password to /api/auth/password-reset.
export default function ResetPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const t = new URLSearchParams(window.location.search).get("token") || "";
      setToken(t);
    } catch { /* noop */ }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirm) { setError("Passwords do not match."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/password-reset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || "Invalid or expired link."); return; }
      setDone(true);
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="narrow">
      <div className="brand" style={{ justifyContent: "center", marginBottom: 22 }}>
        <SiplatMark size={34} />
        <span className="wordmark" style={{ fontSize: 24 }}>SIPlat</span>
      </div>
      <div className="panel">
        <h2>Set a new password</h2>
        {done ? (
          <>
            <div className="notice ok">Your password has been reset.</div>
            <p style={{ marginTop: 12 }}><Link href="/login">Continue to sign in →</Link></p>
          </>
        ) : !token ? (
          <>
            <p className="sub">This reset link is missing its token.</p>
            <div className="notice err">Open the link from your reset email, or request a new one from the sign-in page.</div>
            <p style={{ marginTop: 12 }}><Link href="/login">← Back to sign in</Link></p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>New password</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
            <label>Confirm new password</label>
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" minLength={8} required />
            {error && <div className="notice err">{error}</div>}
            <button type="submit" disabled={busy} style={{ width: "100%", marginTop: 16 }}>{busy ? "Saving…" : "Reset password"}</button>
          </form>
        )}
      </div>
    </div>
  );
}

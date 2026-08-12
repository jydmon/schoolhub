"use client";

import { useEffect, useState } from "react";

export default function GuardianVerifyPage() {
  const [token, setToken] = useState("");
  const [preview, setPreview] = useState<any>(null);
  const [contact, setContact] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") || "";
    setToken(t);
    if (!t) { setPreview({ valid: false, reason: "invalid" }); return; }
    fetch(`/api/guardian/verify?token=${encodeURIComponent(t)}`).then((r) => r.json()).then(setPreview).catch(() => setPreview({ valid: false, reason: "invalid" }));
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setErr(null);
    if (preview?.needsPassword) {
      if (password.length < 8) { setErr("Choose a password of at least 8 characters."); return; }
      if (password !== password2) { setErr("The two passwords don't match."); return; }
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/guardian/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, contact, fullName, password: preview?.needsPassword ? password : undefined }) });
      const d = await res.json();
      if (!res.ok || d.error) throw new Error(d.error || "Verification failed");
      setDone(d.email || "");
    } catch (e: any) { setErr(e.message); }
    finally { setBusy(false); }
  }

  const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "#f5f7fb" } as const;
  const card = { maxWidth: 460, width: "100%", background: "#fff", border: "1px solid var(--line)", borderRadius: 14, padding: 28, boxShadow: "0 10px 40px -20px rgba(0,0,0,.3)" } as const;

  if (!preview) return <div style={wrap}><div style={card}><p className="muted">Checking your invitation…</p></div></div>;

  if (!preview.valid) {
    const reason = preview.reason === "expired" ? "This verification link has expired." : preview.reason === "revoked" ? "This invitation is no longer valid." : "This verification link is invalid or has already been used.";
    return <div style={wrap}><div style={card}><h2>Link not valid</h2><p className="muted">{reason}</p><p className="muted" style={{ fontSize: 13 }}>Please contact your school office and ask them to reissue your invitation.</p></div></div>;
  }

  if (done !== null) {
    return <div style={wrap}><div style={card}>
      <h2>✅ You're all set</h2>
      <p>Your identity has been verified and your account is now linked to <strong>{preview.childFirstName}</strong> at {preview.schoolName}.</p>
      <p className="muted" style={{ fontSize: 13 }}>{done ? <>Sign in with <strong>{done}</strong>.</> : null}</p>
      <a href="/login"><button style={{ marginTop: 8 }}>Go to sign in</button></a>
    </div></div>;
  }

  return (
    <div style={wrap}>
      <div style={card}>
        <h2 style={{ marginTop: 0 }}>Verify your access</h2>
        <p className="sub">{preview.schoolName} has set up parent-portal access linked to <strong>{preview.childFirstName}</strong> ({preview.relationship}). For your child&apos;s safety, please confirm your identity before access is granted.</p>
        {err && <div className="notice err">{err}</div>}
        <form onSubmit={submit}>
          <label>Confirm the email or mobile number your school has on file for you</label>
          <input value={contact} onChange={(e) => setContact(e.target.value)} placeholder="you@example.com or +44…" required />
          {preview.needsPassword && (
            <>
              <label style={{ marginTop: 12 }}>Your name</label>
              <input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder={preview.guardianName || "Full name"} />
              <label style={{ marginTop: 12 }}>Create a password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" required />
              <label style={{ marginTop: 12 }}>Confirm password</label>
              <input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
            </>
          )}
          <button type="submit" disabled={busy} style={{ marginTop: 16, width: "100%" }}>{busy ? "Verifying…" : "Verify & activate access"}</button>
        </form>
        <p className="muted" style={{ fontSize: 12, marginTop: 14 }}>We never grant access from a child&apos;s name and date of birth alone. Access is only ever created by your school and confirmed by you here.</p>
      </div>
    </div>
  );
}

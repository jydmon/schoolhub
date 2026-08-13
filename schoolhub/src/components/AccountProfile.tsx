"use client";

import { useCallback, useEffect, useState } from "react";

const CHANNELS: [string, string][] = [["inapp", "In-app"], ["push", "Push"], ["email", "Email"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]];
const CATEGORIES: [string, string][] = [
  ["transport", "Transport updates"],
  ["checkinout", "Student check-in / check-out"],
  ["announcements", "School announcements"],
  ["timetable", "Timetable changes"],
  ["messages", "Messages"],
  ["rewards", "Rewards & achievements"],
  ["trips", "Trip notifications"],
  ["security", "Security alerts"],
];
const LANGS: [string, string][] = [["en", "English"], ["fr", "Français"], ["es", "Español"], ["pl", "Polski"], ["ur", "اردو"], ["ar", "العربية"]];

// One consistent "My profile" experience for every role: identity, contact,
// notification & contact preferences, and security (change password).
export default function AccountProfile() {
  const [p, setP] = useState<any>(null);
  const [f, setF] = useState({ fullName: "", username: "", phone: "", photoUrl: "" });
  const [prefs, setPrefs] = useState<any>(null);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [showPw, setShowPw] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ kind: string; text: string } | null>(null);
  const [prefMsg, setPrefMsg] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch("/api/me/profile").then((r) => r.json());
    setP(d.profile);
    if (d.profile) setF({ fullName: d.profile.fullName || "", username: d.profile.username || "", phone: d.profile.phone || "", photoUrl: d.profile.photoUrl || "" });
    fetch("/api/me/preferences").then((r) => r.json()).then((x) => setPrefs(x.prefs)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && !d.error ? { kind: "ok", text: "Profile saved." } : { kind: "err", text: d.error || "Failed" });
    load();
  }
  async function changePw(e: React.FormEvent) {
    e.preventDefault(); setPwMsg(null);
    if (pw.next.length < 8) { setPwMsg({ kind: "err", text: "New password must be at least 8 characters." }); return; }
    if (pw.next !== pw.confirm) { setPwMsg({ kind: "err", text: "The two new passwords don't match." }); return; }
    const res = await fetch("/api/me/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setPwMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setPwMsg({ kind: "ok", text: d.message || "Password updated." }); setPw({ current: "", next: "", confirm: "" });
  }
  async function savePrefs() {
    const res = await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: prefs.channels, categories: prefs.categories, digest: prefs.digest, quietStart: prefs.quietStart, quietEnd: prefs.quietEnd, preferredLanguage: prefs.preferredLanguage }) });
    if (res.ok) { const d = await res.json().catch(() => ({})); if (d.prefs) setPrefs(d.prefs); setPrefMsg(true); setTimeout(() => setPrefMsg(false), 1500); }
  }
  const setCh = (k: string, v: boolean) => setPrefs({ ...prefs, channels: { ...prefs.channels, [k]: v } });
  const setCat = (k: string, v: boolean) => setPrefs({ ...prefs, categories: { ...prefs.categories, [k]: v } });
  const pwType = showPw ? "text" : "password";

  if (!p) return <div className="panel">Loading…</div>;

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>My profile</h2>
        <p className="sub">Your identity and contact details. Email and role are managed by your school and can&apos;t be changed here.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={saveProfile}>
          <div className="row">
            <div><label>Full name</label><input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
            <div><label>Username</label><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} placeholder={p.email} /></div>
          </div>
          <div className="row">
            <div><label>Email (sign-in)</label><input value={p.email || ""} readOnly disabled /></div>
            <div><label>Assigned role</label><input value={(p.roles || []).join(", ") || (p.isPlatformAdmin ? "Platform Administrator" : "Member")} readOnly disabled /></div>
          </div>
          <div className="row">
            <div><label>Contact number</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+44…" /></div>
            <div><label>Photo URL</label><input value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} placeholder="https://…" /></div>
          </div>
          {p.schools?.length ? <p className="muted" style={{ fontSize: 12 }}>School{p.schools.length > 1 ? "s" : ""}: {p.schools.join(", ")}</p> : null}
          <button type="submit" style={{ marginTop: 12 }}>Save profile</button>
        </form>
      </div>

      {prefs && (
        <div className="panel">
          <h2 style={{ margin: 0 }}>Notification &amp; contact preferences</h2>
          <p className="sub">Choose how and what you&apos;re notified about. Safety-critical security alerts always come through.</p>
          {prefMsg && <div className="notice ok">Saved.</div>}

          <h3 style={{ marginBottom: 6 }}>Channels</h3>
          <div className="chips">
            {CHANNELS.map(([k, l]) => <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!prefs.channels?.[k]} onChange={(e) => setCh(k, e.target.checked)} /> {l}</label>)}
          </div>

          <h3 style={{ margin: "14px 0 6px" }}>Notifications I want</h3>
          <div className="chips">
            {CATEGORIES.map(([k, l]) => {
              const locked = k === "security";
              return (
                <label key={k} className="chip" style={{ margin: 0, opacity: locked ? 0.7 : 1 }}>
                  <input type="checkbox" style={{ width: "auto" }} disabled={locked} checked={locked ? true : prefs.categories?.[k] !== false} onChange={(e) => setCat(k, e.target.checked)} /> {l}{locked ? " (always on)" : ""}
                </label>
              );
            })}
          </div>

          <div className="row" style={{ marginTop: 14 }}>
            <div><label>Frequency</label><select value={prefs.digest} onChange={(e) => setPrefs({ ...prefs, digest: e.target.value })}><option value="immediate">Immediate</option><option value="daily">Daily summary</option><option value="weekly">Weekly digest</option></select></div>
            <div><label>Quiet from</label><input value={prefs.quietStart || ""} onChange={(e) => setPrefs({ ...prefs, quietStart: e.target.value })} placeholder="21:00" /></div>
            <div><label>Quiet to</label><input value={prefs.quietEnd || ""} onChange={(e) => setPrefs({ ...prefs, quietEnd: e.target.value })} placeholder="07:00" /></div>
            <div><label>Language</label><select value={prefs.preferredLanguage} onChange={(e) => setPrefs({ ...prefs, preferredLanguage: e.target.value })}>{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          </div>
          <button style={{ marginTop: 12 }} onClick={savePrefs}>Save preferences</button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>These settings sync with the SIPlat mobile app. SMS is opt-out; WhatsApp requires opt-in per provider policy.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ margin: 0 }}>Security</h2>
        <p className="sub">Change your password. Two-factor authentication is <strong>{p.mfaEnabled ? "on" : "off"}</strong>{p.emailVerified === false ? " · email not yet verified" : ""}.</p>
        {pwMsg && <div className={`notice ${pwMsg.kind}`}>{pwMsg.text}</div>}
        <form onSubmit={changePw} style={{ maxWidth: 420 }}>
          <label>Current password</label>
          <input type={pwType} value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} autoComplete="current-password" />
          <label style={{ marginTop: 10 }}>New password</label>
          <input type={pwType} value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} autoComplete="new-password" placeholder="At least 8 characters" />
          <label style={{ marginTop: 10 }}>Confirm new password</label>
          <input type={pwType} value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} autoComplete="new-password" />
          <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontWeight: 400 }}>
            <input type="checkbox" style={{ width: "auto", margin: 0 }} checked={showPw} onChange={(e) => setShowPw(e.target.checked)} /> Show passwords
          </label>
          <button type="submit" style={{ marginTop: 12 }}>Change password</button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Changing your password signs you out of all other devices.</p>
        </form>
      </div>
    </>
  );
}

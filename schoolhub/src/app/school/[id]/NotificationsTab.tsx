"use client";

import { useEffect, useState, useCallback } from "react";

const CHANNELS: [string, string][] = [["inapp", "In-app"], ["push", "Push (mobile app)"], ["email", "Email"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]];
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");

export default function NotificationsTab() {
  const [inbox, setInbox] = useState<any>(null);
  const [prefs, setPrefs] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const loadInbox = useCallback(async () => setInbox(await fetch("/api/me/notifications").then((r) => r.json())), []);
  const loadPrefs = useCallback(async () => setPrefs((await fetch("/api/me/preferences").then((r) => r.json())).prefs), []);
  useEffect(() => { loadInbox(); loadPrefs(); }, [loadInbox, loadPrefs]);

  async function markAll() { await fetch("/api/me/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); loadInbox(); }
  async function markOne(id: string) { await fetch("/api/me/notifications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: [id] }) }); loadInbox(); }
  function setChannel(k: string, v: boolean) { setPrefs((p: any) => ({ ...p, channels: { ...p.channels, [k]: v } })); }
  async function savePrefs() {
    setMsg(null);
    const res = await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: prefs.channels, digest: prefs.digest, quietStart: prefs.quietStart || null, quietEnd: prefs.quietEnd || null }) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && !d.error ? { kind: "ok", text: "Preferences saved." } : { kind: "err", text: d.error || "Failed" });
  }

  const items: any[] = inbox?.notifications ?? [];
  return (
    <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>Notifications</h2><p className="sub" style={{ marginBottom: 0 }}>What&apos;s new for you — updates and changes across the school you need to know about.{inbox?.unread ? ` · ${inbox.unread} unread` : ""}</p></div>
          {items.length > 0 && <button className="secondary small" onClick={markAll}>Mark all read</button>}
        </div>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>When</th><th>Notification</th><th>Type</th><th className="right"></th></tr></thead>
          <tbody>
            {items.map((n) => (
              <tr key={n.id} style={{ background: n.read ? undefined : "#f5f8ff" }}>
                <td className="mono muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{dt(n.createdAt)}</td>
                <td><strong>{n.title}</strong>{n.body ? <div className="muted" style={{ fontSize: 12 }}>{n.body}</div> : null}</td>
                <td><span className="badge role">{n.kind}</span></td>
                <td className="right">{!n.read && <button className="secondary small" onClick={() => markOne(n.id)}>Mark read</button>}</td>
              </tr>
            ))}
            {items.length === 0 && <tr><td colSpan={4} className="muted">No notifications yet. You&apos;ll be alerted here (and via your chosen channels) when something needs your attention.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Notification preferences</h2>
        <p className="sub">Choose how you want to be notified. In-app is always on; the rest are opt-in. Emergency alerts always reach you regardless of these settings.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        {!prefs ? <p className="muted">Loading…</p> : (
          <>
            <label>Channels</label>
            <div className="chips" style={{ marginTop: 4 }}>
              {CHANNELS.map(([k, l]) => (
                <label key={k} className="chip" style={{ margin: 0 }}>
                  <input type="checkbox" style={{ width: "auto" }} disabled={k === "inapp"} checked={k === "inapp" ? true : !!prefs.channels?.[k]} onChange={(e) => setChannel(k, e.target.checked)} /> {l}
                </label>
              ))}
            </div>
            <div className="row" style={{ marginTop: 14 }}>
              <div><label>Digest / frequency</label><select value={prefs.digest} onChange={(e) => setPrefs({ ...prefs, digest: e.target.value })}><option value="immediate">Immediate</option><option value="daily">Daily summary</option><option value="weekly">Weekly summary</option></select></div>
              <div><label>Quiet hours from</label><input type="time" value={prefs.quietStart || ""} onChange={(e) => setPrefs({ ...prefs, quietStart: e.target.value })} /></div>
              <div><label>Quiet hours to</label><input type="time" value={prefs.quietEnd || ""} onChange={(e) => setPrefs({ ...prefs, quietEnd: e.target.value })} /></div>
            </div>
            <button style={{ marginTop: 14 }} onClick={savePrefs}>Save preferences</button>
          </>
        )}
      </div>
    </>
  );
}

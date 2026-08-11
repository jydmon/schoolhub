"use client";

import { useEffect, useState, useCallback } from "react";

const TARGETS = ["school", "year", "class", "house", "route", "vehicle", "trip", "student", "parents", "staff"];
const CHANNELS = ["inapp", "push", "email", "sms", "whatsapp"];

export default function CommsTab({ schoolId }: { schoolId: string }) {
  const [history, setHistory] = useState<any[]>([]);
  const [f, setF] = useState<any>({ title: "", body: "", targetType: "school", targetValue: "", audience: "parents", priority: "normal", channels: { inapp: true, push: true, email: false, sms: false } });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => setHistory((await fetch(`/api/schools/${schoolId}/messages`).then((r) => r.json())).messages ?? []), [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const channels = Object.entries(f.channels).filter(([, v]) => v).map(([k]) => k);
    const body = { title: f.title, body: f.body || undefined, channels, priority: f.priority, target: { type: f.targetType, value: f.targetValue || undefined, audience: f.audience } };
    const res = await fetch(`/api/schools/${schoolId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: `Sent to ${d.recipients} recipient(s) across ${channels.length} channel(s).` });
    setF({ ...f, title: "", body: "" }); load();
  }

  const needsValue = !["school", "parents", "staff"].includes(f.targetType);

  return (
    <>
      <div className="panel">
        <h2>Notification centre</h2>
        <p className="sub">Compose across in-app, push, email, SMS and WhatsApp. SMS/WhatsApp reach only parents with a number on file (WhatsApp requires opt-in); emergency alerts override quiet hours and channel preferences.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={send}>
          <div className="row">
            <div style={{ flex: 2 }}><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
            <div><label>Priority</label><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="normal">Normal</option><option value="emergency">Emergency alert</option></select></div>
          </div>
          <label>Message</label>
          <textarea rows={3} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 14 }} />
          <div className="row">
            <div><label>Target</label><select value={f.targetType} onChange={(e) => setF({ ...f, targetType: e.target.value })}>{TARGETS.map((t) => <option key={t}>{t}</option>)}</select></div>
            {needsValue && <div><label>Value (id / name)</label><input value={f.targetValue} onChange={(e) => setF({ ...f, targetValue: e.target.value })} placeholder={f.targetType === "year" ? "Year 4" : f.targetType === "house" ? "Oak" : "id"} /></div>}
            <div><label>Audience</label><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="parents">Parents</option><option value="staff">Staff</option><option value="both">Both</option></select></div>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 13 }}>Channels:</span>
            {CHANNELS.map((c) => <label key={c} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!f.channels[c]} onChange={(e) => setF({ ...f, channels: { ...f.channels, [c]: e.target.checked } })} /> {c}</label>)}
          </div>
          <button type="submit" style={{ marginTop: 14 }}>Send message</button>
        </form>
      </div>

      <div className="panel">
        <h2>Communication history</h2>
        <table>
          <thead><tr><th>When</th><th>Title</th><th>Priority</th><th>Recipients</th><th>Delivery</th><th>Read</th></tr></thead>
          <tbody>
            {history.map((m) => (
              <tr key={m.id}>
                <td className="mono muted">{new Date(m.createdAt).toLocaleString()}</td>
                <td>{m.title}<div className="muted" style={{ fontSize: 11 }}>{m.channels}</div></td>
                <td>{m.priority === "emergency" ? <span className="badge suspended">emergency</span> : "normal"}</td>
                <td>{m.recipientCount}</td>
                <td className="muted" style={{ fontSize: 12 }}>{Object.entries(m.counts).map(([k, v]) => `${k}:${v}`).join(" · ") || "—"}</td>
                <td>{m.read}</td>
              </tr>
            ))}
            {history.length === 0 && <tr><td colSpan={6} className="muted">No messages sent yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

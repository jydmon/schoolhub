"use client";

import { useCallback, useEffect, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");

/* -------------------------------- History -------------------------------- */
export function DriverHistory() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/driver/history`).then((r) => r.json()).then((d) => setRows(d.journeys ?? [])).catch(() => {}); }, []);
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Journey history</h2>
      <p className="sub">Your completed journeys.</p>
      <table>
        <thead><tr><th>Date</th><th>Route</th><th>Session</th><th>Vehicle</th><th>Boarded</th><th>Absent</th><th>Delay</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((j) => (
            <tr key={j.id}>
              <td className="mono muted">{j.date}</td><td>{j.routeName}</td><td>{j.session.toUpperCase()}</td>
              <td>{j.vehicle || "—"}</td><td>{j.boarded}</td><td>{j.absent}</td><td>{j.delayMinutes ? `+${j.delayMinutes}m` : "—"}</td>
              <td><span className={`badge ${j.status === "completed" ? "active" : "archived"}`}>{j.status}</span></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={8} className="muted">No past journeys yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ----------------------------- Vehicle checks ---------------------------- */
const CHECK_ITEMS: [string, string][] = [
  ["tyres", "Tyres & wheels"], ["lights", "Lights & indicators"], ["mirrors", "Mirrors & glass"],
  ["brakes", "Brakes"], ["steering", "Steering"], ["fluids", "Oil / coolant / fuel"],
  ["doors", "Doors & steps"], ["seatbelts", "Seatbelts & seats"], ["firstaid", "First-aid kit"],
  ["fireext", "Fire extinguisher"], ["cleanliness", "Cleanliness"], ["bodywork", "Bodywork / damage"],
];

export function DriverChecks() {
  const [journeys, setJourneys] = useState<any[]>([]);
  const [journeyId, setJourneyId] = useState("");
  const [items, setItems] = useState<Record<string, string>>(Object.fromEntries(CHECK_ITEMS.map(([k]) => [k, "ok"])));
  const [defects, setDefects] = useState("");
  const [recent, setRecent] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    setJourneys((await fetch(`/api/driver/journeys`).then((r) => r.json())).journeys ?? []);
    setRecent((await fetch(`/api/driver/checks`).then((r) => r.json())).checks ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  const setItem = (k: string, v: string) => setItems((m) => ({ ...m, [k]: v }));
  const hasDefect = Object.values(items).some((v) => v === "defect") || !!defects.trim();

  async function submit() {
    setMsg(null);
    const res = await fetch(`/api/driver/checks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journeyId: journeyId || null, items, defects }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: d.passed ? "ok" : "err", text: d.passed ? "Check passed and recorded." : "Defects recorded — the transport office has been alerted. Do not drive if the vehicle is unsafe." });
    setItems(Object.fromEntries(CHECK_ITEMS.map(([k]) => [k, "ok"]))); setDefects("");
    load();
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Pre-trip vehicle check</h2>
        <p className="sub">Complete a walk-around check before you set off. Anything marked as a defect (or noted below) fails the check and alerts the office.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        {journeys.length > 0 && (
          <div style={{ marginBottom: 10 }}><label>Journey / vehicle (optional)</label>
            <select value={journeyId} onChange={(e) => setJourneyId(e.target.value)} style={{ width: "auto" }}>
              <option value="">— not linked to a journey —</option>
              {journeys.map((j) => <option key={j.id} value={j.id}>{j.routeName} · {j.session.toUpperCase()}{j.vehicle ? ` · ${j.vehicle}` : ""}</option>)}
            </select>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 8 }}>
          {CHECK_ITEMS.map(([k, l]) => (
            <div key={k} className="flex-between" style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "6px 10px" }}>
              <span style={{ fontSize: 13 }}>{l}</span>
              <div className="chips" style={{ margin: 0 }}>
                {["ok", "defect", "na"].map((v) => (
                  <button key={v} className={items[k] === v ? "" : "secondary"} style={{ padding: "2px 8px", fontSize: 11, background: items[k] === v && v === "defect" ? "#dc2626" : undefined, color: items[k] === v && v === "defect" ? "#fff" : undefined }} onClick={() => setItem(k, v)}>{v === "ok" ? "OK" : v === "defect" ? "Defect" : "N/A"}</button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <label style={{ marginTop: 12 }}>Defect notes</label>
        <input value={defects} onChange={(e) => setDefects(e.target.value)} placeholder="Describe any defects…" />
        <div style={{ marginTop: 12 }}><button onClick={submit} className={hasDefect ? "danger" : ""}>{hasDefect ? "Submit with defects" : "Submit — all clear"}</button></div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: 16, margin: 0 }}>Recent checks</h2>
        <table>
          <thead><tr><th>Date</th><th>Result</th><th>Defects</th></tr></thead>
          <tbody>
            {recent.map((c) => (
              <tr key={c.id}><td className="mono muted">{c.date}</td><td><span className={`badge ${c.passed ? "active" : "suspended"}`}>{c.passed ? "passed" : "defects"}</span></td><td className="muted">{c.defects || "—"}</td></tr>
            ))}
            {recent.length === 0 && <tr><td colSpan={3} className="muted">No checks recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* -------------------------------- Messages ------------------------------- */
export function DriverMessages() {
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const load = useCallback(async () => setMessages((await fetch(`/api/driver/messages`).then((r) => r.json())).messages ?? []), []);
  useEffect(() => { load(); }, [load]);
  async function send() {
    if (!text.trim()) return;
    await fetch(`/api/driver/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: text.trim() }) });
    setText(""); load();
  }
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Transport office</h2>
      <p className="sub">Message your transport office and see their replies.</p>
      <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, minHeight: 240, maxHeight: 440, overflowY: "auto", background: "#fafbfe", marginTop: 8 }}>
        {messages.length === 0 ? <p className="muted">No messages yet.</p> : messages.map((m) => (
          <div key={m.id} style={{ textAlign: m.direction === "to_office" ? "right" : "left", margin: "6px 0" }}>
            <div style={{ display: "inline-block", maxWidth: "80%", background: m.direction === "to_office" ? "#4f46e5" : "#fff", color: m.direction === "to_office" ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", fontSize: 13 }}>
              {m.body}
              <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{dt(m.createdAt)}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div style={{ flex: 4 }}><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Message the transport office…" /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={send}>Send</button></div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");

/* -------------------------------- History -------------------------------- */
export function DriverHistory() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/driver/history`).then((r) => r.json()).then((d) => setRows(d.journeys ?? [])).catch(() => {}); }, []);
  const hm = (v: any) => (v ? new Date(v).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—");
  const completed = rows.filter((r) => r.status === "completed").length;
  const totalBoardings = rows.reduce((s, r) => s + (r.boarded || 0), 0);
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>My journey log</h2>
        <p className="sub">A history of your completed trips and route activity. Only your own journeys are shown.</p>
        <div className="stat-grid">
          <div className="stat"><div className="n">{rows.length}</div><div className="l">Journeys</div></div>
          <div className="stat"><div className="n" style={{ color: "#16a34a" }}>{completed}</div><div className="l">Completed</div></div>
          <div className="stat"><div className="n">{totalBoardings}</div><div className="l">Pupils carried</div></div>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Date</th><th>Route</th><th>Session</th><th>Vehicle</th><th>Started</th><th>Finished</th><th>Boarded</th><th>Delay</th><th>Status</th></tr></thead>
          <tbody>
            {rows.map((j) => (
              <tr key={j.id}>
                <td className="mono muted">{j.date}</td><td>{j.routeName}</td><td>{String(j.session ?? "").toUpperCase() || "—"}</td>
                <td>{j.vehicle || "—"}</td><td className="mono muted">{hm(j.startedAt)}</td><td className="mono muted">{hm(j.completedAt)}</td>
                <td>{j.boarded}{j.total ? `/${j.total}` : ""}</td><td>{j.delayMinutes ? `+${j.delayMinutes}m` : "—"}</td>
                <td><span className={`badge ${j.status === "completed" ? "active" : "archived"}`}>{j.status}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="muted">No past journeys yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
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
              {journeys.map((j) => <option key={j.id} value={j.id}>{j.routeName} · {String(j.session ?? "").toUpperCase()}{j.vehicle ? ` · ${j.vehicle}` : ""}</option>)}
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

/* -------------------------- Incident log (raise) ------------------------- */
const INCIDENT_TYPES: [string, string][] = [
  ["breakdown", "Vehicle breakdown"], ["accident", "Accident / collision"], ["vehicle_defect", "Vehicle defect"],
  ["road", "Road / traffic problem"], ["behaviour", "Pupil behaviour"], ["medical", "Medical / welfare"],
  ["delay", "Significant delay"], ["weather", "Weather / hazard"], ["other", "Other"],
];
export function DriverIncidents() {
  const [journeys, setJourneys] = useState<any[]>([]);
  const [incidents, setIncidents] = useState<any[]>([]);
  const [f, setF] = useState({ type: "breakdown", severity: "medium", notes: "", journeyId: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    setJourneys((await fetch(`/api/driver/journeys`).then((r) => r.json())).journeys ?? []);
    setIncidents((await fetch(`/api/driver/incident`).then((r) => r.json())).incidents ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function submit() {
    setMsg(null);
    if (!f.notes.trim()) { setMsg({ kind: "err", text: "Please describe what happened." }); return; }
    const res = await fetch(`/api/driver/incident`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: f.type, severity: f.severity, notes: f.notes.trim(), journeyId: f.journeyId || undefined }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Incident reported — the transport office has been notified." });
    setF({ type: "breakdown", severity: "medium", notes: "", journeyId: "" }); load();
  }
  const sev = (s: string) => (s === "high" ? "suspended" : s === "medium" ? "trial" : "role");
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Report an incident</h2>
        <p className="sub">Raise a transport incident. High-severity incidents alert the office immediately. Attach a journey if it happened on a run.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <div className="row">
          <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{INCIDENT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><label>Severity</label><select value={f.severity} onChange={(e) => setF({ ...f, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
          <div><label>Journey (optional)</label><select value={f.journeyId} onChange={(e) => setF({ ...f, journeyId: e.target.value })}><option value="">— not on a journey —</option>{journeys.map((j) => <option key={j.id} value={j.id}>{j.routeName} · {String(j.session ?? "").toUpperCase()}</option>)}</select></div>
        </div>
        <label style={{ marginTop: 8 }}>What happened?</label>
        <textarea rows={3} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Describe the incident…" style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
        <div style={{ marginTop: 12 }}><button className={f.severity === "high" ? "danger" : ""} onClick={submit}>Report incident</button></div>
      </div>
      <div className="panel">
        <h2 style={{ fontSize: 16, margin: 0 }}>My reported incidents</h2>
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Severity</th><th>Status</th><th>Notes</th></tr></thead>
          <tbody>
            {incidents.map((i) => (
              <tr key={i.id}>
                <td className="mono muted">{dt(i.at)}</td>
                <td>{(INCIDENT_TYPES.find(([k]) => k === i.type)?.[1]) || i.type}</td>
                <td><span className={`badge ${sev(i.severity)}`}>{i.severity}</span></td>
                <td><span className={`badge ${i.status === "resolved" ? "active" : i.status === "acknowledged" ? "role" : "suspended"}`}>{i.status}</span></td>
                <td className="muted">{i.notes || "—"}{i.resolutionNote ? ` · Resolution: ${i.resolutionNote}` : ""}</td>
              </tr>
            ))}
            {incidents.length === 0 && <tr><td colSpan={5} className="muted">No incidents reported.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ----------------------------- Fleet / vehicles -------------------------- */
export function DriverFleet() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/driver/vehicles`).then((r) => r.json()).then((d) => setVehicles(d.vehicles ?? [])).catch(() => {}); }, []);
  const statusBadge = (s: string) => s === "available" ? "active" : s === "out_of_service" ? "suspended" : "trial";
  const statusLabel = (s: string) => ({ available: "Available", due_soon: "Compliance due", attention: "Needs attention", out_of_service: "Out of service" } as Record<string, string>)[s] || s;
  const cflag = (v: string) => v === "overdue" ? <span className="badge suspended">overdue</span> : v === "due" ? <span className="badge trial">due</span> : v === "ok" ? <span className="badge active">ok</span> : <span className="muted">—</span>;
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Fleet</h2>
      <p className="sub">Vehicles at your school and their current status. Compliance flags show MOT, insurance, service and tax.</p>
      <table>
        <thead><tr><th>Vehicle</th><th>Type</th><th>Seats</th><th>Status</th><th>MOT</th><th>Insurance</th><th>Service</th><th>Tax</th></tr></thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id}>
              <td><strong>{v.reference}</strong>{v.label ? <div className="mono muted" style={{ fontSize: 11 }}>{v.label}</div> : null}</td>
              <td>{v.type}</td><td>{v.capacity}</td>
              <td><span className={`badge ${statusBadge(v.status)}`}>{statusLabel(v.status)}</span></td>
              <td>{cflag(v.compliance.mot)}</td><td>{cflag(v.compliance.insurance)}</td><td>{cflag(v.compliance.service)}</td><td>{cflag(v.compliance.tax)}</td>
            </tr>
          ))}
          {vehicles.length === 0 && <tr><td colSpan={8} className="muted">No vehicles found for your school.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

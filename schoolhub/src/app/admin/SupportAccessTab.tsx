"use client";

import { useEffect, useState, useCallback } from "react";

// Super-Admin support access console: request time-bound access to a user's
// portal (they must approve), then enter/end the session. Self-contained.

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const STATUS_BADGE: Record<string, string> = { pending: "trial", approved: "active", active: "active", rejected: "suspended", revoked: "suspended", ended: "archived", expired: "archived" };
const DURATIONS: [number, string][] = [[15, "15 min"], [30, "30 min"], [60, "1 hour"], [120, "2 hours"], [240, "4 hours"]];

async function api(url: string, method = "GET", body?: any) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export default function SupportAccessTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ targetEmail: "", reason: "", durationMins: 60 });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);

  const load = useCallback(async () => {
    try { const d = await api(`/api/admin/support-access`); setRows(d.requests || []); } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function request() {
    setMsg(null);
    if (!form.targetEmail.trim() || !form.reason.trim()) { setMsg({ k: "err", t: "Enter the user's email and a reason." }); return; }
    try { await api(`/api/admin/support-access`, "POST", form); setForm({ targetEmail: "", reason: "", durationMins: 60 }); setMsg({ k: "ok", t: "Request sent — the user must approve it before access is granted." }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function start(id: string) {
    setMsg(null);
    try { await api(`/api/admin/support-access/${id}`, "POST", { action: "start" }); window.location.assign("/"); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); load(); }
  }
  async function stop(id: string) {
    try { await api(`/api/admin/support-access/${id}`, "POST", { action: "stop" }); load(); } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Request user access</h2>
        <p className="sub">Ask a user for temporary, time-bound access to their portal to help troubleshoot. Access is only granted after they approve, is fully audited, and can be revoked at any time.</p>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 8 }}>{msg.t}</div>}
        <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
          <div style={{ flex: 2 }}><label>User email</label><input type="email" value={form.targetEmail} onChange={(e) => setForm({ ...form, targetEmail: e.target.value })} placeholder="user@school.org" /></div>
          <div><label>Duration</label><select value={form.durationMins} onChange={(e) => setForm({ ...form, durationMins: Number(e.target.value) })}>{DURATIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
        </div>
        <label>Reason for access</label>
        <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. Investigating a reported timetable sync issue on their account" />
        <div><button style={{ marginTop: 12 }} onClick={request}>Send access request</button></div>
      </div>

      <div className="panel">
        <h2 style={{ fontSize: 16, margin: 0 }}>My access requests</h2>
        <table style={{ marginTop: 8 }}>
          <thead><tr><th>User</th><th>Reason</th><th>Requested</th><th>Status</th><th>Window</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.targetName || r.targetEmail}</strong><div className="muted" style={{ fontSize: 11 }}>{r.targetEmail}</div></td>
                <td className="muted" style={{ maxWidth: 280 }}>{r.reason}</td>
                <td className="mono muted" style={{ fontSize: 12 }}>{dt(r.requestedAt)}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || "trial"}`}>{r.status}</span></td>
                <td className="muted" style={{ fontSize: 12 }}>{r.status === "active" || r.status === "approved" ? (r.minutesLeft != null ? `${r.minutesLeft} min left` : `${r.durationMins} min`) : r.endedReason ? r.endedReason.replace(/_/g, " ") : "—"}</td>
                <td className="right" style={{ whiteSpace: "nowrap" }}>
                  {r.status === "approved" && <button className="small" onClick={() => start(r.id)}>Enter portal</button>}
                  {r.status === "active" && <><button className="small" onClick={() => start(r.id)}>Re-enter</button>{" "}<button className="small secondary danger" onClick={() => stop(r.id)}>End</button></>}
                  {r.status === "pending" && <span className="muted" style={{ fontSize: 12 }}>awaiting approval</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="muted">No access requests yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

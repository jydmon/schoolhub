"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSel, Kebab } from "../school/[id]/EntityKit";
import ModuleImportCard from "../school/[id]/ModuleImportCard";
import { stampCsv } from "@/lib/download-client";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const pad2 = (n: number) => String(n).padStart(2, "0");
function dueState(dateStr?: string | null) {
  if (!dateStr) return null;
  const days = Math.round((new Date(`${dateStr}T00:00:00`).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: `overdue ${-days}d`, tone: "suspended" as const };
  if (days <= 30) return { label: `${days}d`, tone: "trial" as const };
  if (days <= 60) return { label: `${days}d`, tone: "archived" as const };
  return { label: "ok", tone: "active" as const };
}
function DueCell({ date }: { date?: string | null }) {
  if (!date) return <span className="muted">—</span>;
  const s = dueState(date)!;
  return <span><span className="mono muted" style={{ fontSize: 12 }}>{date}</span> <span className={`badge ${s.tone}`}>{s.label}</span></span>;
}

/* ------------------------------- Dashboard ------------------------------- */
export function TMDashboard({ schoolId, onNavigate }: { schoolId: string; onNavigate: (k: string) => void }) {
  const [journeys, setJourneys] = useState<any>(null);
  const [incidents, setIncidents] = useState<any>(null);
  const [msgs, setMsgs] = useState<any>(null);
  const [drivers, setDrivers] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/schools/${schoolId}/transport/journeys`).then((r) => r.json()).then(setJourneys).catch(() => {});
    fetch(`/api/schools/${schoolId}/transport/incidents?status=open`).then((r) => r.json()).then(setIncidents).catch(() => {});
    fetch(`/api/schools/${schoolId}/transport/messages`).then((r) => r.json()).then(setMsgs).catch(() => {});
    fetch(`/api/schools/${schoolId}/transport/drivers`).then((r) => r.json()).then((d) => setDrivers(d.drivers ?? [])).catch(() => {});
  }, [schoolId]);

  const js: any[] = journeys?.journeys ?? [];
  const active = js.filter((j) => j.status === "started" || j.status === "approaching").length;
  const completed = js.filter((j) => j.status === "completed").length;
  const delayed = js.filter((j) => j.delayMinutes > 0).length;
  const onboard = js.reduce((s, j) => s + (j.onboard || 0), 0);

  const complianceAlerts = useMemo(() => {
    const out: { driver: string; item: string; date: string; tone: string }[] = [];
    for (const d of drivers) {
      const p = d.profile; if (!p) continue;
      for (const [item, date] of [["Licence", p.licenceExpiry], ["DBS", p.dbsExpiry], ["Medical", p.medicalDue]] as [string, string][]) {
        const s = dueState(date); if (s && (s.tone === "suspended" || s.tone === "trial")) out.push({ driver: d.fullName, item, date, tone: s.tone });
      }
    }
    return out;
  }, [drivers]);

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Transport control — today</h2>
        <p className="sub" style={{ marginBottom: 10 }}>{journeys?.date || ""}</p>
        <div className="stat-grid">
          <div className="stat"><div className="n">{js.length}</div><div className="l">Journeys today</div></div>
          <div className="stat"><div className="n" style={{ color: active ? "#16a34a" : undefined }}>{active}</div><div className="l">On the road now</div></div>
          <div className="stat"><div className="n">{onboard}</div><div className="l">Pupils onboard</div></div>
          <div className="stat"><div className="n" style={{ color: delayed ? "#dc2626" : undefined }}>{delayed}</div><div className="l">Delayed</div></div>
          <div className="stat"><div className="n">{completed}</div><div className="l">Completed</div></div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => onNavigate("control")}>Open control centre</button>
          <button className="secondary" onClick={() => onNavigate("incidents")}>Incidents{incidents?.counts?.open ? ` (${incidents.counts.open})` : ""}</button>
          <button className="secondary" onClick={() => onNavigate("messages")}>Driver messages{msgs?.totalUnread ? ` (${msgs.totalUnread})` : ""}</button>
        </div>
      </div>

      <div className="row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Open incidents</h2><button className="secondary small" onClick={() => onNavigate("incidents")}>All</button></div>
          {(incidents?.incidents ?? []).length === 0 ? <p className="muted" style={{ marginTop: 8 }}>No open incidents. ✅</p> : (incidents.incidents.slice(0, 6).map((i: any) => (
            <div key={i.id} style={{ borderTop: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
              <strong style={{ textTransform: "capitalize" }}>{String(i.type).replace(/_/g, " ")}</strong> {i.severity === "high" && <span className="badge suspended">high</span>}
              <div className="muted" style={{ fontSize: 12 }}>{i.routeName ? `${i.routeName} · ` : ""}{i.reportedBy || ""} · {dt(i.at)}</div>
              {i.notes && <div className="muted" style={{ fontSize: 12 }}>{i.notes}</div>}
            </div>
          )))}
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Driver compliance alerts</h2><button className="secondary small" onClick={() => onNavigate("drivers")}>Drivers</button></div>
          {complianceAlerts.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>No licence/DBS/medical items due. ✅</p> : complianceAlerts.slice(0, 8).map((a, i) => (
            <div key={i} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
              <span>{a.driver} — {a.item}</span><DueCell date={a.date} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

/* --------------------------------- Fleet --------------------------------- */
export function TMFleet({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ reference: "", label: "", capacity: 16, type: "minibus" });
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const sel = useSel();
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [sortKey, setSortKey] = useState("reference");
  const [sortDir, setSortDir] = useState<1 | -1>(1);
  const sortBy = (k: string) => { if (sortKey === k) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(1); } };
  const load = useCallback(async () => { setRows((await fetch(`/api/schools/${schoolId}/vehicles`).then((r) => r.json())).vehicles ?? []); sel.clear(); }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) { e.preventDefault(); await fetch(`/api/schools/${schoolId}/vehicles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, capacity: Number(f.capacity) }) }); setF({ reference: "", label: "", capacity: 16, type: "minibus" }); load(); }
  async function saveEdit() {
    const res = await fetch(`/api/schools/${schoolId}/vehicles/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await res.json(); if (d.error) { setMsg(d.error); return; } setEdit(null); load();
  }
  async function setActive(id: string, active: boolean) { await fetch(`/api/schools/${schoolId}/vehicles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) }); load(); }
  async function bulkDeactivate() { for (const id of sel.ids) await fetch(`/api/schools/${schoolId}/vehicles/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: false }) }); load(); }
  const openEdit = (v: any) => setEdit({ id: v.id, reference: v.reference, label: v.label || "", capacity: v.capacity, type: v.type, motDue: v.motDue || "", insuranceDue: v.insuranceDue || "", serviceDue: v.serviceDue || "", taxDue: v.taxDue || "", notes: v.notes || "", active: v.active });
  const view = rows.filter((v) => {
    if (q && !`${v.reference} ${v.label || ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (typeF !== "all" && v.type !== typeF) return false;
    if (statusF === "active" && v.active === false) return false;
    if (statusF === "retired" && v.active !== false) return false;
    return true;
  }).sort((a, b) => {
    const va = a[sortKey] ?? ""; const vb = b[sortKey] ?? "";
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });
  const allOn = view.length > 0 && view.every((v) => sel.on(v.id));
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Fleet</h2>
        <p className="sub">Your vehicles and their compliance reminders. MOT / insurance / service / tax dates are flagged as they approach or fall overdue. Use the ⋯ menu to edit or retire a vehicle.</p>
        {msg && <div className="notice err">{msg}</div>}
        {sel.ids.length > 0 && <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="danger small" onClick={() => { if (confirm(`Retire ${sel.ids.length} vehicle(s)?`)) bulkDeactivate(); }}>Retire (set inactive)</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>}
        <div className="row" style={{ gap: 8, flexWrap: "wrap", margin: "8px 0" }}>
          <div style={{ flex: 2, minWidth: 160 }}><label>Search</label><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reg or label…" /></div>
          <div><label>Type</label><select value={typeF} onChange={(e) => setTypeF(e.target.value)}><option value="all">All types</option><option>minibus</option><option>coach</option><option>car</option></select></div>
          <div><label>Status</label><select value={statusF} onChange={(e) => setStatusF(e.target.value)}><option value="all">All</option><option value="active">In service</option><option value="retired">Retired</option></select></div>
          <div style={{ display: "flex", alignItems: "flex-end", marginLeft: "auto" }}><span className="muted" style={{ fontSize: 12 }}>{view.length} of {rows.length}</span></div>
        </div>
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((v) => v.id), e.target.checked)} aria-label="Select all" /></th>
            {([["reference","Reg / ref"],["label","Label"],["type","Type"],["capacity","Cap."],["motDue","MOT"],["insuranceDue","Insurance"],["serviceDue","Service"],["taxDue","Tax"]] as [string,string][]).map(([k,lbl]) => (
              <th key={k} onClick={() => sortBy(k)} style={{ cursor: "pointer", userSelect: "none" }}>{lbl}{sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : ""}</th>
            ))}
            <th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((v) => (
              <tr key={v.id} style={{ opacity: v.active === false ? 0.5 : 1 }}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(v.id)} onChange={() => sel.toggle(v.id)} aria-label={`Select ${v.reference}`} /></td>
                <td className="mono">{v.reference}{v.active === false && <span className="badge archived" style={{ marginLeft: 6 }}>retired</span>}</td><td>{v.label || "—"}</td><td>{v.type}</td><td>{v.capacity}</td>
                <td><DueCell date={v.motDue} /></td><td><DueCell date={v.insuranceDue} /></td><td><DueCell date={v.serviceDue} /></td><td><DueCell date={v.taxDue} /></td>
                <td className="right"><Kebab items={[{ label: "Edit vehicle", onClick: () => openEdit(v) }, v.active === false ? { label: "Return to service", onClick: () => setActive(v.id, true) } : { label: "Retire (set inactive)", danger: true, onClick: () => setActive(v.id, false) }]} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={10} className="muted">{rows.length === 0 ? "No vehicles yet." : "No vehicles match your filters."}</td></tr>}
          </tbody>
        </table>
        <form onSubmit={add} style={{ marginTop: 12 }}><div className="row">
          <div><label>Reference</label><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required /></div>
          <div><label>Label</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
          <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>minibus</option><option>coach</option><option>car</option></select></div>
          <div><label>Capacity</label><input type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value as any })} /></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button>Add vehicle</button></div>
        </div></form>
      </div>

      <ModuleImportCard schoolId={schoolId} type="vehicles" title="Import vehicles" hint="Bulk-add your fleet from a CSV — matched and updated by registration / fleet number. Or use the Integration Hub for an AI-assisted mapping from your fleet system." />

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>{edit.reference}</h2><button className="secondary small" onClick={() => setEdit(null)}>Close</button></div>
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 2 }}><label>Label</label><input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} /></div>
              <div><label>Type</label><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option>minibus</option><option>coach</option><option>car</option></select></div>
              <div><label>Capacity</label><input type="number" value={edit.capacity} onChange={(e) => setEdit({ ...edit, capacity: e.target.value })} /></div>
            </div>
            <div className="row">
              <div><label>MOT due</label><input type="date" value={edit.motDue} onChange={(e) => setEdit({ ...edit, motDue: e.target.value })} /></div>
              <div><label>Insurance due</label><input type="date" value={edit.insuranceDue} onChange={(e) => setEdit({ ...edit, insuranceDue: e.target.value })} /></div>
            </div>
            <div className="row">
              <div><label>Service due</label><input type="date" value={edit.serviceDue} onChange={(e) => setEdit({ ...edit, serviceDue: e.target.value })} /></div>
              <div><label>Tax due</label><input type="date" value={edit.taxDue} onChange={(e) => setEdit({ ...edit, taxDue: e.target.value })} /></div>
            </div>
            <label>Notes</label><input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <label className="chip" style={{ marginTop: 10, display: "inline-flex" }}><input type="checkbox" style={{ width: "auto" }} checked={edit.active !== false} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> In service</label>
            <div style={{ marginTop: 12 }}><button onClick={saveEdit}>Save vehicle</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* -------------------------------- Drivers -------------------------------- */
export function TMDrivers({ schoolId }: { schoolId: string }) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [assign, setAssign] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const sel = useSel();
  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/transport/drivers`).then((r) => r.json());
    setDrivers(d.drivers ?? []); setRoutes(d.routes ?? []); sel.clear();
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const driverPayload = (d: any, status: string) => { const p = d.profile || {}; return { userId: d.id, phone: d.phone || "", licenceNumber: p.licenceNumber || "", licenceClasses: p.licenceClasses || "", licenceExpiry: p.licenceExpiry || "", dbsExpiry: p.dbsExpiry || "", medicalDue: p.medicalDue || "", notes: p.notes || "", status }; };
  async function setDriverStatus(d: any, status: string) { await fetch(`/api/schools/${schoolId}/transport/drivers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(driverPayload(d, status)) }); load(); }
  async function bulkStatus(status: string) { for (const id of sel.ids) { const d = drivers.find((x) => x.id === id); if (d) await fetch(`/api/schools/${schoolId}/transport/drivers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(driverPayload(d, status)) }); } load(); }

  async function saveProfile() {
    const res = await fetch(`/api/schools/${schoolId}/transport/drivers`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(edit) });
    const d = await res.json(); if (d.error) { setMsg(d.error); return; } setEdit(null); load();
  }
  async function doAssign() {
    // Fetch current route drivers, append this driver (dedupe by session), PUT.
    const cur = (await fetch(`/api/schools/${schoolId}/routes/${assign.routeId}/drivers`).then((r) => r.json())).drivers ?? [];
    const kept = cur.filter((c: any) => !(c.driverUserId === assign.driverUserId));
    const next = [...kept.map((c: any) => ({ driverUserId: c.driverUserId, role: c.role, session: c.session })), { driverUserId: assign.driverUserId, role: assign.role, session: assign.session }];
    const res = await fetch(`/api/schools/${schoolId}/routes/${assign.routeId}/drivers`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drivers: next }) });
    const d = await res.json(); if (d.error) { setMsg(d.error); return; } setAssign(null); load();
  }
  async function unassign(driverUserId: string, routeId: string) {
    const cur = (await fetch(`/api/schools/${schoolId}/routes/${routeId}/drivers`).then((r) => r.json())).drivers ?? [];
    const next = cur.filter((c: any) => c.driverUserId !== driverUserId).map((c: any) => ({ driverUserId: c.driverUserId, role: c.role, session: c.session }));
    // setRouteDrivers requires >=1 driver; if empty, we can't PUT — send a delete-all convention if supported, else keep last.
    if (next.length === 0) { setMsg("A route needs at least one driver; assign a replacement first."); return; }
    await fetch(`/api/schools/${schoolId}/routes/${routeId}/drivers`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ drivers: next }) });
    load();
  }

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Drivers</h2>
        <p className="sub">Your driving team, their licence / DBS / medical compliance, and route assignments. Use the ⋯ menu to edit a profile, assign a route, or set a driver inactive.</p>
        {msg && <div className="notice err">{msg}</div>}
        {sel.ids.length > 0 && <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="secondary small" onClick={() => bulkStatus("active")}>Set active</button><button className="danger small" onClick={() => bulkStatus("inactive")}>Set inactive</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>}
        <table>
          <thead><tr><th className="checkbox-cell"><input type="checkbox" checked={drivers.length > 0 && drivers.every((d) => sel.on(d.id))} onChange={(e) => sel.setMany(drivers.map((d) => d.id), e.target.checked)} aria-label="Select all" /></th><th>Driver</th><th>Licence</th><th>DBS</th><th>Medical</th><th>Routes</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {drivers.map((d) => (
              <tr key={d.id} style={{ opacity: d.profile?.status === "inactive" ? 0.55 : 1 }}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(d.id)} onChange={() => sel.toggle(d.id)} aria-label={`Select ${d.fullName}`} /></td>
                <td><strong>{d.fullName}</strong>{d.profile?.status === "inactive" && <span className="badge archived" style={{ marginLeft: 6 }}>inactive</span>}<div className="mono muted" style={{ fontSize: 11 }}>{d.email}{d.phone ? ` · ${d.phone}` : ""}</div></td>
                <td>{d.profile?.licenceExpiry ? <DueCell date={d.profile.licenceExpiry} /> : <span className="muted">—</span>}{d.profile?.licenceClasses ? <div className="muted" style={{ fontSize: 11 }}>{d.profile.licenceClasses}</div> : null}</td>
                <td><DueCell date={d.profile?.dbsExpiry} /></td>
                <td><DueCell date={d.profile?.medicalDue} /></td>
                <td>{d.assignments.length === 0 ? <span className="muted">—</span> : d.assignments.map((a: any) => (
                  <div key={a.id} style={{ fontSize: 12 }}>{a.routeName} <span className="muted">({a.role}/{a.session})</span> <button className="linklike" style={{ fontSize: 11, color: "var(--danger)" }} onClick={() => unassign(d.id, a.routeId)}>remove</button></div>
                ))}</td>
                <td className="right"><Kebab items={[
                  { label: "Edit profile", onClick: () => setEdit({ userId: d.id, name: d.fullName, phone: d.phone || "", licenceNumber: d.profile?.licenceNumber || "", licenceClasses: d.profile?.licenceClasses || "", licenceExpiry: d.profile?.licenceExpiry || "", dbsExpiry: d.profile?.dbsExpiry || "", medicalDue: d.profile?.medicalDue || "", status: d.profile?.status || "active", notes: d.profile?.notes || "" }) },
                  routes.length > 0 && { label: "Assign to route", onClick: () => setAssign({ driverUserId: d.id, name: d.fullName, routeId: routes[0]?.id || "", role: "primary", session: "all" }) },
                  d.profile?.status === "inactive" ? { label: "Set active", onClick: () => setDriverStatus(d, "active") } : { label: "Set inactive", danger: true, onClick: () => setDriverStatus(d, "inactive") },
                ]} /></td>
              </tr>
            ))}
            {drivers.length === 0 && <tr><td colSpan={7} className="muted">No drivers yet. Add drivers below (import), or add a user with the Driver role in the School portal.</td></tr>}
          </tbody>
        </table>
      </div>

      <ModuleImportCard schoolId={schoolId} type="drivers" title="Import drivers" hint="Bulk-add drivers from a CSV (email, name, phone, licence, DBS, medical dates). Creates a Driver-role account + personnel record, matched by email." />

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>{edit.name}</h2><button className="secondary small" onClick={() => setEdit(null)}>Close</button></div>
            <div className="row" style={{ marginTop: 10 }}>
              <div><label>Phone</label><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></div>
              <div><label>Status</label><select value={edit.status} onChange={(e) => setEdit({ ...edit, status: e.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></select></div>
            </div>
            <div className="row">
              <div><label>Licence number</label><input value={edit.licenceNumber} onChange={(e) => setEdit({ ...edit, licenceNumber: e.target.value })} /></div>
              <div><label>Classes</label><input value={edit.licenceClasses} onChange={(e) => setEdit({ ...edit, licenceClasses: e.target.value })} placeholder="D1, D" /></div>
            </div>
            <div className="row">
              <div><label>Licence expiry</label><input type="date" value={edit.licenceExpiry} onChange={(e) => setEdit({ ...edit, licenceExpiry: e.target.value })} /></div>
              <div><label>DBS expiry</label><input type="date" value={edit.dbsExpiry} onChange={(e) => setEdit({ ...edit, dbsExpiry: e.target.value })} /></div>
              <div><label>Medical due</label><input type="date" value={edit.medicalDue} onChange={(e) => setEdit({ ...edit, medicalDue: e.target.value })} /></div>
            </div>
            <label>Notes</label><input value={edit.notes} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} />
            <div style={{ marginTop: 12 }}><button onClick={saveProfile}>Save driver profile</button></div>
          </div>
        </div>
      )}

      {assign && (
        <div className="modal-overlay" onClick={() => setAssign(null)}>
          <div className="modal" style={{ maxWidth: 480, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Assign {assign.name}</h2><button className="secondary small" onClick={() => setAssign(null)}>Close</button></div>
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 2 }}><label>Route</label><select value={assign.routeId} onChange={(e) => setAssign({ ...assign, routeId: e.target.value })}>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
              <div><label>Role</label><select value={assign.role} onChange={(e) => setAssign({ ...assign, role: e.target.value })}><option>primary</option><option>relief</option><option>secondary</option></select></div>
              <div><label>Session</label><select value={assign.session} onChange={(e) => setAssign({ ...assign, session: e.target.value })}><option value="all">All</option><option value="am">AM</option><option value="pm">PM</option></select></div>
            </div>
            <div style={{ marginTop: 12 }}><button onClick={doAssign}>Assign to route</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* ------------------------------- Incidents ------------------------------- */
const SEV_BADGE: Record<string, string> = { high: "suspended", medium: "trial", low: "archived" };
export function TMIncidents({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const [filter, setFilter] = useState("");
  const [resolving, setResolving] = useState<any | null>(null);
  const load = useCallback(async () => setData(await fetch(`/api/schools/${schoolId}/transport/incidents${filter ? `?status=${filter}` : ""}`).then((r) => r.json())), [schoolId, filter]);
  useEffect(() => { load(); }, [load]);
  async function patch(id: string, body: any) { await fetch(`/api/schools/${schoolId}/transport/incidents`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, ...body }) }); setResolving(null); load(); }
  const rows: any[] = data?.incidents ?? [];
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Incident log</h2>
        <p className="sub">Everything reported by drivers or raised by failed vehicle checks. Acknowledge and resolve to keep the log clean.</p>
        <div className="chips" style={{ marginTop: 8 }}>
          {[["", "All"], ["open", `Open (${data?.counts?.open ?? 0})`], ["acknowledged", `Acknowledged (${data?.counts?.acknowledged ?? 0})`], ["resolved", `Resolved (${data?.counts?.resolved ?? 0})`]].map(([k, l]) => (
            <button key={k} className={filter === k ? "" : "secondary"} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>When</th><th>Type</th><th>Severity</th><th>Route</th><th>Reported by</th><th>Status</th><th className="right"></th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td className="mono muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{dt(i.at)}</td>
                <td><strong style={{ textTransform: "capitalize" }}>{String(i.type).replace(/_/g, " ")}</strong>{i.notes ? <div className="muted" style={{ fontSize: 11 }}>{i.notes}</div> : null}</td>
                <td><span className={`badge ${SEV_BADGE[i.severity] || "archived"}`}>{i.severity}</span></td>
                <td>{i.routeName || <span className="muted">—</span>}{i.session ? <span className="muted"> ({i.session})</span> : null}</td>
                <td>{i.reportedBy || <span className="muted">—</span>}</td>
                <td><span className={`badge ${i.status === "resolved" ? "active" : i.status === "acknowledged" ? "trial" : "suspended"}`}>{i.status}</span>{i.resolutionNote ? <div className="muted" style={{ fontSize: 11 }}>{i.resolutionNote}</div> : null}</td>
                <td className="right nowrap">
                  {i.status === "open" && <button className="secondary small" onClick={() => patch(i.id, { status: "acknowledged" })}>Acknowledge</button>}{" "}
                  {i.status !== "resolved" && <button className="small" onClick={() => setResolving(i)}>Resolve</button>}
                  {i.status === "resolved" && <button className="secondary small" onClick={() => patch(i.id, { status: "open" })}>Reopen</button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">No incidents{filter ? " in this view" : ""}.</td></tr>}
          </tbody>
        </table>
      </div>
      {resolving && (
        <div className="modal-overlay" onClick={() => setResolving(null)}>
          <div className="modal" style={{ maxWidth: 460, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Resolve incident</h2><button className="secondary small" onClick={() => setResolving(null)}>Close</button></div>
            <p className="sub" style={{ textTransform: "capitalize" }}>{String(resolving.type).replace(/_/g, " ")}{resolving.notes ? ` — ${resolving.notes}` : ""}</p>
            <label>Resolution note (optional)</label>
            <ResolveBox onResolve={(note) => patch(resolving.id, { status: "resolved", resolutionNote: note })} />
          </div>
        </div>
      )}
    </>
  );
}
function ResolveBox({ onResolve }: { onResolve: (note: string) => void }) {
  const [note, setNote] = useState("");
  return (<><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="How was it resolved?" /><div style={{ marginTop: 12 }}><button onClick={() => onResolve(note)}>Mark resolved</button></div></>);
}

/* -------------------------------- Messages ------------------------------- */
export function TMMessages({ schoolId }: { schoolId: string }) {
  const [threads, setThreads] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState("");
  const loadThreads = useCallback(async () => { const d = await fetch(`/api/schools/${schoolId}/transport/messages`).then((r) => r.json()); setThreads(d.threads ?? []); }, [schoolId]);
  useEffect(() => { loadThreads(); }, [loadThreads]);
  const openThread = useCallback(async (t: any) => {
    setActive(t);
    const d = await fetch(`/api/schools/${schoolId}/transport/messages?driver=${t.driverId}`).then((r) => r.json());
    setMessages(d.messages ?? []); loadThreads();
  }, [schoolId, loadThreads]);
  async function send() {
    if (!text.trim() || !active) return;
    await fetch(`/api/schools/${schoolId}/transport/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverUserId: active.driverId, body: text.trim() }) });
    setText(""); openThread(active);
  }
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Driver messages</h2>
      <p className="sub">Two-way messages with your drivers. They see these in the driver app; replies land back here.</p>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 8 }}>
        <div style={{ flex: "0 0 240px", minWidth: 220 }}>
          {threads.map((t) => (
            <button key={t.driverId} onClick={() => openThread(t)} style={{ display: "block", width: "100%", textAlign: "left", background: active?.driverId === t.driverId ? "#eef2ff" : "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", color: "var(--ink)" }}>
              <div style={{ fontWeight: 700 }}>{t.driverName}{t.unread > 0 && <span className="badge" style={{ background: "#dc2626", color: "#fff", marginLeft: 6 }}>{t.unread}</span>}</div>
              {t.last && <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last.direction === "to_office" ? "↩ " : ""}{t.last.body}</div>}
            </button>
          ))}
          {threads.length === 0 && <p className="muted">No drivers yet.</p>}
        </div>
        <div style={{ flex: 1, minWidth: 300 }}>
          {!active ? <p className="muted">Select a driver to view the conversation.</p> : (
            <>
              <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, minHeight: 240, maxHeight: 420, overflowY: "auto", background: "#fafbfe" }}>
                {messages.length === 0 ? <p className="muted">No messages yet — say hello.</p> : messages.map((m) => (
                  <div key={m.id} style={{ textAlign: m.direction === "to_driver" ? "right" : "left", margin: "6px 0" }}>
                    <div style={{ display: "inline-block", maxWidth: "80%", background: m.direction === "to_driver" ? "#4f46e5" : "#fff", color: m.direction === "to_driver" ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", fontSize: 13 }}>
                      {m.body}
                      <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>{new Date(m.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ flex: 4 }}><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder={`Message ${active.driverName}…`} /></div>
                <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={send}>Send</button></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ Travel Logs ------------------------------ */
export function TMTravelLogs({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const [from, setFrom] = useState(() => { const d = new Date(Date.now() - 30 * 86400000); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; });
  const [to, setTo] = useState(today);
  const [route, setRoute] = useState("");
  const [driver, setDriver] = useState("");
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ from, to }); if (route) qs.set("route", route); if (driver) qs.set("driver", driver);
    setData(await fetch(`/api/schools/${schoolId}/transport/travel-logs?${qs}`).then((r) => r.json()));
  }, [schoolId, from, to, route, driver]);
  useEffect(() => { load(); }, [load]);

  async function exportCsv() {
    const rows: any[] = data?.rows ?? [];
    const head = ["date", "session", "route", "vehicle", "driver", "status", "boarded", "absent", "total", "delayMinutes", "durationMin"];
    const csv = [head.join(","), ...rows.map((r) => head.map((h) => `"${String(r[h] ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
    const stamped = await stampCsv({ section: "Transport", reportName: `Travel logs (${from} to ${to})`, csv, schoolId });
    const blob = new Blob([stamped], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `travel-logs-${from}_to_${to}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  const s = data?.stats || {};
  const rows: any[] = data?.rows ?? [];
  return (
    <>
      <div className="panel">
        <div className="flex-between"><div><h2 style={{ margin: 0 }}>Travel logs</h2><p className="sub" style={{ marginBottom: 0 }}>Journey records for analysis. Filter by date range, route or driver.</p></div>
          <button className="secondary" onClick={exportCsv} disabled={rows.length === 0}>Export CSV</button></div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} /></div>
          <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} /></div>
          <div><label>Route</label><select value={route} onChange={(e) => setRoute(e.target.value)} style={{ width: "auto" }}><option value="">All routes</option>{(data?.routes ?? []).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div><label>Driver</label><select value={driver} onChange={(e) => setDriver(e.target.value)} style={{ width: "auto" }}><option value="">All drivers</option>{(data?.drivers ?? []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></div>
        </div>
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="stat"><div className="n">{s.journeys ?? 0}</div><div className="l">Journeys</div></div>
          <div className="stat"><div className="n" style={{ color: "#16a34a" }}>{s.completed ?? 0}</div><div className="l">Completed</div></div>
          <div className="stat"><div className="n">{s.totalBoardings ?? 0}</div><div className="l">Pupil boardings</div></div>
          <div className="stat"><div className="n" style={{ color: s.totalAbsences ? "#dc2626" : undefined }}>{s.totalAbsences ?? 0}</div><div className="l">Absences</div></div>
          <div className="stat"><div className="n" style={{ color: s.delayedJourneys ? "#dc2626" : undefined }}>{s.delayedJourneys ?? 0}</div><div className="l">Delayed</div></div>
          <div className="stat"><div className="n">{s.avgDurationMin != null ? `${s.avgDurationMin}m` : "—"}</div><div className="l">Avg duration</div></div>
        </div>
      </div>
      <div className="panel">
        {!data ? <p className="muted">Loading…</p> : (
          <table>
            <thead><tr><th>Date</th><th>Session</th><th>Route</th><th>Vehicle</th><th>Driver</th><th>Status</th><th>Boarded</th><th>Absent</th><th>Delay</th><th>Duration</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted">{r.date}</td><td>{String(r.session ?? "").toUpperCase() || "—"}</td><td>{r.route}</td><td>{r.vehicle || "—"}</td><td>{r.driver || "—"}</td>
                  <td><span className={`badge ${r.status === "completed" ? "active" : r.status === "cancelled" ? "suspended" : "trial"}`}>{r.status}</span></td>
                  <td>{r.boarded}/{r.total}</td><td>{r.absent}</td><td>{r.delayMinutes ? `+${r.delayMinutes}m` : "—"}</td><td>{r.durationMin != null ? `${r.durationMin}m` : "—"}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={10} className="muted">No journeys in this range.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ------------------------------ Driver Logs ------------------------------ */
export function TMDriverLogs({ schoolId }: { schoolId: string }) {
  const [drivers, setDrivers] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { fetch(`/api/schools/${schoolId}/transport/driver-logs`).then((r) => r.json()).then((d) => setDrivers(d.drivers ?? [])).catch(() => {}); }, [schoolId]);
  useEffect(() => { if (open) { setDetail(null); fetch(`/api/schools/${schoolId}/transport/driver-logs?driver=${open}`).then((r) => r.json()).then(setDetail).catch(() => {}); } }, [open, schoolId]);

  if (open) {
    const d = detail;
    return (
      <>
        <button className="secondary small" onClick={() => setOpen(null)}>← All drivers</button>
        {!d ? <div className="panel" style={{ marginTop: 10 }}>Loading…</div> : (
          <>
            <div className="panel" style={{ marginTop: 10 }}>
              <h2 style={{ margin: 0 }}>{d.driver?.fullName}</h2>
              <p className="sub" style={{ marginBottom: 8 }}>{d.driver?.email}{d.driver?.phone ? ` · ${d.driver.phone}` : ""}</p>
              <div className="stat-grid">
                <div className="stat"><div className="n">{d.summary.journeys}</div><div className="l">Journeys</div></div>
                <div className="stat"><div className="n" style={{ color: "#16a34a" }}>{d.summary.completed}</div><div className="l">Completed</div></div>
                <div className="stat"><div className="n">{d.summary.boardings}</div><div className="l">Boardings</div></div>
                <div className="stat"><div className="n" style={{ color: d.summary.absences ? "#dc2626" : undefined }}>{d.summary.absences}</div><div className="l">Absences</div></div>
                <div className="stat"><div className="n" style={{ color: d.summary.incidents ? "#dc2626" : undefined }}>{d.summary.incidents}</div><div className="l">Incidents</div></div>
              </div>
            </div>
            <div className="panel">
              <h2 style={{ fontSize: 16, margin: 0 }}>Journey log</h2>
              <table><thead><tr><th>Date</th><th>Session</th><th>Route</th><th>Vehicle</th><th>Started</th><th>Finished</th><th>Boarded</th><th>Delay</th><th>Status</th></tr></thead><tbody>
                {d.rows.map((r: any) => (
                  <tr key={r.id}><td className="mono muted">{r.date}</td><td>{r.session.toUpperCase()}</td><td>{r.route}</td><td>{r.vehicle || "—"}</td>
                    <td className="mono muted">{r.startedAt ? new Date(r.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="mono muted">{r.completedAt ? new Date(r.completedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td>{r.boarded}/{r.total}</td><td>{r.delayMinutes ? `+${r.delayMinutes}m` : "—"}</td>
                    <td><span className={`badge ${r.status === "completed" ? "active" : r.status === "cancelled" ? "suspended" : "trial"}`}>{r.status}</span></td></tr>
                ))}
                {d.rows.length === 0 && <tr><td colSpan={9} className="muted">No journeys recorded for this driver.</td></tr>}
              </tbody></table>
            </div>
            {d.incidents.length > 0 && (
              <div className="panel"><h2 style={{ fontSize: 16, margin: 0 }}>Incidents reported</h2>
                {d.incidents.map((i: any) => <div key={i.id} style={{ borderTop: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}><strong style={{ textTransform: "capitalize" }}>{String(i.type).replace(/_/g, " ")}</strong> <span className={`badge ${i.severity === "high" ? "suspended" : "archived"}`}>{i.severity}</span> <span className="muted">{dt(i.at)}</span>{i.notes ? <div className="muted">{i.notes}</div> : null}</div>)}
              </div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Driver logs</h2>
      <p className="sub">Activity for every driver in the school. Open a driver to see their full journey log, boardings and reported incidents.</p>
      <table><thead><tr><th>Driver</th><th>Journeys</th><th>Completed</th><th>Last active</th><th className="right"></th></tr></thead><tbody>
        {drivers.map((d) => (
          <tr key={d.id}><td><strong>{d.name}</strong><div className="mono muted" style={{ fontSize: 11 }}>{d.email}</div></td><td>{d.journeys}</td><td>{d.completed}</td><td className="mono muted">{d.lastActive || "—"}</td>
            <td className="right"><button className="small" onClick={() => setOpen(d.id)}>View log</button></td></tr>
        ))}
        {drivers.length === 0 && <tr><td colSpan={5} className="muted">No drivers yet.</td></tr>}
      </tbody></table>
    </div>
  );
}

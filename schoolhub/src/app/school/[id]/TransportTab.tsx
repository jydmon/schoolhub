"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
import { useSel, Kebab } from "./EntityKit";
import ModuleImportCard from "./ModuleImportCard";
import { TMDriverLogs } from "../../transport/TransportPages";

export default function TransportTab({ schoolId }: { schoolId: string }) {
  const [sub, setSub] = useState<"control" | "routes" | "vehicles" | "profiles" | "fees" | "requests" | "enquiries" | "driverlogs">("control");
  return (
    <>
      <div className="tabs">
        {([["control", "Control centre"], ["routes", "Routes"], ["vehicles", "Vehicles"], ["profiles", "Student profiles"], ["driverlogs", "Driver logs"], ["fees", "Fees & cost"], ["requests", "Requests"], ["enquiries", "Enquiries"]] as [any, string][]).map(([k, l]) => (
          <button key={k} className={sub === k ? "active" : ""} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === "control" && <Control schoolId={schoolId} />}
      {sub === "routes" && <Routes schoolId={schoolId} />}
      {sub === "vehicles" && <><Vehicles schoolId={schoolId} /><ModuleImportCard schoolId={schoolId} type="vehicles" title="Import vehicles" hint="Bulk-add your fleet from a CSV — matched and updated by registration / fleet number." /></>}
      {sub === "profiles" && <Profiles schoolId={schoolId} />}
      {sub === "driverlogs" && <TMDriverLogs schoolId={schoolId} />}
      {sub === "fees" && <Fees schoolId={schoolId} />}
      {sub === "requests" && <Requests schoolId={schoolId} />}
      {sub === "enquiries" && <Enquiries schoolId={schoolId} />}
    </>
  );
}

export function Control({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [register, setRegister] = useState<Record<string, any[]>>({});
  const [mapId, setMapId] = useState<string | null>(null);
  const [track, setTrack] = useState<any>(null);
  const load = useCallback(async () => { setData(await fetch(`/api/schools/${schoolId}/transport/journeys`).then((r) => r.json())); }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  // Poll the live track every 10s while a map is open.
  useEffect(() => {
    if (!mapId) return;
    let alive = true;
    const fetchTrack = async () => { const d = await fetch(`/api/schools/${schoolId}/transport/journeys/${mapId}/track`).then((r) => r.json()); if (alive) setTrack(d); };
    fetchTrack();
    const t = setInterval(fetchTrack, 10000);
    return () => { alive = false; clearInterval(t); };
  }, [mapId, schoolId]);
  function toggleMap(jid: string) { if (mapId === jid) { setMapId(null); setTrack(null); } else { setTrack(null); setMapId(jid); } }
  async function gen(session: string) {
    const r = await fetch(`/api/schools/${schoolId}/transport/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) }).then((x) => x.json());
    setMsg(`Generated ${r.created ?? 0} ${session.toUpperCase()} journey(s).`); load();
  }
  async function toggleRegister(jid: string) {
    if (openId === jid) { setOpenId(null); return; }
    setOpenId(jid);
    if (!register[jid]) {
      const d = await fetch(`/api/schools/${schoolId}/transport/journeys/${jid}/boardings`).then((r) => r.json());
      setRegister((m) => ({ ...m, [jid]: d.boardings ?? [] }));
    }
  }
  const bStatus = (s: string) => s === "boarded" ? "active" : s === "dropped_off" ? "trial" : "suspended";
  const bLabel = (s: string) => s === "boarded" ? "checked in" : s === "dropped_off" ? "checked out" : s === "absent" ? "absent" : s === "not_present" ? "not present" : s;
  if (!data) return <div className="panel">Loading…</div>;
  return (
    <>
      <div className="panel">
        <div className="flex-between"><div><h2>Transport control centre</h2><p className="sub" style={{ marginBottom: 0 }}>{data.date} · open a journey&apos;s check-in/out register or its live map</p></div>
          <div><button className="secondary" onClick={() => gen("am")}>Generate AM</button> <button className="secondary" onClick={() => gen("pm")}>Generate PM</button></div></div>
        {msg && <div className="notice ok" style={{ marginTop: 10 }}>{msg}</div>}
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Route</th><th>Session</th><th>Status</th><th>Onboard</th><th>Dropped</th><th>Absent</th><th>Delay</th><th className="right"></th></tr></thead>
          <tbody>
            {data.journeys.map((j: any) => (
              <Fragment key={j.id}>
                <tr>
                  <td>{j.routeName}<div className="muted" style={{ fontSize: 11 }}>{j.vehicle || "—"}</div></td><td>{j.session.toUpperCase()}</td>
                  <td><span className={`badge ${j.status === "completed" ? "active" : j.status === "cancelled" ? "suspended" : "trial"}`}>{j.status}</span></td>
                  <td>{j.onboard}</td><td>{j.droppedOff}</td><td>{j.absent}</td><td>{j.delayMinutes ? `+${j.delayMinutes}m` : "—"}</td>
                  <td className="right"><button className="linklike" style={{ fontSize: 12 }} onClick={() => toggleMap(j.id)}>{mapId === j.id ? "Hide map" : "Live map"}</button>{" · "}<button className="linklike" style={{ fontSize: 12 }} onClick={() => toggleRegister(j.id)}>{openId === j.id ? "Hide register" : "Register"}</button></td>
                </tr>
                {mapId === j.id && (
                  <tr>
                    <td colSpan={8} style={{ background: "#fafbfe" }}>
                      {!track ? <span className="muted">Loading live position…</span> : <LiveMap track={track} />}
                    </td>
                  </tr>
                )}
                {openId === j.id && (
                  <tr>
                    <td colSpan={8} style={{ background: "#fafbfe" }}>
                      {!register[j.id] ? <span className="muted">Loading…</span> : register[j.id].length === 0 ? <span className="muted">No pupils checked in/out yet for this journey.</span> : (
                        <table style={{ margin: "4px 0" }}>
                          <thead><tr><th>Pupil</th><th>Year</th><th>Status</th><th>Time</th></tr></thead>
                          <tbody>
                            {register[j.id].map((b: any) => (
                              <tr key={b.id}><td>{b.name}</td><td>{b.yearGroup || "—"}</td><td><span className={`badge ${bStatus(b.status)}`}>{bLabel(b.status)}</span></td><td className="mono muted" style={{ fontSize: 12 }}>{b.at ? new Date(b.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {data.journeys.length === 0 && <tr><td colSpan={8} className="muted">No journeys today — generate AM/PM.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel"><h2>Recent incidents</h2>
        {data.incidents.length === 0 ? <p className="muted">None.</p> : <ul style={{ paddingLeft: 18, margin: 0 }}>{data.incidents.map((i: any) => <li key={i.id}>{new Date(i.at).toLocaleString()} — {i.type}{i.notes ? `: ${i.notes}` : ""}</li>)}</ul>}
      </div>
    </>
  );
}

export function Vehicles({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [f, setF] = useState({ reference: "", label: "", capacity: 16, type: "minibus" });
  const load = useCallback(async () => setRows((await fetch(`/api/schools/${schoolId}/vehicles`).then((r) => r.json())).vehicles ?? []), [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) { e.preventDefault(); await fetch(`/api/schools/${schoolId}/vehicles`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, capacity: Number(f.capacity) }) }); setF({ reference: "", label: "", capacity: 16, type: "minibus" }); load(); }
  return (
    <div className="panel"><h2>Vehicles</h2>
      <table><thead><tr><th>Reference</th><th>Label</th><th>Type</th><th>Capacity</th></tr></thead><tbody>
        {rows.map((v) => <tr key={v.id}><td className="mono">{v.reference}</td><td>{v.label || "—"}</td><td>{v.type}</td><td>{v.capacity}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={4} className="muted">No vehicles.</td></tr>}
      </tbody></table>
      <form onSubmit={add} style={{ marginTop: 12 }}><div className="row">
        <div><label>Reference</label><input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} required /></div>
        <div><label>Label</label><input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} /></div>
        <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>minibus</option><option>coach</option><option>car</option></select></div>
        <div><label>Capacity</label><input type="number" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value as any })} /></div>
      </div><button style={{ marginTop: 10 }}>Add vehicle</button></form>
    </div>
  );
}

export function Routes({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [f, setF] = useState({ name: "", type: "fixed", cutoffTime: "07:00", termlyFee: "", vehicleId: "", driverUserId: "", stops: "Green Lane|pickup|07:30|Green Lane, town\nMill Road|shared|07:40|Mill Road, town\nSchool|school|08:30|" });
  const [geo, setGeo] = useState<{ id: string; text: string } | null>(null);
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const sel = useSel();
  const load = useCallback(async () => {
    setRows((await fetch(`/api/schools/${schoolId}/routes`).then((r) => r.json())).routes ?? []);
    setVehicles((await fetch(`/api/schools/${schoolId}/vehicles`).then((r) => r.json())).vehicles ?? []);
    // Transport-scoped driver list (works for transport managers without MANAGE_USERS).
    const drv = (await fetch(`/api/schools/${schoolId}/transport/drivers`).then((r) => r.json())).drivers ?? [];
    setDrivers(drv);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  // Parse a stop line: Name | kind | HH:MM | address-or-"lat,lng"
  function parseStops(text: string) {
    return text.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [name, kind, plannedArrival, loc] = l.split("|").map((x) => (x || "").trim());
      const stop: any = { name, kind: kind || "pickup", plannedArrival: plannedArrival || undefined };
      const m = (loc || "").match(/^(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if (m) { stop.lat = parseFloat(m[1]); stop.lng = parseFloat(m[2]); }
      else if (loc) stop.address = loc;
      return stop;
    });
  }
  async function add(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/schools/${schoolId}/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.name, type: f.type, cutoffTime: f.cutoffTime, termlyFee: f.termlyFee ? Number(f.termlyFee) : null, vehicleId: f.vehicleId || null, driverUserId: f.driverUserId || null, stops: parseStops(f.stops) }) });
    setF({ ...f, name: "", termlyFee: "" }); setShowAdd(false); load();
  }
  async function geocodeRoute(id: string) {
    setGeo({ id, text: "Geocoding stops…" });
    const d = await fetch(`/api/schools/${schoolId}/routes/${id}/geocode`, { method: "POST" }).then((r) => r.json()).catch(() => ({}));
    if (d.error) setGeo({ id, text: d.error });
    else setGeo({ id, text: `${d.mapped}/${d.total} stops mapped${d.remaining ? ` · ${d.remaining} left — click again to continue` : ""}.` });
    load();
  }
  const mapped = (r: any) => r.stops.filter((s: any) => s.lat != null && s.lng != null).length;
  const driverName = (id?: string | null) => drivers.find((d) => d.id === id)?.fullName || null;
  function openEdit(r: any) { setEdit({ id: r.id, name: r.name, type: r.type, vehicleId: r.vehicle?.id || r.vehicleId || "", driverUserId: r.driverUserId || "", cutoffTime: r.cutoffTime || "07:00", termlyFee: r.termlyFee != null ? String(r.termlyFee) : "", active: r.active !== false }); setMsg(""); }
  async function saveEdit() {
    const body = { name: edit.name, type: edit.type, vehicleId: edit.vehicleId || null, driverUserId: edit.driverUserId || null, cutoffTime: edit.cutoffTime, termlyFee: edit.termlyFee ? Number(edit.termlyFee) : null, active: edit.active };
    const res = await fetch(`/api/schools/${schoolId}/routes/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({})); if (d.error) { setMsg(d.error); return; } setEdit(null); load();
  }
  async function del(id: string) { await fetch(`/api/schools/${schoolId}/routes/${id}`, { method: "DELETE" }); load(); }
  async function bulkDelete() { for (const id of sel.ids) await fetch(`/api/schools/${schoolId}/routes/${id}`, { method: "DELETE" }); sel.clear(); load(); }
  const allOn = rows.length > 0 && rows.every((r) => sel.on(r.id));
  return (
    <div className="panel">
      <div className="flex-between" style={{ alignItems: "flex-start" }}>
        <div><h2 style={{ margin: 0 }}>Routes</h2>
          <p className="sub" style={{ marginBottom: 0 }}>Assign a <strong>vehicle</strong> and a <strong>driver</strong> to each route via the ⋯ menu. Add stop addresses (or exact <span className="mono">lat,lng</span>) so stops and buses show on the live maps; use <strong>Map stops</strong> to look up coordinates automatically.</p></div>
        <div style={{ display: "flex", gap: 8, whiteSpace: "nowrap" }}>
          <button className="secondary" onClick={() => setShowImport(true)}>Import routes</button>
          <button onClick={() => setShowAdd(true)}>Add route</button>
        </div>
      </div>
      {msg && <div className="notice err" style={{ marginTop: 10 }}>{msg}</div>}
      {sel.ids.length > 0 && <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="danger small" onClick={() => { if (confirm(`Delete ${sel.ids.length} route(s)? This can't be undone.`)) bulkDelete(); }}>Delete</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>}
      <table><thead><tr>
        <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(rows.map((r) => r.id), e.target.checked)} aria-label="Select all" /></th>
        <th>Name</th><th>Type</th><th>Vehicle</th><th>Driver</th><th>Stops</th><th>Mapped</th><th>Students</th><th>Termly fee</th><th>Cut-off</th><th className="right">Actions</th></tr></thead><tbody>
        {rows.map((r) => { const m = mapped(r); return (
          <tr key={r.id}>
            <td className="checkbox-cell"><input type="checkbox" checked={sel.on(r.id)} onChange={() => sel.toggle(r.id)} aria-label={`Select ${r.name}`} /></td>
            <td>{r.name}{r.active === false && <span className="badge archived" style={{ marginLeft: 6 }}>inactive</span>}</td><td>{r.type}</td>
            <td>{r.vehicle ? (r.vehicle.label || r.vehicle.reference) : <span className="muted">—</span>}</td>
            <td>{driverName(r.driverUserId) || <span className="muted">—</span>}</td><td>{r.stops.length}</td>
            <td>{r.stops.length ? <span className={`badge ${m === r.stops.length ? "active" : m ? "trial" : "archived"}`}>{m}/{r.stops.length}</span> : "—"}{geo && geo.id === r.id ? <div className="muted" style={{ fontSize: 11 }}>{geo.text}</div> : null}</td>
            <td>{r._count.profiles}</td><td>{r.termlyFee != null ? `£${Number(r.termlyFee).toFixed(2)}` : "—"}</td><td>{r.cutoffTime}</td>
            <td className="right"><Kebab items={[{ label: "Edit route", onClick: () => openEdit(r) }, m < r.stops.length && { label: "Map stops", onClick: () => geocodeRoute(r.id) }, { label: "Delete", danger: true, onClick: () => { if (confirm(`Delete route "${r.name}"?`)) del(r.id); } }]} /></td></tr>
        ); })}
        {rows.length === 0 && <tr><td colSpan={11} className="muted">No routes.</td></tr>}
      </tbody></table>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 640, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Add route</h2><button className="secondary small" onClick={() => setShowAdd(false)}>Close</button></div>
            <form onSubmit={add} style={{ marginTop: 12 }}>
              <div className="row">
                <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
                <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>fixed</option><option>flexible</option></select></div>
              </div>
              <div className="row">
                <div><label>Vehicle</label><select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label || v.reference}</option>)}</select></div>
                <div><label>Driver</label><select value={f.driverUserId} onChange={(e) => setF({ ...f, driverUserId: e.target.value })}><option value="">—</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></div>
                <div><label>Termly fee (£)</label><input type="number" step="0.01" value={f.termlyFee} onChange={(e) => setF({ ...f, termlyFee: e.target.value })} /></div>
                <div><label>Cut-off</label><input value={f.cutoffTime} onChange={(e) => setF({ ...f, cutoffTime: e.target.value })} /></div>
              </div>
              <label>Stops (one per line: Name|kind|HH:MM|address or lat,lng)</label>
              <textarea rows={4} value={f.stops} onChange={(e) => setF({ ...f, stops: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12 }} />
              <button type="submit" style={{ marginTop: 10 }}>Add route</button>
            </form>
          </div>
        </div>
      )}

      {showImport && (
        <div className="modal-overlay" onClick={() => setShowImport(false)}>
          <div className="modal" style={{ maxWidth: 720, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Import routes</h2><button className="secondary small" onClick={() => setShowImport(false)}>Close</button></div>
            <div style={{ marginTop: 10 }}><ModuleImportCard schoolId={schoolId} type="routes" defaultOpen title="Import routes" hint="Bulk-add routes from a CSV. Link a vehicle by its reference — import vehicles first. Or use the Integration Hub for an AI-assisted mapping." /></div>
          </div>
        </div>
      )}

      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Edit route</h2><button className="secondary small" onClick={() => setEdit(null)}>Close</button></div>
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 2 }}><label>Name</label><input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
              <div><label>Type</label><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option>fixed</option><option>flexible</option></select></div>
            </div>
            <div className="row">
              <div><label>Vehicle</label><select value={edit.vehicleId} onChange={(e) => setEdit({ ...edit, vehicleId: e.target.value })}><option value="">— none —</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label || v.reference}</option>)}</select></div>
              <div><label>Driver</label><select value={edit.driverUserId} onChange={(e) => setEdit({ ...edit, driverUserId: e.target.value })}><option value="">— none —</option>{drivers.map((d) => <option key={d.id} value={d.id}>{d.fullName}</option>)}</select></div>
            </div>
            <div className="row">
              <div><label>Termly fee (£)</label><input type="number" step="0.01" value={edit.termlyFee} onChange={(e) => setEdit({ ...edit, termlyFee: e.target.value })} /></div>
              <div><label>Cut-off</label><input value={edit.cutoffTime} onChange={(e) => setEdit({ ...edit, cutoffTime: e.target.value })} /></div>
            </div>
            <label className="chip" style={{ marginTop: 10, display: "inline-flex" }}><input type="checkbox" style={{ width: "auto" }} checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            <div style={{ marginTop: 12 }}><button onClick={saveEdit}>Save route</button></div>
          </div>
        </div>
      )}
    </div>
  );
}

export function Profiles({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [q, setQ] = useState("");
  const [fRoute, setFRoute] = useState("");
  const [bulk, setBulk] = useState<null | { routeId: string }>(null);
  const sel = useSel();
  const load = useCallback(async () => {
    setStudents((await fetch(`/api/schools/${schoolId}/transport/students`).then((r) => r.json())).students ?? []);
    setRoutes((await fetch(`/api/schools/${schoolId}/routes`).then((r) => r.json())).routes ?? []);
    sel.clear();
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const routeName = (id?: string | null) => routes.find((r) => r.id === id)?.name || null;
  async function assignOne(studentId: string, routeId: string | null) {
    await fetch(`/api/schools/${schoolId}/transport/profiles/${studentId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routeId: routeId || null }) });
  }
  async function assignMany(routeId: string | null) {
    for (const id of sel.ids) await assignOne(id, routeId);
    setBulk(null); setMsg(`${sel.ids.length} pupil(s) ${routeId ? "assigned to " + (routeName(routeId) || "route") : "cleared"}.`); setTimeout(() => setMsg(""), 2500); load();
  }
  async function quickAssign(studentId: string, routeId: string | null) { await assignOne(studentId, routeId); setMsg("Saved."); setTimeout(() => setMsg(""), 1500); load(); }

  const rows = students.filter((s) => {
    const t = q.trim().toLowerCase();
    if (t && ![s.firstName, s.lastName, s.reference, s.className, s.yearGroup].some((f) => String(f ?? "").toLowerCase().includes(t))) return false;
    if (fRoute === "none" && s.routeId) return false;
    if (fRoute && fRoute !== "none" && s.routeId !== fRoute) return false;
    return true;
  });
  const allOn = rows.length > 0 && rows.every((s) => sel.on(s.id));

  return (
    <div className="panel">
      <div className="flex-between" style={{ alignItems: "flex-start" }}>
        <div><h2 style={{ margin: 0 }}>Student transport profiles</h2>
          <p className="sub" style={{ marginBottom: 0 }}>Assign pupils to a route — one at a time via the ⋯ menu, or select several and assign them together.</p></div>
        <button disabled={sel.ids.length === 0} onClick={() => setBulk({ routeId: routes[0]?.id || "" })}>Assign route to selected</button>
      </div>
      {msg && <div className="notice ok" style={{ marginTop: 10 }}>{msg}</div>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
        <input placeholder="Search pupils…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
        <select value={fRoute} onChange={(e) => setFRoute(e.target.value)} style={{ width: "auto" }}><option value="">All routes</option><option value="none">Unassigned</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
        {(q || fRoute) && <button className="secondary small" onClick={() => { setQ(""); setFRoute(""); }}>Clear</button>}
        <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{rows.length === students.length ? `${students.length} pupils` : `${rows.length} of ${students.length}`}</span>
      </div>

      {sel.ids.length > 0 && (
        <div className="bulkbar">
          <span>{sel.ids.length} selected</span>
          <button className="small" onClick={() => setBulk({ routeId: routes[0]?.id || "" })}>Assign route</button>
          <button className="danger small" onClick={() => { if (confirm(`Clear the route for ${sel.ids.length} pupil(s)?`)) assignMany(null); }}>Clear route</button>
          <button className="secondary small" onClick={() => sel.clear()}>Clear selection</button>
        </div>
      )}

      <table><thead><tr>
        <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(rows.map((s) => s.id), e.target.checked)} aria-label="Select all" /></th>
        <th>Student</th><th>Year</th><th>Class</th><th>Assigned route</th><th className="right">Actions</th></tr></thead><tbody>
        {rows.map((s) => (
          <tr key={s.id}>
            <td className="checkbox-cell"><input type="checkbox" checked={sel.on(s.id)} onChange={() => sel.toggle(s.id)} aria-label={`Select ${s.firstName} ${s.lastName}`} /></td>
            <td><strong>{s.firstName} {s.lastName}</strong> {s.medicalAlert && <span className="badge suspended">Med</span>}<div className="mono muted" style={{ fontSize: 11 }}>{s.reference}</div></td>
            <td className="muted">{s.yearGroup || "—"}</td><td className="muted">{s.className || "—"}</td>
            <td>{routeName(s.routeId) ? <span className="badge active">{routeName(s.routeId)}</span> : <span className="muted">— none —</span>}</td>
            <td className="right"><Kebab items={[
              ...routes.map((r) => ({ label: `Assign: ${r.name}`, onClick: () => quickAssign(s.id, r.id) })),
              s.routeId ? { label: "Clear route", danger: true, onClick: () => quickAssign(s.id, null) } : null,
            ]} /></td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={6} className="muted">{students.length ? "No pupils match your filter." : "No students."}</td></tr>}
      </tbody></table>

      {bulk && (
        <div className="modal-overlay" onClick={() => setBulk(null)}>
          <div className="modal" style={{ maxWidth: 460, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Assign route</h2><button className="secondary small" onClick={() => setBulk(null)}>Close</button></div>
            <p className="sub">Assign <strong>{sel.ids.length}</strong> selected pupil(s) to a route.</p>
            <label>Route</label>
            <select value={bulk.routeId} onChange={(e) => setBulk({ routeId: e.target.value })}>{routes.length === 0 ? <option value="">No routes yet</option> : routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
              <button disabled={!bulk.routeId} onClick={() => assignMany(bulk.routeId)}>Assign to {sel.ids.length} pupil(s)</button>
              <button className="secondary" onClick={() => setBulk(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const FEE_STATUS: [string, string][] = [["none", "Not invoiced"], ["invoiced", "Invoiced"], ["paid", "Paid"], ["waived", "Waived"]];
const feeBadge = (s: string) => s === "paid" ? "active" : s === "invoiced" ? "trial" : s === "waived" ? "archived" : "suspended";
export function Fees({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => setData(await fetch(`/api/schools/${schoolId}/transport/fees`).then((r) => r.json())), [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function setStatus(studentId: string, feeStatus: string) {
    await fetch(`/api/schools/${schoolId}/transport/fees`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId, feeStatus }) });
    load();
  }
  if (!data) return <div className="panel">Loading…</div>;
  const t = data.totals || {};
  const money = (n: number) => `£${Number(n || 0).toFixed(2)}`;
  return (
    <div className="panel">
      <h2>Transport fees &amp; cost</h2>
      <p className="sub">Termly cost per pupil comes from their assigned route&apos;s fee. Track who&apos;s been invoiced and who has paid. (Recording only — no payment is taken here.)</p>
      <div className="stat-grid" style={{ marginTop: 6 }}>
        <div className="stat"><div className="n">{money(t.expected)}</div><div className="l">Expected this term</div></div>
        <div className="stat"><div className="n" style={{ color: "var(--ok)" }}>{money(t.collected)}</div><div className="l">Paid</div></div>
        <div className="stat"><div className="n">{money(t.invoiced)}</div><div className="l">Invoiced, awaiting</div></div>
        <div className="stat"><div className="n" style={{ color: t.outstanding ? "var(--danger)" : undefined }}>{money(t.outstanding)}</div><div className="l">Outstanding</div></div>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Pupil</th><th>Year</th><th>Route</th><th>Termly fee</th><th>Status</th></tr></thead>
        <tbody>
          {data.rows.map((r: any) => (
            <tr key={r.studentId}>
              <td>{r.name}</td><td>{r.yearGroup || "—"}</td><td>{r.routeName}</td><td>{r.fee ? money(r.fee) : <span className="muted">— (no fee set)</span>}</td>
              <td>
                <span className={`badge ${feeBadge(r.feeStatus)}`} style={{ marginRight: 8 }}>{FEE_STATUS.find(([k]) => k === r.feeStatus)?.[1] || r.feeStatus}</span>
                <select value={r.feeStatus} onChange={(e) => setStatus(r.studentId, e.target.value)} style={{ width: "auto", display: "inline-block" }}>{FEE_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              </td>
            </tr>
          ))}
          {data.rows.length === 0 && <tr><td colSpan={5} className="muted">No pupils are assigned to a route yet. Assign routes under Student profiles, and set a termly fee on each route.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

export function Requests({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => setRows((await fetch(`/api/schools/${schoolId}/transport/requests`).then((r) => r.json())).requests ?? []), [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function decide(id: string, status: string) { await fetch(`/api/schools/${schoolId}/transport/requests/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); load(); }
  return (
    <div className="panel"><h2>Parent transport requests</h2>
      <table><thead><tr><th>When</th><th>Student</th><th>Type</th><th>Date</th><th>Status</th><th className="right"></th></tr></thead><tbody>
        {rows.map((r) => (
          <tr key={r.id}><td className="mono muted">{new Date(r.createdAt).toLocaleString()}</td><td>{r.student.firstName} {r.student.lastName}</td><td>{r.type}{r.session !== "day" ? ` (${r.session})` : ""}</td><td>{r.date}</td>
            <td><span className={`badge ${r.status === "approved" || r.status === "auto" ? "active" : r.status === "rejected" ? "suspended" : "trial"}`}>{r.status}</span></td>
            <td className="right">{r.status === "pending" && <><button className="small" onClick={() => decide(r.id, "approved")}>Approve</button> <button className="danger small" onClick={() => decide(r.id, "rejected")}>Reject</button></>}</td></tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={6} className="muted">No requests.</td></tr>}
      </tbody></table>
    </div>
  );
}

const ENQ_STATUS: [string, string][] = [["open", "Open"], ["in_progress", "In progress"], ["resolved", "Resolved"]];
const enqBadge = (s: string) => s === "resolved" ? "active" : s === "in_progress" ? "trial" : "suspended";
export function Enquiries({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [f, setF] = useState({ name: "", contact: "", studentId: "", subject: "", message: "" });
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    setRows((await fetch(`/api/schools/${schoolId}/transport/enquiries`).then((r) => r.json())).enquiries ?? []);
    setStudents((await fetch(`/api/schools/${schoolId}/transport/students`).then((r) => r.json())).students ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/transport/enquiries`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, studentId: f.studentId || null }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setF({ name: "", contact: "", studentId: "", subject: "", message: "" }); setShowForm(false); load();
  }
  async function setStatus(id: string, status: string) { await fetch(`/api/schools/${schoolId}/transport/enquiries/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); load(); }
  async function del(id: string) { await fetch(`/api/schools/${schoolId}/transport/enquiries/${id}`, { method: "DELETE" }); load(); }
  const studentName = (id: string) => { const s = students.find((x) => x.id === id); return s ? `${s.firstName} ${s.lastName}` : ""; };
  return (
    <div className="panel">
      <div className="flex-between"><div><h2>Transport enquiries</h2><p className="sub" style={{ marginBottom: 0 }}>General questions, eligibility checks and complaints about the transport service.</p></div>
        <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "Log enquiry"}</button></div>
      {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
      {showForm && (
        <form onSubmit={add} style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
          <div className="row">
            <div><label>From (name)</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div><label>Contact (email / phone)</label><input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></div>
            <div><label>Pupil (optional)</label><select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></div>
          </div>
          <label>Subject</label><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required />
          <label>Message</label><input value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <button type="submit" style={{ marginTop: 12 }}>Log enquiry</button>
        </form>
      )}
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>When</th><th>From</th><th>Subject</th><th>Pupil</th><th>Status</th><th className="right"></th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="mono muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{new Date(r.createdAt).toLocaleDateString()}</td>
              <td>{r.name}{r.contact ? <div className="muted" style={{ fontSize: 11 }}>{r.contact}</div> : null}</td>
              <td>{r.subject}{r.message ? <div className="muted" style={{ fontSize: 11 }}>{r.message}</div> : null}</td>
              <td>{r.studentId ? studentName(r.studentId) : <span className="muted">—</span>}</td>
              <td><span className={`badge ${enqBadge(r.status)}`} style={{ marginRight: 8 }}>{ENQ_STATUS.find(([k]) => k === r.status)?.[1] || r.status}</span>
                <select value={r.status} onChange={(e) => setStatus(r.id, e.target.value)} style={{ width: "auto", display: "inline-block" }}>{ENQ_STATUS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
              <td className="right"><button className="danger small" onClick={() => del(r.id)}>Delete</button></td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">No enquiries logged.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// Self-contained live map: projects the driver's GPS trail + geocoded route
// stops into an SVG (no map tiles, no API key). Shows the current position, the
// recent trail, stops, and a keyless "open in OpenStreetMap" link.
export function LiveMap({ track }: { track: any }) {
  const stops: any[] = track.stops || [];
  const trail: any[] = track.trail || [];
  const last = track.last;
  const pts = [...stops.map((s) => ({ lat: s.lat, lng: s.lng })), ...trail.map((t) => ({ lat: t.lat, lng: t.lng }))].filter((p) => p.lat != null && p.lng != null);
  const W = 620, H = 300, PAD = 26;
  const ageMin = last ? Math.round((Date.now() - new Date(last.at).getTime()) / 60000) : null;

  if (pts.length === 0) {
    return (
      <div style={{ padding: "6px 2px" }}>
        <p className="muted" style={{ margin: 0 }}>No GPS positions yet. Ask the driver to tap <strong>Share live location</strong> in the driver app once the journey has started{stops.length === 0 ? ", and add coordinates to the route stops to show them here." : "."}</p>
      </div>
    );
  }
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  if (maxLat - minLat < 0.002) { minLat -= 0.001; maxLat += 0.001; }
  if (maxLng - minLng < 0.002) { minLng -= 0.001; maxLng += 0.001; }
  const x = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * PAD);
  const y = (lat: number) => PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * PAD);
  const trailPath = trail.filter((t) => t.lat != null).map((t, i) => `${i === 0 ? "M" : "L"}${x(t.lng).toFixed(1)},${y(t.lat).toFixed(1)}`).join(" ");

  return (
    <div style={{ padding: "6px 2px" }}>
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <div className="muted" style={{ fontSize: 12 }}>
          {track.journey?.vehicle || "Vehicle"} · <span className={`badge ${track.sharing ? "active" : "archived"}`}>{track.sharing ? "live" : "not sharing"}</span>
          {last ? ` · last fix ${ageMin === 0 ? "just now" : `${ageMin} min ago`}` : " · awaiting first fix"}
          {track.journey?.delayMinutes ? ` · running +${track.journey.delayMinutes}m` : ""}
        </div>
        {last && <a className="linklike" style={{ fontSize: 12 }} href={`https://www.openstreetmap.org/?mlat=${last.lat}&mlon=${last.lng}#map=16/${last.lat}/${last.lng}`} target="_blank" rel="noreferrer">Open in OpenStreetMap ↗</a>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", background: "#eef4ff", border: "1px solid var(--line)", borderRadius: 10 }}>
        {trailPath && <path d={trailPath} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" />}
        {stops.map((s, i) => (
          <g key={i}>
            <circle cx={x(s.lng)} cy={y(s.lat)} r={5} fill={s.kind === "school" ? "#12a150" : "#4f46e5"} />
            <text x={x(s.lng) + 8} y={y(s.lat) + 4} fontSize={11} fill="#334155">{s.name}{s.plannedArrival ? ` (${s.plannedArrival})` : ""}</text>
          </g>
        ))}
        {last && (
          <g>
            <circle cx={x(last.lng)} cy={y(last.lat)} r={11} fill="#e11d48" opacity={0.18} />
            <circle cx={x(last.lng)} cy={y(last.lat)} r={6} fill="#e11d48" stroke="#fff" strokeWidth={2} />
            <text x={x(last.lng) + 9} y={y(last.lat) - 8} fontSize={12} fontWeight={700} fill="#e11d48">🚌</text>
          </g>
        )}
      </svg>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Live map updates every 10 seconds while open. Positions come from the driver&apos;s device — no external tracking provider is used.</p>
    </div>
  );
}

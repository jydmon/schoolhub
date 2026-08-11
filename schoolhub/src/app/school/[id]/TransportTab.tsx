"use client";

import { useEffect, useState, useCallback } from "react";

export default function TransportTab({ schoolId }: { schoolId: string }) {
  const [sub, setSub] = useState<"control" | "routes" | "vehicles" | "profiles" | "requests">("control");
  return (
    <>
      <div className="tabs">
        {([["control", "Control centre"], ["routes", "Routes"], ["vehicles", "Vehicles"], ["profiles", "Student profiles"], ["requests", "Requests"]] as [any, string][]).map(([k, l]) => (
          <button key={k} className={sub === k ? "active" : ""} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === "control" && <Control schoolId={schoolId} />}
      {sub === "routes" && <Routes schoolId={schoolId} />}
      {sub === "vehicles" && <Vehicles schoolId={schoolId} />}
      {sub === "profiles" && <Profiles schoolId={schoolId} />}
      {sub === "requests" && <Requests schoolId={schoolId} />}
    </>
  );
}

function Control({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => { setData(await fetch(`/api/schools/${schoolId}/transport/journeys`).then((r) => r.json())); }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function gen(session: string) {
    const r = await fetch(`/api/schools/${schoolId}/transport/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session }) }).then((x) => x.json());
    setMsg(`Generated ${r.created ?? 0} ${session.toUpperCase()} journey(s).`); load();
  }
  if (!data) return <div className="panel">Loading…</div>;
  return (
    <>
      <div className="panel">
        <div className="flex-between"><div><h2>Transport control centre</h2><p className="sub" style={{ marginBottom: 0 }}>{data.date}</p></div>
          <div><button className="secondary" onClick={() => gen("am")}>Generate AM</button> <button className="secondary" onClick={() => gen("pm")}>Generate PM</button></div></div>
        {msg && <div className="notice ok" style={{ marginTop: 10 }}>{msg}</div>}
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Route</th><th>Session</th><th>Status</th><th>Onboard</th><th>Dropped</th><th>Absent</th><th>Delay</th></tr></thead>
          <tbody>
            {data.journeys.map((j: any) => (
              <tr key={j.id}><td>{j.routeName}<div className="muted" style={{ fontSize: 11 }}>{j.vehicle || "—"}</div></td><td>{j.session.toUpperCase()}</td>
                <td><span className={`badge ${j.status === "completed" ? "active" : j.status === "cancelled" ? "suspended" : "trial"}`}>{j.status}</span></td>
                <td>{j.onboard}</td><td>{j.droppedOff}</td><td>{j.absent}</td><td>{j.delayMinutes ? `+${j.delayMinutes}m` : "—"}</td></tr>
            ))}
            {data.journeys.length === 0 && <tr><td colSpan={7} className="muted">No journeys today — generate AM/PM.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel"><h2>Recent incidents</h2>
        {data.incidents.length === 0 ? <p className="muted">None.</p> : <ul style={{ paddingLeft: 18, margin: 0 }}>{data.incidents.map((i: any) => <li key={i.id}>{new Date(i.at).toLocaleString()} — {i.type}{i.notes ? `: ${i.notes}` : ""}</li>)}</ul>}
      </div>
    </>
  );
}

function Vehicles({ schoolId }: { schoolId: string }) {
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

function Routes({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);
  const [f, setF] = useState({ name: "", type: "fixed", cutoffTime: "07:00", vehicleId: "", driverUserId: "", stops: "Green Lane|pickup|07:30\nMill Road|shared|07:40\nSchool|school|08:30" });
  const load = useCallback(async () => {
    setRows((await fetch(`/api/schools/${schoolId}/routes`).then((r) => r.json())).routes ?? []);
    setVehicles((await fetch(`/api/schools/${schoolId}/vehicles`).then((r) => r.json())).vehicles ?? []);
    const users = (await fetch(`/api/schools/${schoolId}/users`).then((r) => r.json())).users ?? [];
    setDrivers(users.filter((u: any) => u.role === "Driver"));
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    const stops = f.stops.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [name, kind, plannedArrival] = l.split("|").map((x) => x.trim()); return { name, kind: kind || "pickup", plannedArrival }; });
    await fetch(`/api/schools/${schoolId}/routes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: f.name, type: f.type, cutoffTime: f.cutoffTime, vehicleId: f.vehicleId || null, driverUserId: f.driverUserId || null, stops }) });
    setF({ ...f, name: "" }); load();
  }
  return (
    <div className="panel"><h2>Routes</h2>
      <table><thead><tr><th>Name</th><th>Type</th><th>Vehicle</th><th>Stops</th><th>Students</th><th>Cut-off</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.id}><td>{r.name}</td><td>{r.type}</td><td>{r.vehicle ? (r.vehicle.label || r.vehicle.reference) : "—"}</td><td>{r.stops.length}</td><td>{r._count.profiles}</td><td>{r.cutoffTime}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={6} className="muted">No routes.</td></tr>}
      </tbody></table>
      <form onSubmit={add} style={{ marginTop: 12 }}>
        <div className="row">
          <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}><option>fixed</option><option>flexible</option></select></div>
          <div><label>Vehicle</label><select value={f.vehicleId} onChange={(e) => setF({ ...f, vehicleId: e.target.value })}><option value="">—</option>{vehicles.map((v) => <option key={v.id} value={v.id}>{v.label || v.reference}</option>)}</select></div>
          <div><label>Driver</label><select value={f.driverUserId} onChange={(e) => setF({ ...f, driverUserId: e.target.value })}><option value="">—</option>{drivers.map((d) => <option key={d.user.id} value={d.user.id}>{d.user.fullName}</option>)}</select></div>
          <div><label>Cut-off</label><input value={f.cutoffTime} onChange={(e) => setF({ ...f, cutoffTime: e.target.value })} /></div>
        </div>
        <label>Stops (one per line: Name|kind|HH:MM)</label>
        <textarea rows={4} value={f.stops} onChange={(e) => setF({ ...f, stops: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12 }} />
        <button style={{ marginTop: 10 }}>Add route</button>
      </form>
    </div>
  );
}

function Profiles({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<any[]>([]);
  const [routes, setRoutes] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const load = useCallback(async () => {
    setStudents((await fetch(`/api/schools/${schoolId}/students`).then((r) => r.json())).students ?? []);
    setRoutes((await fetch(`/api/schools/${schoolId}/routes`).then((r) => r.json())).routes ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function assign(studentId: string, routeId: string) {
    await fetch(`/api/schools/${schoolId}/transport/profiles/${studentId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ routeId: routeId || null }) });
    setMsg("Saved."); setTimeout(() => setMsg(""), 1500);
  }
  return (
    <div className="panel"><h2>Student transport profiles</h2><p className="sub">Assign each student to a route. (Stops, days and accessibility are set via the API/profile.)</p>
      {msg && <div className="notice ok">{msg}</div>}
      <table><thead><tr><th>Student</th><th>Year</th><th>Assigned route</th></tr></thead><tbody>
        {students.map((s) => (
          <tr key={s.id}><td>{s.firstName} {s.lastName}</td><td>{s.yearGroup || "—"}</td>
            <td><select defaultValue="" onChange={(e) => assign(s.id, e.target.value)} style={{ width: "auto", display: "inline-block" }}><option value="">— none —</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></td></tr>
        ))}
        {students.length === 0 && <tr><td colSpan={3} className="muted">No students.</td></tr>}
      </tbody></table>
    </div>
  );
}

function Requests({ schoolId }: { schoolId: string }) {
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

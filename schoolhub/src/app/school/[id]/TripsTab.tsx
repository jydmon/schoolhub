"use client";

import { useEffect, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";

const UPDATE_TYPES: [string, string][] = [
  ["students_assembled", "Students assembled"], ["all_accounted", "All accounted for"], ["coach_departed", "Coach departed"],
  ["arrived_safely", "Arrived safely"], ["activity_started", "Activity started"], ["lunch_completed", "Lunch completed"],
  ["activity_completed", "Activity completed"], ["leaving_venue", "Leaving venue"], ["running_late", "Running late"],
  ["coach_issue", "Coach issue"], ["return_started", "Return started"], ["returned", "Returned to school"],
];
const RESIDENTIAL_UPDATES: [string, string][] = [
  ["arrival_accommodation", "Arrived at accommodation"], ["welfare_check", "Daily welfare check"], ["evening_update", "Evening update"],
  ["departure_home", "Departed for home"], ["return_eta", "Return ETA update"], ["emergency_update", "Emergency update"],
];

export default function TripsTab({ schoolId }: { schoolId: string }) {
  const [trips, setTrips] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [show, setShow] = useState(false);
  const [f, setF] = useState<any>({ title: "", date: "", destination: "", departureTime: "", returnTime: "", purpose: "", packingList: "", riskAssessmentRef: "", transportProvider: "", consentRequired: true, isResidential: false, endDate: "", accommodation: "", returnPlan: "" });

  const load = useCallback(async () => setTrips((await fetch(`/api/schools/${schoolId}/trips`).then((r) => r.json())).trips ?? []), [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/schools/${schoolId}/trips`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    setF({ ...f, title: "" }); setShow(false); load();
  }

  if (open) return <TripDetail schoolId={schoolId} tripId={open} onBack={() => { setOpen(null); load(); }} />;

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="trips" title="Import trips & events" hint="No system to integrate? Bulk-add trips/events from a CSV (dates YYYY-MM-DD). They arrive as planned; add live-update buttons per trip in the app." />
      <div className="panel">
        <div className="flex-between"><div><h2>School trips</h2><p className="sub" style={{ marginBottom: 0 }}>{trips.length} trip(s)</p></div><button onClick={() => setShow((v) => !v)}>{show ? "Close" : "New trip"}</button></div>
        {show && (
          <form onSubmit={create} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="row">
              <div style={{ flex: 2 }}><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
              <div><label>Date</label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} required /></div>
            </div>
            <div className="row">
              <div><label>Destination</label><input value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} /></div>
              <div><label>Departure time</label><input value={f.departureTime} onChange={(e) => setF({ ...f, departureTime: e.target.value })} placeholder="09:00" /></div>
              <div><label>Return time</label><input value={f.returnTime} onChange={(e) => setF({ ...f, returnTime: e.target.value })} placeholder="16:00" /></div>
            </div>
            <div className="row">
              <div><label>Transport provider</label><input value={f.transportProvider} onChange={(e) => setF({ ...f, transportProvider: e.target.value })} /></div>
              <div><label>Risk assessment ref</label><input value={f.riskAssessmentRef} onChange={(e) => setF({ ...f, riskAssessmentRef: e.target.value })} /></div>
            </div>
            <label>Purpose</label><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} />
            <label>Packing list</label><input value={f.packingList} onChange={(e) => setF({ ...f, packingList: e.target.value })} />
            <div className="chips" style={{ marginTop: 10 }}>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={f.consentRequired} onChange={(e) => setF({ ...f, consentRequired: e.target.checked })} /> Consent required</label>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={f.isResidential} onChange={(e) => setF({ ...f, isResidential: e.target.checked })} /> Residential / overnight</label>
            </div>
            {f.isResidential && (
              <div className="row" style={{ marginTop: 8 }}>
                <div><label>End date</label><input type="date" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></div>
                <div style={{ flex: 2 }}><label>Accommodation</label><input value={f.accommodation} onChange={(e) => setF({ ...f, accommodation: e.target.value })} /></div>
                <div style={{ flex: 2 }}><label>Return plan</label><input value={f.returnPlan} onChange={(e) => setF({ ...f, returnPlan: e.target.value })} /></div>
              </div>
            )}
            <button type="submit" style={{ marginTop: 12 }}>Create trip</button>
          </form>
        )}
      </div>
      <div className="panel">
        <table><thead><tr><th>Trip</th><th>Date</th><th>Students</th><th>Status</th><th className="right"></th></tr></thead><tbody>
          {trips.map((t) => (
            <tr key={t.id}><td><strong>{t.title}</strong><div className="muted" style={{ fontSize: 12 }}>{t.destination || ""}</div></td><td>{t.date}</td><td>{t._count.students}</td>
              <td><span className={`badge ${t.status === "completed" ? "active" : t.status === "active" ? "trial" : "archived"}`}>{t.status}</span></td>
              <td className="right"><button className="secondary small" onClick={() => setOpen(t.id)}>Open</button></td></tr>
          ))}
          {trips.length === 0 && <tr><td colSpan={5} className="muted">No trips yet.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}

function TripDetail({ schoolId, tripId, onBack }: { schoolId: string; tripId: string; onBack: () => void }) {
  const [trip, setTrip] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [staffSel, setStaffSel] = useState("");
  const [coach, setCoach] = useState<any>(null);
  const [msg, setMsg] = useState("");
  const [dayF, setDayF] = useState({ date: "", title: "", itinerary: "" });
  const [hcF, setHcF] = useState({ kind: "welfare", expected: 0, present: 0, note: "" });
  const [photoF, setPhotoF] = useState({ url: "", caption: "", sharedWithParents: true });

  const load = useCallback(async () => {
    const t = (await fetch(`/api/schools/${schoolId}/trips/${tripId}`).then((r) => r.json())).trip;
    setTrip(t);
    setStudents((await fetch(`/api/schools/${schoolId}/students`).then((r) => r.json())).students ?? []);
    setUsers((await fetch(`/api/schools/${schoolId}/users`).then((r) => r.json())).users ?? []);
  }, [schoolId, tripId]);
  useEffect(() => { load(); }, [load]);
  if (!trip) return <div className="panel">Loading…</div>;

  const onTrip = new Set(trip.students.map((s: any) => s.student.reference));
  async function allocate() {
    const studentIds = Object.entries(sel).filter(([, v]) => v).map(([k]) => k);
    await fetch(`/api/schools/${schoolId}/trips/${tripId}/allocate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentIds, staffIds: staffSel ? [staffSel] : [], leadTeacherUserId: staffSel || undefined }) });
    setSel({}); setStaffSel(""); load();
  }
  async function update(type: string) { await fetch(`/api/trips/${tripId}/update`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type }) }); load(); }
  async function addDay() { if (!dayF.date) return; await fetch(`/api/schools/${schoolId}/trips/${tripId}/days`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dayF) }); setDayF({ date: "", title: "", itinerary: "" }); load(); }
  async function addHeadcount() { await fetch(`/api/schools/${schoolId}/trips/${tripId}/headcount`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...hcF, expected: Number(hcF.expected), present: Number(hcF.present) }) }); setHcF({ ...hcF, note: "" }); load(); }
  async function addPhoto() { if (!photoF.url) return; await fetch(`/api/schools/${schoolId}/trips/${tripId}/photos`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(photoF) }); setPhotoF({ url: "", caption: "", sharedWithParents: true }); load(); }
  async function makeCoach() { const r = await fetch(`/api/schools/${schoolId}/trips/${tripId}/coach`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driverName: prompt("Coach driver name?") || "Coach driver", hours: 6 }) }).then((x) => x.json()); setCoach(r); }

  return (
    <>
      <button className="secondary small" onClick={onBack}>← All trips</button>
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="flex-between"><div><h2>{trip.title}</h2><div className="muted">{trip.date}{trip.destination ? ` · ${trip.destination}` : ""} · <span className="badge trial">{trip.status}</span></div></div></div>
        <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>{trip.departureTime && `Depart ${trip.departureTime}`}{trip.returnTime && ` · Return ${trip.returnTime}`}{trip.riskAssessmentRef && ` · RA ${trip.riskAssessmentRef}`}{trip.transportProvider && ` · ${trip.transportProvider}`}</div>
      </div>

      <div className="panel"><h2>Teacher updates</h2><p className="sub">One-tap updates notify parents and drive the trip timeline.</p>
        <div className="chips">{UPDATE_TYPES.map(([k, l]) => <button key={k} className="secondary small" onClick={() => update(k)}>{l}</button>)}</div>
        <div style={{ marginTop: 12 }}>{trip.updates.length === 0 ? <p className="muted">No updates yet.</p> : <ul style={{ paddingLeft: 18, margin: 0 }}>{trip.updates.map((u: any) => <li key={u.id}>{new Date(u.at).toLocaleTimeString()} — {u.type}</li>)}</ul>}</div>
      </div>

      {trip.isResidential && (
        <div className="panel" style={{ borderColor: "var(--brand)" }}>
          <h2>Residential trip</h2>
          <p className="sub">{trip.date} → {trip.endDate || "?"}{trip.accommodation ? ` · ${trip.accommodation}` : ""}{trip.returnPlan ? ` · Return: ${trip.returnPlan}` : ""}</p>
          <div className="chips" style={{ marginBottom: 12 }}>{RESIDENTIAL_UPDATES.map(([k, l]) => <button key={k} className="secondary small" onClick={() => update(k)}>{l}</button>)}</div>

          <div className="row" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 style={{ fontSize: 15 }}>Daily itinerary</h2>
              {(trip.days || []).map((d: any) => <div key={d.id}><strong>{d.date}</strong> {d.title || ""}<div className="muted" style={{ fontSize: 12 }}>{d.itinerary || ""}</div></div>)}
              <div className="row" style={{ marginTop: 8 }}><div><label>Date</label><input type="date" value={dayF.date} onChange={(e) => setDayF({ ...dayF, date: e.target.value })} /></div><div style={{ flex: 2 }}><label>Title</label><input value={dayF.title} onChange={(e) => setDayF({ ...dayF, title: e.target.value })} /></div></div>
              <input placeholder="Itinerary" value={dayF.itinerary} onChange={(e) => setDayF({ ...dayF, itinerary: e.target.value })} style={{ marginTop: 6 }} />
              <button className="small" style={{ marginTop: 8 }} onClick={addDay}>Add day</button>
            </div>
            <div style={{ flex: 1, minWidth: 260 }}>
              <h2 style={{ fontSize: 15 }}>Headcount / welfare</h2>
              {(trip.headcounts || []).map((h: any) => <div key={h.id} className="muted" style={{ fontSize: 12 }}>{new Date(h.at).toLocaleString()} — {h.kind}: {h.present}/{h.expected}{h.note ? ` · ${h.note}` : ""}</div>)}
              <div className="row" style={{ marginTop: 8 }}>
                <div><label>Kind</label><select value={hcF.kind} onChange={(e) => setHcF({ ...hcF, kind: e.target.value })}><option>headcount</option><option>welfare</option><option>arrival</option><option>meal</option><option>evening</option><option>emergency</option></select></div>
                <div><label>Present</label><input type="number" value={hcF.present} onChange={(e) => setHcF({ ...hcF, present: e.target.value as any })} /></div>
                <div><label>Expected</label><input type="number" value={hcF.expected} onChange={(e) => setHcF({ ...hcF, expected: e.target.value as any })} /></div>
              </div>
              <button className="small" style={{ marginTop: 8 }} onClick={addHeadcount}>Record</button>
            </div>
          </div>
          <h2 style={{ fontSize: 15, marginTop: 16 }}>Photos {trip.photos?.length ? `(${trip.photos.length})` : ""}</h2>
          <p className="muted" style={{ fontSize: 12 }}>Only photos marked shared reach parents; confidential student info is never shared with other parents.</p>
          <div className="row"><div style={{ flex: 2 }}><input placeholder="Image URL" value={photoF.url} onChange={(e) => setPhotoF({ ...photoF, url: e.target.value })} /></div><div><input placeholder="Caption" value={photoF.caption} onChange={(e) => setPhotoF({ ...photoF, caption: e.target.value })} /></div>
            <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={photoF.sharedWithParents} onChange={(e) => setPhotoF({ ...photoF, sharedWithParents: e.target.checked })} /> Share with parents</label>
            <button className="small" onClick={addPhoto}>Add</button></div>
        </div>
      )}

      <div className="panel"><h2>Participants ({trip.students.length})</h2>
        <table><thead><tr><th>Student</th><th>Consent</th></tr></thead><tbody>
          {trip.students.map((s: any) => <tr key={s.id}><td>{s.student.firstName} {s.student.lastName} {s.student.medicalAlert && <span className="badge suspended">MED</span>}</td><td><span className={`badge ${s.consent === "given" ? "active" : s.consent === "declined" ? "suspended" : "trial"}`}>{s.consent}</span></td></tr>)}
          {trip.students.length === 0 && <tr><td colSpan={2} className="muted">No students yet.</td></tr>}
        </tbody></table>
        <h2 style={{ fontSize: 15, marginTop: 16 }}>Add participants</h2>
        <div className="chips" style={{ maxHeight: 160, overflow: "auto" }}>
          {students.filter((s) => !onTrip.has(s.reference)).map((s) => (
            <label key={s.id} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!sel[s.id]} onChange={(e) => setSel({ ...sel, [s.id]: e.target.checked })} /> {s.firstName} {s.lastName}</label>
          ))}
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <div><label>Lead teacher / staff</label><select value={staffSel} onChange={(e) => setStaffSel(e.target.value)}><option value="">—</option>{users.map((u) => <option key={u.user.id} value={u.user.id}>{u.user.fullName} ({u.role})</option>)}</select></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={allocate}>Allocate</button></div>
        </div>
      </div>

      <div className="panel"><h2>Hired coach access</h2><p className="sub">Issue a temporary, auto-expiring location-sharing link for a hired coach driver.</p>
        <button className="secondary" onClick={makeCoach}>Generate coach link</button>
        {coach?.shareUrl && <div className="notice info" style={{ marginTop: 10 }}>Link for <strong>{coach.driverName}</strong> (expires {new Date(coach.expiresAt).toLocaleString()}): <span className="mono">{coach.shareUrl}</span></div>}
      </div>
    </>
  );
}

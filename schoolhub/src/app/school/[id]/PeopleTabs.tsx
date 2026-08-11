"use client";

import { useEffect, useState, useCallback } from "react";

const RELATIONSHIPS = ["Mother", "Father", "Parent", "Guardian", "Carer", "Grandparent", "Step-parent", "Foster carer", "Other"];
const STAFF_ROLES = ["Teacher", "SchoolLeader", "TransportManager", "Driver", "SupportStaff", "SchoolAdministrator"];
const INFO_CATEGORIES = ["medical", "behaviour", "attendance", "safeguarding", "academic", "transport"];

function Msg({ m }: { m: { kind: string; text: string } | null }) {
  if (!m) return null;
  return <div className={`notice ${m.kind}`}>{m.text}</div>;
}

/* ============================ STUDENTS ============================ */
export function StudentsTab({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<any>({ reference: "", firstName: "", lastName: "", yearGroup: "", className: "", house: "", status: "enrolled", medicalAlert: false, sendIndicator: false, transportEligible: false });

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/students?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setStudents(d.students ?? []);
  }, [schoolId, q]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/students`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Student created." });
    setForm({ reference: "", firstName: "", lastName: "", yearGroup: "", className: "", house: "", status: "enrolled", medicalAlert: false, sendIndicator: false, transportEligible: false });
    setShowAdd(false); load();
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>Students</h2><p className="sub" style={{ marginBottom: 0 }}>{students.length} record(s)</p></div>
          <button onClick={() => setShowAdd((s) => !s)}>{showAdd ? "Close" : "Add student"}</button>
        </div>
        <div style={{ marginTop: 14 }}>
          <input placeholder="Search name or reference…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {showAdd && (
          <form onSubmit={add} style={{ marginTop: 16, borderTop: "1px solid var(--line)", paddingTop: 16 }}>
            <Msg m={msg} />
            <div className="row">
              <div><label>Student ID / reference</label><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
              <div><label>First name</label><input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required /></div>
              <div><label>Last name</label><input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} required /></div>
            </div>
            <div className="row">
              <div><label>Year group</label><input value={form.yearGroup} onChange={(e) => setForm({ ...form, yearGroup: e.target.value })} /></div>
              <div><label>Class</label><input value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} /></div>
              <div><label>House</label><input value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })} /></div>
              <div><label>Status</label>
                <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  <option>applicant</option><option>enrolled</option><option>leaver</option><option>archived</option>
                </select>
              </div>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.medicalAlert} onChange={(e) => setForm({ ...form, medicalAlert: e.target.checked })} /> Medical alert</label>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.sendIndicator} onChange={(e) => setForm({ ...form, sendIndicator: e.target.checked })} /> SEND</label>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.transportEligible} onChange={(e) => setForm({ ...form, transportEligible: e.target.checked })} /> Transport eligible</label>
            </div>
            <button type="submit" style={{ marginTop: 14 }}>Create student</button>
          </form>
        )}
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Ref</th><th>Name</th><th>Year / Class</th><th>Flags</th><th>Guardians</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.reference}</td>
                <td><strong>{s.firstName} {s.lastName}</strong>{s.preferredName && <span className="muted"> “{s.preferredName}”</span>}</td>
                <td>{s.yearGroup || "—"}{s.class?.name ? ` · ${s.class.name}` : ""}</td>
                <td>
                  {s.medicalAlert && <span className="badge suspended" title="Medical alert">MED</span>}{" "}
                  {s.sendIndicator && <span className="badge trial" title="SEND">SEND</span>}{" "}
                  {s.transportEligible && <span className="badge active" title="Transport eligible">TR</span>}
                </td>
                <td>{s._count?.guardianLinks ?? 0}</td>
                <td><span className={`badge ${s.status === "enrolled" ? "active" : s.status === "leaver" ? "archived" : "trial"}`}>{s.status}</span></td>
                <td className="right"><button className="secondary small" onClick={() => setSelected(selected === s.id ? null : s.id)}>{selected === s.id ? "Hide" : "Open"}</button></td>
              </tr>
            ))}
            {students.length === 0 && <tr><td colSpan={7} className="muted">No students. Add one above or use the Import tab.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && <StudentDetail schoolId={schoolId} studentId={selected} onChange={load} />}
    </>
  );
}

function StudentDetail({ schoolId, studentId, onChange }: { schoolId: string; studentId: string; onChange: () => void }) {
  const [s, setS] = useState<any>(null);
  const [g, setG] = useState({ email: "", fullName: "", relationship: "Parent", collectionAuthorised: true, isEmergencyContact: false });
  const [col, setCol] = useState({ name: "", relationship: "", phone: "" });
  const [ec, setEc] = useState({ name: "", relationship: "", phone: "", priority: 1 });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/students/${studentId}`).then((r) => r.json());
    setS(d.student);
  }, [schoolId, studentId]);
  useEffect(() => { load(); }, [load]);

  if (!s) return <div className="panel">Loading…</div>;
  const base = `/api/schools/${schoolId}/students/${studentId}`;

  async function post(url: string, body: any, okText: string) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setMsg(res.ok && !data.error ? { kind: "ok", text: okText } : { kind: "err", text: data.error || "Failed" });
    load(); onChange();
  }
  async function del(url: string) { await fetch(url, { method: "DELETE" }); load(); onChange(); }
  async function toggleFlag(field: string, val: boolean) {
    await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ [field]: val }) });
    load();
  }

  return (
    <div className="panel" style={{ borderColor: "var(--brand)" }}>
      <div className="flex-between">
        <div><h2 style={{ marginBottom: 2 }}>{s.firstName} {s.lastName} <span className="mono muted">{s.reference}</span></h2>
          <div className="muted">{s.yearGroup || "—"}{s.class?.name ? ` · ${s.class.name}` : ""}{s.house ? ` · ${s.house} house` : ""}{s.dateOfBirth ? ` · DOB ${new Date(s.dateOfBirth).toLocaleDateString()}` : ""}</div>
        </div>
      </div>
      <Msg m={msg} />

      <div className="chips" style={{ marginTop: 8 }}>
        {[["medicalAlert", "Medical alert"], ["sendIndicator", "SEND"], ["transportEligible", "Transport eligible"]].map(([f, label]) => (
          <label key={f} className="chip" style={{ margin: 0 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={!!s[f]} onChange={(e) => toggleFlag(f, e.target.checked)} /> {label}
          </label>
        ))}
      </div>

      <h2 style={{ fontSize: 15, marginTop: 20 }}>Parents &amp; guardians</h2>
      <table>
        <thead><tr><th>Name</th><th>Relationship</th><th>Flags</th><th>Notify</th><th></th></tr></thead>
        <tbody>
          {s.guardianLinks.map((l: any) => {
            const np = JSON.parse(l.notificationPrefs || "{}");
            const restr = JSON.parse(l.infoRestrictions || "[]");
            return (
              <tr key={l.id}>
                <td>{l.parent.fullName}<div className="mono muted">{l.parent.email}</div></td>
                <td>{l.relationship}{l.custodyArrangement ? ` · ${l.custodyArrangement}` : ""}</td>
                <td>
                  {l.isPrimaryContact && <span className="badge role">Primary</span>}{" "}
                  {l.isEmergencyContact && <span className="badge suspended">Emergency</span>}{" "}
                  {l.collectionAuthorised && <span className="badge active">Collect</span>}
                  {restr.length > 0 && <div className="muted" style={{ fontSize: 11 }}>restricted: {restr.join(", ")}</div>}
                </td>
                <td className="muted" style={{ fontSize: 12 }}>{Object.entries(np).filter(([, v]) => v).map(([k]) => k).join(", ") || "—"}</td>
                <td className="right"><button className="danger small" onClick={() => del(`${base}/guardians?linkId=${l.id}`)}>Unlink</button></td>
              </tr>
            );
          })}
          {s.guardianLinks.length === 0 && <tr><td colSpan={5} className="muted">No guardians linked.</td></tr>}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 10 }}>
        <div><label>Guardian email</label><input value={g.email} onChange={(e) => setG({ ...g, email: e.target.value })} /></div>
        <div><label>Full name</label><input value={g.fullName} onChange={(e) => setG({ ...g, fullName: e.target.value })} /></div>
        <div><label>Relationship</label><select value={g.relationship} onChange={(e) => setG({ ...g, relationship: e.target.value })}>{RELATIONSHIPS.map((r) => <option key={r}>{r}</option>)}</select></div>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={g.collectionAuthorised} onChange={(e) => setG({ ...g, collectionAuthorised: e.target.checked })} /> Collection authorised</label>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={g.isEmergencyContact} onChange={(e) => setG({ ...g, isEmergencyContact: e.target.checked })} /> Emergency contact</label>
        <button className="small" onClick={() => g.email && g.fullName && post(`${base}/guardians`, g, "Guardian linked.")}>Link guardian</button>
      </div>

      <div className="row" style={{ marginTop: 24 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15 }}>Approved collectors</h2>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {s.approvedCollectors.map((c: any) => (
              <li key={c.id} style={{ marginBottom: 4 }}>{c.name}{c.relationship ? ` (${c.relationship})` : ""}{c.phone ? ` · ${c.phone}` : ""}
                <button className="danger small" style={{ marginLeft: 8 }} onClick={() => del(`${base}/collectors?collectorId=${c.id}`)}>×</button></li>
            ))}
            {s.approvedCollectors.length === 0 && <li className="muted">None</li>}
          </ul>
          <div style={{ marginTop: 8 }}>
            <input placeholder="Name" value={col.name} onChange={(e) => setCol({ ...col, name: e.target.value })} style={{ marginBottom: 6 }} />
            <div className="row">
              <input placeholder="Relationship" value={col.relationship} onChange={(e) => setCol({ ...col, relationship: e.target.value })} />
              <input placeholder="Phone" value={col.phone} onChange={(e) => setCol({ ...col, phone: e.target.value })} />
            </div>
            <button className="small" style={{ marginTop: 8 }} onClick={() => col.name && post(`${base}/collectors`, col, "Collector added.")}>Add collector</button>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 15 }}>Emergency contacts</h2>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {s.emergencyContacts.map((c: any) => (
              <li key={c.id} style={{ marginBottom: 4 }}>#{c.priority} {c.name}{c.relationship ? ` (${c.relationship})` : ""}{c.phone ? ` · ${c.phone}` : ""}
                <button className="danger small" style={{ marginLeft: 8 }} onClick={() => del(`${base}/emergency-contacts?contactId=${c.id}`)}>×</button></li>
            ))}
            {s.emergencyContacts.length === 0 && <li className="muted">None</li>}
          </ul>
          <div style={{ marginTop: 8 }}>
            <input placeholder="Name" value={ec.name} onChange={(e) => setEc({ ...ec, name: e.target.value })} style={{ marginBottom: 6 }} />
            <div className="row">
              <input placeholder="Relationship" value={ec.relationship} onChange={(e) => setEc({ ...ec, relationship: e.target.value })} />
              <input placeholder="Phone" value={ec.phone} onChange={(e) => setEc({ ...ec, phone: e.target.value })} />
              <input type="number" min={1} max={9} value={ec.priority} onChange={(e) => setEc({ ...ec, priority: +e.target.value })} style={{ maxWidth: 70 }} />
            </div>
            <button className="small" style={{ marginTop: 8 }} onClick={() => ec.name && post(`${base}/emergency-contacts`, ec, "Emergency contact added.")}>Add contact</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ GUARDIANS ============================ */
export function GuardiansTab({ schoolId }: { schoolId: string }) {
  const [guardians, setGuardians] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/schools/${schoolId}/guardians`).then((r) => r.json()).then((d) => setGuardians(d.guardians ?? []));
  }, [schoolId]);
  return (
    <div className="panel">
      <h2>Parents &amp; guardians</h2>
      <p className="sub">One parent can link to several children; each link carries its own settings.</p>
      <table>
        <thead><tr><th>Name</th><th>Contact</th><th>Language</th><th>Linked children</th></tr></thead>
        <tbody>
          {guardians.map((g) => (
            <tr key={g.id}>
              <td>{g.fullName}<div className="mono muted">{g.email}</div></td>
              <td className="muted">{g.phone || "—"}{g.city ? ` · ${g.city}` : ""}</td>
              <td>{g.preferredLanguageLabel}</td>
              <td>{g.children.map((c: any) => (
                <div key={c.linkId}>
                  {c.student.firstName} {c.student.lastName} <span className="muted">({c.relationship}{c.isEmergencyContact ? ", emergency" : ""}{c.collectionAuthorised ? ", collect" : ""})</span>
                </div>
              ))}{g.children.length === 0 && <span className="muted">—</span>}</td>
            </tr>
          ))}
          {guardians.length === 0 && <tr><td colSpan={4} className="muted">No guardians yet.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ============================ STAFF ============================ */
export function StaffTab({ schoolId }: { schoolId: string }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState({ reference: "", fullName: "", email: "", role: "Teacher", jobTitle: "", department: "" });

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/staff`).then((r) => r.json());
    setStaff(d.staff ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/staff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Staff member saved." });
    setForm({ reference: "", fullName: "", email: "", role: "Teacher", jobTitle: "", department: "" }); load();
  }

  return (
    <>
      <div className="panel">
        <h2>Staff</h2><p className="sub">Employment profiles, roles, departments and the classes each member teaches.</p>
        <table>
          <thead><tr><th>Ref</th><th>Name</th><th>Roles</th><th>Job title</th><th>Department</th><th>Classes</th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td className="mono">{s.reference}</td>
                <td>{s.user.fullName}<div className="mono muted">{s.user.email}</div></td>
                <td>{s.roles.map((r: string) => <span key={r} className="badge role" style={{ marginRight: 4 }}>{r}</span>)}</td>
                <td>{s.jobTitle || "—"}</td>
                <td>{s.department || "—"}</td>
                <td>{s.classes.join(", ") || "—"}</td>
              </tr>
            ))}
            {staff.length === 0 && <tr><td colSpan={6} className="muted">No staff yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Add staff member</h2>
        <Msg m={msg} />
        <form onSubmit={add}>
          <div className="row">
            <div><label>Staff ID / reference</label><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
            <div><label>Full name</label><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
            <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          </div>
          <div className="row">
            <div><label>Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
            <div><label>Job title</label><input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
            <div><label>Department</label><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
          </div>
          <button type="submit" style={{ marginTop: 14 }}>Save staff member</button>
        </form>
      </div>
    </>
  );
}

/* ============================ IMPORT ============================ */
export function ImportTab({ schoolId }: { schoolId: string }) {
  const [type, setType] = useState("students");
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<any>(null);
  const [batches, setBatches] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/import`).then((r) => r.json());
    setBatches(d.batches ?? []);
  }, [schoolId]);
  useEffect(() => { loadHistory(); }, [loadHistory]);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(f);
  }

  async function run() {
    setBusy(true); setResult(null);
    const res = await fetch(`/api/schools/${schoolId}/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, csvText, filename: filename || undefined }),
    });
    const data = await res.json();
    setResult(data); setBusy(false); loadHistory();
  }

  return (
    <>
      <div className="panel">
        <h2>CSV import</h2>
        <p className="sub">Import students, parents, staff, messaging consent, vehicles, routes, calendar/timetable events, announcements, or pupil reports. Rows are validated and duplicates are detected; a per-row error report is produced.</p>
        <div className="row">
          <div>
            <label>Import type</label>
            <select value={type} onChange={(e) => { setType(e.target.value); setResult(null); }}>
              <option value="students">Students</option>
              <option value="parents">Parents / guardians</option>
              <option value="staff">Staff</option>
              <option value="messaging_consent">Messaging consent (SMS/WhatsApp opt-in)</option>
              <option value="vehicles">Vehicles (fleet)</option>
              <option value="routes">Transport routes</option>
              <option value="calendar_events">Calendar &amp; timetable events</option>
              <option value="announcements">Announcements</option>
              <option value="pupil_reports">Pupil reports</option>
              <option value="menus">Meals &amp; menus</option>
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <a href={`/api/schools/${schoolId}/import/template?type=${type}`}><button type="button" className="secondary">Download {type} template</button></a>
          </div>
        </div>
        <label style={{ marginTop: 14 }}>Upload a CSV file</label>
        <input type="file" accept=".csv,text/csv" onChange={onFile} />
        <label style={{ marginTop: 14 }}>…or paste CSV content</label>
        <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={8}
          style={{ width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}
          placeholder="reference,firstName,lastName,..." />
        <button style={{ marginTop: 14 }} disabled={!csvText || busy} onClick={run}>{busy ? "Importing…" : "Run import"}</button>

        {result && (
          <div style={{ marginTop: 16 }}>
            <div className={`notice ${result.status === "completed" ? "ok" : result.status === "failed" ? "err" : "info"}`}>
              {result.error
                ? result.error
                : `Import ${result.status}: ${result.createdRows} created, ${result.updatedRows} updated, ${result.skippedRows} skipped, ${result.errorRows} errored (of ${result.totalRows} rows).`}
            </div>
            {result.errors?.length > 0 && (
              <table>
                <thead><tr><th>Row</th><th>Field</th><th>Message</th><th>Type</th></tr></thead>
                <tbody>
                  {result.errors.map((e: any, i: number) => (
                    <tr key={i}><td>{e.row}</td><td>{e.field || "—"}</td><td>{e.message}</td><td>{e.fatal ? <span className="badge suspended">error</span> : <span className="badge trial">warning</span>}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Import history</h2>
        <table>
          <thead><tr><th>When</th><th>Type</th><th>File</th><th>Result</th><th>By</th></tr></thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id}>
                <td className="mono muted">{new Date(b.createdAt).toLocaleString()}</td>
                <td>{b.type}</td>
                <td>{b.filename || "—"}</td>
                <td><span className={`badge ${b.status === "completed" ? "active" : b.status === "failed" ? "suspended" : "trial"}`}>{b.status}</span> <span className="muted">+{b.createdRows}/~{b.updatedRows}/!{b.errorRows}</span></td>
                <td className="muted">{b.createdBy || "—"}</td>
              </tr>
            ))}
            {batches.length === 0 && <tr><td colSpan={5} className="muted">No imports yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

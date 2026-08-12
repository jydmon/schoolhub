"use client";

import { useEffect, useState, useCallback } from "react";
import { useSort, SortTh } from "./EntityKit";

const RELATIONSHIPS = ["Mother", "Father", "Parent", "Guardian", "Carer", "Grandparent", "Step-parent", "Foster carer", "Other"];
const STAFF_ROLES = ["Teacher", "SchoolLeader", "TransportManager", "Driver", "SupportStaff", "SchoolAdministrator"];
const INFO_CATEGORIES = ["medical", "behaviour", "attendance", "safeguarding", "academic", "transport"];

function Msg({ m }: { m: { kind: string; text: string } | null }) {
  if (!m) return null;
  return <div className={`notice ${m.kind}`}>{m.text}</div>;
}

/* ---- shared people toolkit: avatar, bulk-select, kebab menu, modal ---- */
function initials(name: string): string {
  return (name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || "").join("") || "?";
}
function Avatar({ url, name, size = 34 }: { url?: string | null; name: string; size?: number }) {
  if (url) return <img src={url} alt={name} width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />;
  return <span style={{ width: size, height: size, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#0ea5e9)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: size * 0.4, fontWeight: 700, flex: "0 0 auto" }}>{initials(name)}</span>;
}
function useSel() {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const ids = Object.keys(sel).filter((k) => sel[k]);
  return {
    ids, on: (id: string) => !!sel[id],
    toggle: (id: string) => setSel((p) => ({ ...p, [id]: !p[id] })),
    setMany: (list: string[], v: boolean) => setSel(v ? Object.fromEntries(list.map((i) => [i, true])) : {}),
    clear: () => setSel({}),
  };
}
function Kebab({ items }: { items: ({ label: string; onClick: () => void; danger?: boolean } | null)[] }) {
  const [open, setOpen] = useState(false);
  const list = items.filter(Boolean) as { label: string; onClick: () => void; danger?: boolean }[];
  return (
    <span className="kebab-wrap">
      <button className="kebab-btn" aria-label="Actions" onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (
        <>
          <div className="kebab-backdrop" onClick={() => setOpen(false)} />
          <div className="kebab-menu">
            {list.map((it, i) => <button key={i} className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}
          </div>
        </>
      )}
    </span>
  );
}
function PersonModal({ title, subtitle, avatar, onClose, tabs, active, onTab, children }: {
  title: React.ReactNode; subtitle?: React.ReactNode; avatar?: React.ReactNode; onClose: () => void;
  tabs?: string[]; active?: string; onTab?: (t: string) => void; children: React.ReactNode;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 860, width: "94%" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {avatar}
            <div><h2 style={{ margin: 0 }}>{title}</h2>{subtitle ? <div className="muted" style={{ fontSize: 13 }}>{subtitle}</div> : null}</div>
          </div>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>
        {tabs && (
          <div className="tabs" style={{ margin: "14px 0 6px" }}>
            {tabs.map((t) => <button key={t} className={active === t ? "active" : ""} onClick={() => onTab?.(t)}>{t}</button>)}
          </div>
        )}
        <div style={{ maxHeight: "68vh", overflow: "auto", paddingRight: 4 }}>{children}</div>
      </div>
    </div>
  );
}
const SOURCE_BADGE = (src?: string) => src === "api" ? <span className="badge role" title="From an integration — read-only">API</span> : src === "import" ? <span className="badge trial" title="Imported from CSV">imported</span> : <span className="muted" style={{ fontSize: 12 }}>manual</span>;

/* ============================ STUDENTS ============================ */
export function StudentsTab({ schoolId, focusId, onFocusHandled }: { schoolId: string; focusId?: string | null; onFocusHandled?: () => void }) {
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => { if (focusId) { setSelected(focusId); onFocusHandled?.(); } }, [focusId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [fStatus, setFStatus] = useState("");
  const [fYear, setFYear] = useState("");
  const [form, setForm] = useState<any>({ reference: "", firstName: "", lastName: "", yearGroup: "", className: "", house: "", status: "enrolled", medicalAlert: false, sendIndicator: false, transportEligible: false });
  const sel = useSel();
  const srt = useSort("name");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/students?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setStudents(d.students ?? []); sel.clear();
  }, [schoolId, q]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const years = Array.from(new Set(students.map((s) => s.yearGroup).filter(Boolean))).sort();
  const view = srt.sort(
    students.filter((s) => (!fStatus || s.status === fStatus) && (!fYear || s.yearGroup === fYear)),
    (s, k) => k === "name" ? `${s.lastName} ${s.firstName}`.toLowerCase() : k === "year" ? (s.yearGroup || "") : k === "guardians" ? (s._count?.guardianLinks ?? 0) : k === "status" ? s.status : "",
  );

  const editable = (s: any) => ((s.source ?? "manual") !== "api");
  async function setStatus(id: string, status: string): Promise<boolean> {
    const res = await fetch(`/api/schools/${schoolId}/students/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Update failed" }); return false; }
    return true;
  }
  async function rowStatus(s: any, status: string) { setMsg(null); if (await setStatus(s.id, status)) { setMsg({ kind: "ok", text: `${s.firstName} ${s.lastName} → ${status}.` }); load(); } }
  async function bulkArchive() {
    setMsg(null); let n = 0, skipped = 0;
    for (const id of sel.ids) { const s = students.find((x) => x.id === id); if (!editable(s)) { skipped++; continue; } if (await setStatus(id, "archived")) n++; }
    sel.clear(); load();
    setMsg({ kind: "ok", text: `Archived ${n} student${n === 1 ? "" : "s"}${skipped ? ` · ${skipped} API-fed skipped (read-only)` : ""}.` });
  }
  const allOn = view.length > 0 && view.every((s) => sel.on(s.id));

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
          <div><h2>Students</h2><p className="sub" style={{ marginBottom: 0 }}>{q || fStatus || fYear ? `${view.length} of ${students.length}` : `${students.length}`} record(s)</p></div>
          <button onClick={() => setShowAdd((s) => !s)}>{showAdd ? "Close" : "Add student"}</button>
        </div>
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input placeholder="Search name or reference…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 2, minWidth: 180 }} />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All statuses</option><option value="enrolled">Enrolled</option><option value="applicant">Applicant</option><option value="leaver">Leaver</option><option value="archived">Archived</option></select>
          <select value={fYear} onChange={(e) => setFYear(e.target.value)}><option value="">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
          {(fStatus || fYear) && <button className="secondary small" onClick={() => { setFStatus(""); setFYear(""); }}>Clear</button>}
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
        {msg && <Msg m={msg} />}
        {sel.ids.length > 0 && (
          <div className="bulkbar">
            <span>{sel.ids.length} selected</span>
            <button className="danger small" onClick={bulkArchive}>Archive</button>
            <button className="secondary small" onClick={() => sel.clear()}>Clear</button>
          </div>
        )}
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((s) => s.id), e.target.checked)} /></th>
            <SortTh k="name" label="Pupil" sort={srt} /><SortTh k="year" label="Year / Class" sort={srt} /><th>Flags</th><SortTh k="guardians" label="Guardians" sort={srt} /><SortTh k="status" label="Status" sort={srt} /><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((s) => (
              <tr key={s.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(s.id)} onChange={() => sel.toggle(s.id)} /></td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Avatar url={s.photoUrl} name={`${s.firstName} ${s.lastName}`} />
                    <span>
                      <button className="linklike" onClick={() => setSelected(s.id)}><strong>{s.firstName} {s.lastName}</strong></button>
                      {s.allergies ? <span className="badge suspended" title={`Allergies: ${s.allergies}`} style={{ marginLeft: 6 }}>ALG</span> : null}
                      <div className="mono muted" style={{ fontSize: 11 }}>{s.reference}</div>
                    </span>
                  </span>
                </td>
                <td>{s.yearGroup || "—"}{s.class?.name ? ` · ${s.class.name}` : ""}</td>
                <td>
                  {s.medicalAlert && <span className="badge suspended" title="Medical alert">MED</span>}{" "}
                  {s.sendIndicator && <span className="badge trial" title="SEND">SEND</span>}{" "}
                  {s.transportEligible && <span className="badge active" title="Transport eligible">TR</span>}
                </td>
                <td>{s._count?.guardianLinks ?? 0}</td>
                <td><span className={`badge ${s.status === "enrolled" ? "active" : s.status === "leaver" ? "archived" : "trial"}`}>{s.status}</span></td>
                <td>{SOURCE_BADGE(s.source)}</td>
                <td className="right">
                  <Kebab items={[
                    { label: "Open / expand", onClick: () => setSelected(s.id) },
                    editable(s) && s.status !== "archived" ? { label: "Archive", onClick: () => rowStatus(s, "archived"), danger: true } : null,
                    editable(s) && s.status !== "enrolled" ? { label: "Set enrolled", onClick: () => rowStatus(s, "enrolled") } : null,
                    editable(s) && s.status !== "leaver" ? { label: "Set leaver", onClick: () => rowStatus(s, "leaver") } : null,
                  ]} />
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={8} className="muted">{students.length ? "No students match your filters." : "No students. Add one above or use the Import tab."}</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && <StudentModal schoolId={schoolId} studentId={selected} onClose={() => setSelected(null)} onChange={load} />}
    </>
  );
}

function StudentModal({ schoolId, studentId, onClose, onChange }: { schoolId: string; studentId: string; onClose: () => void; onChange: () => void }) {
  const [s, setS] = useState<any>(null);
  const [tab, setTab] = useState("Overview");
  const [g, setG] = useState({ email: "", fullName: "", relationship: "Parent", collectionAuthorised: true, isEmergencyContact: false });
  const [col, setCol] = useState({ name: "", relationship: "", phone: "" });
  const [ec, setEc] = useState({ name: "", relationship: "", phone: "", priority: 1 });
  const [allergies, setAllergies] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/students/${studentId}`).then((r) => r.json());
    setS(d.student); setAllergies(d.student?.allergies || "");
  }, [schoolId, studentId]);
  useEffect(() => { load(); }, [load]);

  const base = `/api/schools/${schoolId}/students/${studentId}`;
  const readOnly = s && (s.source ?? "manual") === "api";
  async function post(url: string, body: any, okText: string) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    setMsg(res.ok && !data.error ? { kind: "ok", text: okText } : { kind: "err", text: data.error || "Failed" });
    load(); onChange();
  }
  async function del(url: string) { await fetch(url, { method: "DELETE" }); load(); onChange(); }
  async function patch(body: any, okText?: string) {
    const res = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed" }); return; }
    if (okText) setMsg({ kind: "ok", text: okText });
    load(); onChange();
  }

  if (!s) return <PersonModal title="Loading…" onClose={onClose}><div className="muted">Loading…</div></PersonModal>;

  return (
    <PersonModal
      title={<>{s.firstName} {s.lastName} <span className="mono muted" style={{ fontSize: 13 }}>{s.reference}</span></>}
      subtitle={<>{s.yearGroup || "—"}{s.class?.name ? ` · ${s.class.name}` : ""}{s.house ? ` · ${s.house} house` : ""}{s.dateOfBirth ? ` · DOB ${new Date(s.dateOfBirth).toLocaleDateString()}` : ""} · {SOURCE_BADGE(s.source)}</>}
      avatar={<Avatar url={s.photoUrl} name={`${s.firstName} ${s.lastName}`} size={54} />}
      onClose={onClose}
      tabs={["Overview", "Parents & guardians", "Safety & collection", "Transport", "Reports", "Behaviour"]}
      active={tab} onTab={setTab}
    >
      <Msg m={msg} />
      {readOnly && <div className="notice info" style={{ marginTop: 8 }}>This pupil is fed from an integration — records are read-only here.</div>}

      {tab === "Overview" && (
        <>
          <div className="chips" style={{ marginTop: 8 }}>
            {[["medicalAlert", "Medical alert"], ["sendIndicator", "SEND"], ["transportEligible", "Transport eligible"]].map(([f, label]) => (
              <label key={f} className="chip" style={{ margin: 0 }}>
                <input type="checkbox" style={{ width: "auto" }} disabled={readOnly} checked={!!s[f]} onChange={(e) => patch({ [f]: e.target.checked })} /> {label}
              </label>
            ))}
          </div>
          <label style={{ marginTop: 16 }}>Allergies <span className="muted" style={{ fontWeight: 400 }}>(school or parent flagged)</span></label>
          <div className="row">
            <div style={{ flex: 3 }}><input value={allergies} disabled={readOnly} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. peanuts, dairy" /></div>
            <div style={{ display: "flex", alignItems: "flex-end" }}><button disabled={readOnly} onClick={() => patch({ allergies }, "Allergies saved.")}>Save</button></div>
          </div>
          <label style={{ marginTop: 14 }}>Status</label>
          <select value={s.status} disabled={readOnly} onChange={(e) => patch({ status: e.target.value }, "Status updated.")} style={{ maxWidth: 220 }}>
            <option>applicant</option><option>enrolled</option><option>leaver</option><option>archived</option>
          </select>
        </>
      )}

      {tab === "Parents & guardians" && (
        <>
          <h2 style={{ fontSize: 15, marginTop: 14 }}>Parents &amp; guardians</h2>
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
        <button className="small" disabled={readOnly} onClick={() => g.email && g.fullName && post(`${base}/guardians`, g, "Guardian linked.")}>Link guardian</button>
      </div>
        </>
      )}

      {tab === "Safety & collection" && (
      <div className="row" style={{ marginTop: 14 }}>
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
      )}

      {tab === "Transport" && (
        <div style={{ marginTop: 14 }}>
          <p className="sub">Pick-up &amp; drop-off, route and stop for this pupil.</p>
          <p className="muted">Transport eligibility: {s.transportEligible ? "eligible" : "not eligible"}. Route/stop assignment and live pick-up/drop-off are managed in the <strong>Transport</strong> module and surface here once the transport build lands. (Read-only for API-fed pupils.)</p>
        </div>
      )}
      {tab === "Reports" && (
        <div style={{ marginTop: 14 }}>
          <p className="sub">This pupil&apos;s report cards.</p>
          <p className="muted">Individual reports (imported, API-fed or authored) appear under <strong>Pupils reports</strong>; released reports are visible to this pupil&apos;s parents. Per-pupil report history will list here in the next pass.</p>
        </div>
      )}
      {tab === "Behaviour" && (
        <div style={{ marginTop: 14 }}>
          <p className="sub">Rewards &amp; consequences for this pupil.</p>
          <p className="muted">Behaviour events (API-fed read-only, or manually logged) connect here and notify parents. The per-pupil behaviour timeline lands with the Behaviour build.</p>
        </div>
      )}
    </PersonModal>
  );
}

/* ============================ GUARDIANS ============================ */
export function GuardiansTab({ schoolId }: { schoolId: string }) {
  const [guardians, setGuardians] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const sel = useSel();
  const srt = useSort("name");
  const [inv, setInv] = useState<{ target: any; bulk: boolean } | null>(null);
  const [invCh, setInvCh] = useState<any>({ email: true, push: false, sms: false, whatsapp: false });
  const [invPw, setInvPw] = useState("");
  const [invBusy, setInvBusy] = useState(false);
  const [invRes, setInvRes] = useState<any[] | null>(null);
  const load = useCallback(() => { fetch(`/api/schools/${schoolId}/guardians`).then((r) => r.json()).then((d) => { setGuardians(d.guardians ?? []); sel.clear(); }); }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const rows = guardians.filter((g) => { const s = q.trim().toLowerCase(); if (!s) return true; return [g.fullName, g.email, g.phone, g.city].some((v) => String(v ?? "").toLowerCase().includes(s)); });
  const view = srt.sort(rows, (g, k) => k === "name" ? String(g.fullName ?? "").toLowerCase() : k === "children" ? g.children.length : "");
  const allOn = view.length > 0 && view.every((g) => sel.on(g.id));

  function openInvite(target: any, bulk = false) { setInv({ target, bulk }); setInvCh({ email: true, push: false, sms: false, whatsapp: false }); setInvPw(""); setInvRes(null); }
  function genPw() { const s = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnpqrstuvwxyz"; setInvPw("Tmp-" + Array.from({ length: 6 }, (_, i) => s[(i * 7 + 13) % s.length]).join("")); }
  async function sendInvite() {
    const channels = Object.entries(invCh).filter(([, v]) => v).map(([k]) => k);
    if (channels.length === 0) { setMsg({ kind: "err", text: "Choose at least one channel." }); return; }
    setInvBusy(true); setInvRes(null); setMsg(null);
    try {
      if (inv!.bulk) {
        const ids = [...sel.ids]; let sent = 0, fail = 0;
        for (const id of ids) { const res = await fetch(`/api/schools/${schoolId}/guardians/${id}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels }) }); const d = await res.json().catch(() => ({})); if (res.ok && (d.status === "invited" || d.status === "already_on_platform")) sent++; else fail++; }
        sel.clear(); setInv(null); load();
        setMsg({ kind: fail ? "err" : "ok", text: `Processed ${ids.length} parent(s) — ${sent} delivered/on-platform${fail ? `, ${fail} not delivered` : ""}.` });
      } else {
        const res = await fetch(`/api/schools/${schoolId}/guardians/${inv!.target.id}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels, tempPassword: invPw || undefined }) });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Invite failed" }); }
        else { setInvRes(d.results ?? []); if (d.status === "already_on_platform") setMsg({ kind: "ok", text: d.message }); load(); }
      }
    } finally { setInvBusy(false); }
  }
  return (
    <>
      <div className="panel">
        <div className="flex-between"><div><h2>Parents &amp; guardians</h2><p className="sub" style={{ marginBottom: 0 }}>{guardians.length} record(s). Click a name to open the full profile. One parent can link to several children.</p></div></div>
        {msg && <Msg m={msg} />}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "10px 0 12px" }}>
          <input placeholder="Filter parents…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <span className="muted" style={{ fontSize: 12 }}>{q ? `${rows.length} of ${guardians.length}` : `${guardians.length}`}</span>
        </div>
        {sel.ids.length > 0 && (
          <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="small" onClick={() => openInvite(null, true)}>Invite to platform</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>
        )}
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((g) => g.id), e.target.checked)} /></th>
            <SortTh k="name" label="Parent / guardian" sort={srt} /><th>Contact</th><th>Language</th><SortTh k="children" label="Children" sort={srt} /><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((g) => (
              <tr key={g.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(g.id)} onChange={() => sel.toggle(g.id)} /></td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Avatar url={g.photoUrl} name={g.fullName} />
                    <span><button className="linklike" onClick={() => setSelected(g.id)}><strong>{g.fullName}</strong></button><div className="mono muted" style={{ fontSize: 11 }}>{g.email}</div></span>
                  </span>
                </td>
                <td className="muted">{g.phone || "—"}{g.city ? ` · ${g.city}` : ""}</td>
                <td className="muted">{g.preferredLanguageLabel}</td>
                <td>{g.children.length === 0 ? <span className="muted">—</span> : g.children.map((c: any) => <div key={c.linkId} style={{ fontSize: 13 }}>{c.student.firstName} {c.student.lastName} <span className="muted">({c.relationship})</span></div>)}</td>
                <td>{SOURCE_BADGE(g.source)}</td>
                <td className="right"><Kebab items={[{ label: "Open / expand", onClick: () => setSelected(g.id) }, { label: "Invite to platform", onClick: () => openInvite(g, false) }]} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={7} className="muted">{guardians.length ? "No parents/guardians match your search." : "No parents/guardians yet. Add them from a pupil, or import."}</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && <GuardianModal schoolId={schoolId} guardianId={selected} onClose={() => setSelected(null)} onChange={load} />}
      {inv && (
        <div className="modal-overlay" onClick={() => setInv(null)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}>
              <div><h2 style={{ margin: 0 }}>Send invitation</h2><div className="muted" style={{ fontSize: 13 }}>{inv.bulk ? `${sel.ids.length} selected parent(s)` : `${inv.target?.fullName} · ${inv.target?.email}`}</div></div>
              <button className="secondary small" onClick={() => setInv(null)}>Close</button>
            </div>

            {!invRes ? (
              <>
                <p className="sub" style={{ marginTop: 10 }}>Are you sure you want to send this invitation? Choose how it should be delivered.</p>
                <label>Delivery channels</label>
                <div className="chips" style={{ marginTop: 4 }}>
                  {([["email", "Email"], ["push", "App notification"], ["sms", "SMS / text"], ["whatsapp", "WhatsApp"]] as [string, string][]).map(([k, l]) => (
                    <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!invCh[k]} onChange={(e) => setInvCh({ ...invCh, [k]: e.target.checked })} /> {l}</label>
                  ))}
                </div>
                {!inv.bulk && (
                  <div style={{ marginTop: 14 }}>
                    <label>Temporary password (optional)</label>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={invPw} onChange={(e) => setInvPw(e.target.value)} placeholder="Leave blank for activation-link only" style={{ flex: 1 }} />
                      <button type="button" className="secondary small" onClick={genPw}>Generate</button>
                    </div>
                    <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>If set, a not-yet-registered parent can sign in immediately with this password and will be prompted to change it. Ignored if they already have access. Share it securely — it isn&apos;t shown again.</p>
                  </div>
                )}
                <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                  <button disabled={invBusy} onClick={sendInvite}>{invBusy ? "Sending…" : "Send invitation"}</button>
                  <button className="secondary" onClick={() => setInv(null)}>Cancel</button>
                </div>
              </>
            ) : (
              <div style={{ marginTop: 12 }}>
                <p className="sub">Delivery result:</p>
                {invRes.length === 0 ? <p className="muted">Nothing to report.</p> : invRes.map((r, i) => (
                  <div key={i} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                    <span className={`badge ${r.status === "sent" ? "active" : r.status === "skipped" ? "archived" : "suspended"}`} style={{ textTransform: "capitalize" }}>{r.channel}: {r.status}</span>
                    <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{r.detail}</div>
                  </div>
                ))}
                {invPw && <div className="notice info" style={{ marginTop: 10 }}>Temporary password set. Share it securely with the parent: <span className="mono"><strong>{invPw}</strong></span></div>}
                <button style={{ marginTop: 12 }} onClick={() => setInv(null)}>Done</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function GuardianModal({ schoolId, guardianId, onClose, onChange }: { schoolId: string; guardianId: string; onClose: () => void; onChange: () => void }) {
  const [g, setG] = useState<any>(null);
  const [tab, setTab] = useState("Overview");
  const [f, setF] = useState<any>({ fullName: "", phone: "", city: "", preferredLanguage: "en", photoUrl: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/guardians/${guardianId}`).then((r) => r.json());
    setG(d.guardian); if (d.guardian) setF({ fullName: d.guardian.fullName || "", phone: d.guardian.phone || "", city: d.guardian.city || "", preferredLanguage: d.guardian.preferredLanguage || "en", photoUrl: d.guardian.photoUrl || "" });
  }, [schoolId, guardianId]);
  useEffect(() => { load(); }, [load]);
  if (!g) return <PersonModal title="Loading…" onClose={onClose}><div className="muted">Loading…</div></PersonModal>;
  const readOnly = (g.source ?? "manual") === "api";
  async function save() {
    const res = await fetch(`/api/schools/${schoolId}/guardians/${guardianId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Saved." }); load(); onChange();
  }
  async function invite() {
    const res = await fetch(`/api/schools/${schoolId}/guardians/${guardianId}/invite`, { method: "POST" });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && !d.error ? { kind: "ok", text: d.message || "Invited." } : { kind: "err", text: d.error || "Failed" });
  }
  return (
    <PersonModal
      title={g.fullName}
      subtitle={<>{g.email}{g.phone ? ` · ${g.phone}` : ""} · {g.onPlatform ? <span className="badge active">on platform</span> : <span className="badge draft">not on platform</span>} · {SOURCE_BADGE(g.source)}</>}
      avatar={<Avatar url={g.photoUrl} name={g.fullName} size={54} />}
      onClose={onClose} tabs={["Overview", "Children"]} active={tab} onTab={setTab}
    >
      <Msg m={msg} />
      {readOnly && <div className="notice info" style={{ marginTop: 8 }}>This guardian is fed from an integration — details are read-only here.</div>}
      {tab === "Overview" && (
        <>
          <div style={{ marginTop: 8 }}><button className="small" onClick={invite}>Invite to platform</button> <span className="muted" style={{ fontSize: 12 }}>In-app if already registered; otherwise emails an activation link (SMS/WhatsApp too when configured).</span></div>
          <div className="row" style={{ marginTop: 12 }}>
            <div><label>Full name</label><input value={f.fullName} disabled={readOnly} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
            <div><label>Phone</label><input value={f.phone} disabled={readOnly} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          </div>
          <div className="row">
            <div><label>City</label><input value={f.city} disabled={readOnly} onChange={(e) => setF({ ...f, city: e.target.value })} /></div>
            <div><label>Preferred language</label><input value={f.preferredLanguage} disabled={readOnly} onChange={(e) => setF({ ...f, preferredLanguage: e.target.value })} /></div>
          </div>
          <label>Profile image URL</label>
          <input value={f.photoUrl} disabled={readOnly} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} placeholder="https://…" />
          {!readOnly && <div style={{ marginTop: 12 }}><button onClick={save}>Save changes</button></div>}
        </>
      )}
      {tab === "Children" && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Child</th><th>Class</th><th>Relationship</th><th>Flags</th></tr></thead>
          <tbody>
            {g.children.map((c: any) => (
              <tr key={c.linkId}>
                <td><span style={{ display: "flex", alignItems: "center", gap: 8 }}><Avatar url={c.student.photoUrl} name={`${c.student.firstName} ${c.student.lastName}`} size={28} /><span><strong>{c.student.firstName} {c.student.lastName}</strong><div className="mono muted" style={{ fontSize: 11 }}>{c.student.reference}</div></span></span></td>
                <td className="muted">{c.student.yearGroup || "—"}{c.student.class?.name ? ` · ${c.student.class.name}` : ""}</td>
                <td>{c.relationship}</td>
                <td>{c.isPrimaryContact && <span className="badge role">Primary</span>} {c.isEmergencyContact && <span className="badge suspended">Emergency</span>} {c.collectionAuthorised && <span className="badge active">Collect</span>}</td>
              </tr>
            ))}
            {g.children.length === 0 && <tr><td colSpan={4} className="muted">No children linked.</td></tr>}
          </tbody>
        </table>
      )}
    </PersonModal>
  );
}

/* ============================ STAFF ============================ */
const STAFF_STATUS_OPTS = ["active", "inactive", "holiday", "onleave", "sick"];
const staffStatusBadge = (st: string) => st === "active" ? "active" : st === "sick" || st === "inactive" ? "suspended" : "trial";
export function StaffTab({ schoolId }: { schoolId: string }) {
  const [staff, setStaff] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState({ reference: "", fullName: "", email: "", role: "Teacher", jobTitle: "", department: "" });
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const sel = useSel();
  const srt = useSort("name");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/staff`).then((r) => r.json());
    setStaff(d.staff ?? []); sel.clear();
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  const rows = staff.filter((s) => { const t = q.trim().toLowerCase(); if (!t) return true; return [s.user.fullName, s.user.email, s.reference, s.jobTitle, s.department].some((v) => String(v ?? "").toLowerCase().includes(t)); });
  const view = srt.sort(rows, (s, k) => k === "name" ? String(s.user.fullName ?? "").toLowerCase() : k === "job" ? (s.jobTitle || "") : k === "status" ? (s.status || "active") : "");
  const allOn = view.length > 0 && view.every((s) => sel.on(s.id));
  const editable = (s: any) => (s.source ?? "manual") !== "api";
  async function setStatus(s: any, status: string) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/staff/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: `${s.user.fullName} → ${status}.` }); load();
  }

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/staff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Staff member saved." });
    setForm({ reference: "", fullName: "", email: "", role: "Teacher", jobTitle: "", department: "" }); setShowAdd(false); load();
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between"><div><h2>Staff</h2><p className="sub" style={{ marginBottom: 0 }}>Employment profiles, roles, classes and status. Click a name for the full profile.</p></div><button onClick={() => setShowAdd(true)}>New staff member</button></div>
        {msg && <Msg m={msg} />}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "10px 0 12px" }}>
          <input placeholder="Filter staff…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <span className="muted" style={{ fontSize: 12 }}>{q ? `${rows.length} of ${staff.length}` : `${staff.length}`}</span>
        </div>
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((s) => s.id), e.target.checked)} /></th>
            <SortTh k="name" label="Staff" sort={srt} /><th>Roles</th><SortTh k="job" label="Job title" sort={srt} /><th>Classes</th><SortTh k="status" label="Status" sort={srt} /><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((s) => (
              <tr key={s.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(s.id)} onChange={() => sel.toggle(s.id)} /></td>
                <td>
                  <span style={{ display: "flex", alignItems: "center", gap: 9 }}>
                    <Avatar url={s.user.photoUrl} name={s.user.fullName} />
                    <span><button className="linklike" onClick={() => setSelected(s.id)}><strong>{s.user.fullName}</strong></button><div className="mono muted" style={{ fontSize: 11 }}>{s.reference}</div></span>
                  </span>
                </td>
                <td>{s.roles.map((r: string) => <span key={r} className="badge role" style={{ marginRight: 4 }}>{r}</span>)}</td>
                <td>{s.jobTitle || "—"}</td>
                <td className="muted">{s.classes.join(", ") || "—"}</td>
                <td><span className={`badge ${staffStatusBadge(s.status || "active")}`}>{s.status || "active"}</span></td>
                <td>{SOURCE_BADGE(s.source)}</td>
                <td className="right"><Kebab items={[
                  { label: "Open / expand", onClick: () => setSelected(s.id) },
                  ...(editable(s) ? STAFF_STATUS_OPTS.filter((st) => st !== (s.status || "active")).map((st) => ({ label: `Set ${st}`, onClick: () => setStatus(s, st) })) : []),
                ]} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={8} className="muted">{staff.length ? "No staff match your search." : "No staff yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {selected && <StaffModal schoolId={schoolId} staffId={selected} onClose={() => setSelected(null)} onChange={load} />}
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 640, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>New staff member</h2><button className="secondary small" onClick={() => setShowAdd(false)}>Close</button></div>
            {msg && msg.kind === "err" && <Msg m={msg} />}
            <form onSubmit={add} style={{ marginTop: 12 }}>
              <div className="row">
                <div><label>Staff ID / reference</label><input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} required /></div>
                <div><label>Full name</label><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
              </div>
              <div className="row">
                <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
                <div><label>Role</label><select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>{STAFF_ROLES.map((r) => <option key={r}>{r}</option>)}</select></div>
              </div>
              <div className="row">
                <div><label>Job title</label><input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} /></div>
                <div><label>Department</label><input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} /></div>
              </div>
              <button type="submit" style={{ marginTop: 14 }}>Save staff member</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

/* ============================ IMPORT ============================ */
function StaffModal({ schoolId, staffId, onClose, onChange }: { schoolId: string; staffId: string; onClose: () => void; onChange: () => void }) {
  const [s, setS] = useState<any>(null);
  const [tab, setTab] = useState("Overview");
  const [f, setF] = useState<any>({ jobTitle: "", department: "", status: "active", photoUrl: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/staff/${staffId}`).then((r) => r.json());
    setS(d.staff); if (d.staff) setF({ jobTitle: d.staff.jobTitle || "", department: d.staff.department || "", status: d.staff.status || "active", photoUrl: d.staff.user.photoUrl || "" });
  }, [schoolId, staffId]);
  useEffect(() => { load(); }, [load]);
  if (!s) return <PersonModal title="Loading…" onClose={onClose}><div className="muted">Loading…</div></PersonModal>;
  const readOnly = (s.source ?? "manual") === "api";
  async function save() {
    const res = await fetch(`/api/schools/${schoolId}/staff/${staffId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Saved." }); load(); onChange();
  }
  return (
    <PersonModal
      title={s.user.fullName}
      subtitle={<>{s.reference}{s.jobTitle ? ` · ${s.jobTitle}` : ""}{s.department ? ` · ${s.department}` : ""} · <span className={`badge ${staffStatusBadge(s.status || "active")}`}>{s.status || "active"}</span> · {SOURCE_BADGE(s.source)}</>}
      avatar={<Avatar url={s.user.photoUrl} name={s.user.fullName} size={54} />}
      onClose={onClose} tabs={["Overview", "Classes & subjects", "Pupils"]} active={tab} onTab={setTab}
    >
      <Msg m={msg} />
      {readOnly && <div className="notice info" style={{ marginTop: 8 }}>This staff record is fed from an integration — details are read-only here.</div>}
      {tab === "Overview" && (
        <>
          <div className="row" style={{ marginTop: 8 }}>
            <div><label>Email</label><input value={s.user.email} disabled /></div>
            <div><label>Phone</label><input value={s.user.phone || ""} disabled /></div>
          </div>
          <div className="row">
            <div><label>Job title</label><input value={f.jobTitle} disabled={readOnly} onChange={(e) => setF({ ...f, jobTitle: e.target.value })} /></div>
            <div><label>Department</label><input value={f.department} disabled={readOnly} onChange={(e) => setF({ ...f, department: e.target.value })} /></div>
            <div><label>Status</label><select value={f.status} disabled={readOnly} onChange={(e) => setF({ ...f, status: e.target.value })}>{STAFF_STATUS_OPTS.map((st) => <option key={st}>{st}</option>)}</select></div>
          </div>
          <label>Profile image URL</label>
          <input value={f.photoUrl} disabled={readOnly} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} placeholder="https://…" />
          <div style={{ marginTop: 8 }}><span className="muted" style={{ fontSize: 12 }}>Roles: {s.roles.join(", ") || "—"}</span></div>
          {!readOnly && <div style={{ marginTop: 12 }}><button onClick={save}>Save changes</button></div>}
        </>
      )}
      {tab === "Classes & subjects" && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Class</th><th>Year group</th></tr></thead>
          <tbody>
            {s.classes.map((c: any) => <tr key={c.id}><td><strong>{c.name}</strong></td><td className="muted">{c.yearGroup || "—"}</td></tr>)}
            {s.classes.length === 0 && <tr><td colSpan={2} className="muted">No classes assigned.</td></tr>}
          </tbody>
        </table>
      )}
      {tab === "Pupils" && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Pupil</th><th>Reference</th><th>Class</th></tr></thead>
          <tbody>
            {s.pupils.map((p: any) => <tr key={p.id}><td><strong>{p.firstName} {p.lastName}</strong></td><td className="mono muted">{p.reference}</td><td className="muted">{p.class?.name || "—"}</td></tr>)}
            {s.pupils.length === 0 && <tr><td colSpan={3} className="muted">No pupils in this member&apos;s classes.</td></tr>}
          </tbody>
        </table>
      )}
    </PersonModal>
  );
}

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
              <option value="trips">Trips &amp; events</option>
              <option value="attendance">Attendance</option>
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

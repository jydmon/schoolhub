"use client";

import { useEffect, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";
import { useSel, Kebab, SourceBadge } from "./EntityKit";

const STATUSES = ["present", "late", "authorised", "unauthorised", "excused", "absent"];
const SESSIONS = ["am", "pm", "day"];
const statusBadge = (s: string) => s === "present" ? "active" : s === "late" ? "trial" : s === "authorised" || s === "excused" ? "archived" : "suspended";
const todayStr = () => new Date().toISOString().slice(0, 10);

export default function AttendanceTab({ schoolId }: { schoolId: string }) {
  const [date, setDate] = useState(todayStr());
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [f, setF] = useState({ studentId: "", session: "am", status: "present", note: "" });
  const sel = useSel();

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/attendance?date=${date}`).then((r) => r.json());
    setRecords(d.records ?? []); setSummary(d.summary ?? null); sel.clear();
  }, [schoolId, date]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/schools/${schoolId}/students`).then((r) => r.json()).then((d) => setStudents(d.students ?? [])); }, [schoolId]);

  const rows = records.filter((r) => { const s = q.trim().toLowerCase(); if (!s) return true; return [r.studentName, r.studentRef, r.status, r.session, r.className].some((v) => String(v ?? "").toLowerCase().includes(s)); });
  const allOn = rows.length > 0 && rows.every((r) => sel.on(r.id));

  async function mark(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!f.studentId) { setMsg({ kind: "err", text: "Choose a pupil." }); return; }
    const res = await fetch(`/api/schools/${schoolId}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, date }) });
    const d = await res.json().catch(() => ({})); if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Attendance saved." }); setF({ ...f, note: "" }); load();
  }
  async function setStatus(r: any, status: string) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/attendance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: r.id, status }) });
    const d = await res.json().catch(() => ({})); if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; } load();
  }
  async function del(r: any) {
    const res = await fetch(`/api/schools/${schoolId}/attendance?id=${r.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({})); if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; } load();
  }
  async function bulkSet(status: string) {
    setMsg(null); let n = 0, skip = 0;
    for (const id of sel.ids) { const r = records.find((x) => x.id === id); if (!r?.editable) { skip++; continue; } const res = await fetch(`/api/schools/${schoolId}/attendance`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) }); if (res.ok) n++; }
    sel.clear(); load(); setMsg({ kind: "ok", text: `Marked ${n} → ${status}${skip ? ` · ${skip} API-fed skipped` : ""}.` });
  }

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="attendance" title="Import attendance" hint="No MIS integration? Bulk-import daily marks from a CSV (match pupils by reference; session am/pm/day)." />
      <div className="panel">
        <div className="flex-between">
          <div><h2>Attendance</h2><p className="sub" style={{ marginBottom: 0 }}>Daily marks — from your MIS (read-only) or entered/imported here.</p></div>
          <div><label style={{ display: "inline", marginRight: 6 }}>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} /></div>
        </div>
        {summary && (
          <div className="stat-grid" style={{ marginTop: 14 }}>
            <div className="stat"><div className="n">{summary.rate}%</div><div className="l">Attendance</div></div>
            <div className="stat"><div className="n">{summary.present}</div><div className="l">Present</div></div>
            <div className="stat"><div className="n" style={{ color: summary.absent ? "var(--danger)" : undefined }}>{summary.absent}</div><div className="l">Absent</div></div>
            <div className="stat"><div className="n">{summary.total}</div><div className="l">Marks</div></div>
          </div>
        )}
      </div>

      <div className="panel">
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 12px" }}>
          <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <span className="muted" style={{ fontSize: 12 }}>{q ? `${rows.length} of ${records.length}` : `${records.length} mark(s)`}</span>
        </div>
        {sel.ids.length > 0 && (
          <div className="bulkbar"><span>{sel.ids.length} selected</span>
            <button className="small" onClick={() => bulkSet("present")}>Present</button>
            <button className="danger small" onClick={() => bulkSet("absent")}>Absent</button>
            <button className="secondary small" onClick={() => sel.clear()}>Clear</button>
          </div>
        )}
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(rows.map((r) => r.id), e.target.checked)} /></th>
            <th>Pupil</th><th>Class</th><th>Session</th><th>Status</th><th>Note</th><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(r.id)} onChange={() => sel.toggle(r.id)} /></td>
                <td><strong>{r.studentName}</strong><div className="mono muted" style={{ fontSize: 11 }}>{r.studentRef}</div></td>
                <td className="muted">{r.className || r.yearGroup || "—"}</td>
                <td className="muted">{r.session}</td>
                <td><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                <td className="muted">{r.note || "—"}</td>
                <td><SourceBadge src={r.source} /></td>
                <td className="right"><Kebab items={[
                  r.editable ? { label: "Present", onClick: () => setStatus(r, "present") } : null,
                  r.editable ? { label: "Absent (unauthorised)", onClick: () => setStatus(r, "unauthorised") } : null,
                  r.editable ? { label: "Authorised absence", onClick: () => setStatus(r, "authorised") } : null,
                  r.editable ? { label: "Late", onClick: () => setStatus(r, "late") } : null,
                  r.editable ? { label: "Delete", onClick: () => del(r), danger: true } : null,
                ]} /></td>
              </tr>
            ))}
            {records.length === 0 && <tr><td colSpan={8} className="muted">No marks for {date}. Add one below or import a CSV.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Mark a pupil</h2>
        <form onSubmit={mark}>
          <div className="row">
            <div style={{ flex: 2 }}><label>Pupil</label><select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">— select —</option>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.reference})</option>)}</select></div>
            <div><label>Session</label><select value={f.session} onChange={(e) => setF({ ...f, session: e.target.value })}>{SESSIONS.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label>Status</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <label>Note (optional)</label>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. medical appointment" />
          <button type="submit" style={{ marginTop: 12 }}>Save mark</button>
        </form>
      </div>
    </>
  );
}

"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";
import { useSel, Kebab, SourceBadge } from "./EntityKit";

const STATUSES = ["present", "late", "authorised", "unauthorised", "excused", "absent"];
const SESSIONS = ["am", "pm", "day"];
const statusBadge = (s: string) => s === "present" ? "active" : s === "late" ? "trial" : s === "authorised" || s === "excused" ? "archived" : "suspended";
const todayStr = () => new Date().toISOString().slice(0, 10);
const iso = (d: Date) => d.toISOString().slice(0, 10);

type Mode = "day" | "week" | "month" | "term" | "year";
const MODES: [Mode, string][] = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["term", "Term"], ["year", "Year"]];

// Compute the {from,to} date window (inclusive) for a mode around an anchor day.
// Terms/years follow the UK academic convention (Sep–Aug); terms are an
// approximate three-way split that schools can refine with month/week/day.
function rangeFor(mode: Mode, anchor: string): { from: string; to: string; label: string } {
  const a = new Date(anchor + "T00:00:00Z");
  const y = a.getUTCFullYear(), m = a.getUTCMonth(), day = a.getUTCDate();
  if (mode === "day") return { from: anchor, to: anchor, label: anchor };
  if (mode === "week") {
    const dow = (a.getUTCDay() + 6) % 7; // Monday = 0
    const mon = new Date(Date.UTC(y, m, day - dow));
    const sun = new Date(Date.UTC(y, m, day - dow + 6));
    return { from: iso(mon), to: iso(sun), label: `Week of ${iso(mon)}` };
  }
  if (mode === "month") {
    const first = new Date(Date.UTC(y, m, 1));
    const last = new Date(Date.UTC(y, m + 1, 0));
    return { from: iso(first), to: iso(last), label: a.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  if (mode === "term") {
    if (m >= 8) return { from: `${y}-09-01`, to: `${y}-12-31`, label: `Autumn term ${y}` };        // Sep–Dec
    if (m <= 2) return { from: `${y}-01-01`, to: `${y}-03-31`, label: `Spring term ${y}` };          // Jan–Mar
    return { from: `${y}-04-01`, to: `${y}-08-31`, label: `Summer term ${y}` };                      // Apr–Aug
  }
  // Academic year Sep 1 – Aug 31
  const start = m >= 8 ? y : y - 1;
  return { from: `${start}-09-01`, to: `${start + 1}-08-31`, label: `${start}/${start + 1} academic year` };
}

type SortKey = "date" | "pupil" | "class" | "year" | "session" | "status";
function sortVal(r: any, k: SortKey): string {
  switch (k) {
    case "date": return r.date || "";
    case "pupil": return (r.studentName || "").toLowerCase();
    case "class": return (r.className || "").toLowerCase();
    case "year": return (r.yearGroup || "").toLowerCase();
    case "session": return r.session || "";
    case "status": return r.status || "";
  }
}

export default function AttendanceTab({ schoolId }: { schoolId: string }) {
  const [mode, setMode] = useState<Mode>("day");
  const [anchor, setAnchor] = useState(todayStr());
  const [records, setRecords] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [f, setF] = useState({ studentId: "", date: todayStr(), session: "am", status: "present", note: "" });
  const sel = useSel();

  const range = useMemo(() => rangeFor(mode, anchor), [mode, anchor]);

  const load = useCallback(async () => {
    const qs = mode === "day" ? `date=${anchor}` : `from=${range.from}&to=${range.to}`;
    const d = await fetch(`/api/schools/${schoolId}/attendance?${qs}`).then((r) => r.json());
    setRecords(d.records ?? []); setSummary(d.summary ?? null); sel.clear();
  }, [schoolId, mode, anchor, range.from, range.to]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/schools/${schoolId}/students`).then((r) => r.json()).then((d) => setStudents(d.students ?? [])); }, [schoolId]);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    let list = records.filter((r) => {
      if (statusFilter && r.status !== statusFilter) return false;
      if (!s) return true;
      return [r.studentName, r.studentRef, r.status, r.session, r.className, r.yearGroup, r.date].some((v) => String(v ?? "").toLowerCase().includes(s));
    });
    list = [...list].sort((a, b) => { const av = sortVal(a, sort.key), bv = sortVal(b, sort.key); return av < bv ? -1 : av > bv ? 1 : 0; });
    if (sort.dir === "desc") list.reverse();
    return list;
  }, [records, q, statusFilter, sort]);
  const allOn = rows.length > 0 && rows.every((r) => sel.on(r.id));

  const selPupil = students.find((s) => s.id === f.studentId);
  const pupilClass = selPupil ? (selPupil.className || selPupil.class?.name || null) : null;
  const pupilTeacher = selPupil ? (selPupil.classTeacher || selPupil.teacherName || selPupil.class?.teacherName || selPupil.class?.teacher || null) : null;

  function shiftAnchor(dir: number) {
    const a = new Date(anchor + "T00:00:00Z");
    const step = mode === "day" ? 1 : mode === "week" ? 7 : mode === "month" ? 30 : mode === "term" ? 120 : 365;
    a.setUTCDate(a.getUTCDate() + dir * step);
    setAnchor(iso(a));
  }

  async function mark(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!f.studentId) { setMsg({ kind: "err", text: "Choose a pupil." }); return; }
    if (!f.date) { setMsg({ kind: "err", text: "Choose a date." }); return; }
    const res = await fetch(`/api/schools/${schoolId}/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: f.studentId, date: f.date, session: f.session, status: f.status, note: f.note }) });
    const d = await res.json().catch(() => ({})); if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: `Attendance saved for ${f.date}.` }); setF({ ...f, note: "" }); load();
  }
  async function setStatusOf(r: any, status: string) {
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

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th style={{ cursor: "pointer", userSelect: "none" }} onClick={() => setSort((s) => ({ key: k, dir: s.key === k && s.dir === "asc" ? "desc" : "asc" }))}>
      {label}{sort.key === k ? (sort.dir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="attendance" title="Import attendance" hint="No MIS integration? Bulk-import daily marks from a CSV (match pupils by reference; session am/pm/day). Imported marks appear below once you select the matching date range." />
      <div className="panel">
        <div className="flex-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div><h2>Attendance</h2><p className="sub" style={{ marginBottom: 0 }}>Daily marks — from your MIS (read-only) or entered/imported here. Filter by day, week, month, term or year.</p></div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div className="seg" style={{ display: "inline-flex", gap: 4 }}>
              {MODES.map(([mk, ml]) => (
                <button key={mk} type="button" className={mk === mode ? "small" : "secondary small"} onClick={() => setMode(mk)}>{ml}</button>
              ))}
            </div>
            <button type="button" className="secondary small" onClick={() => shiftAnchor(-1)} title="Previous">‹</button>
            <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} style={{ width: "auto" }} />
            <button type="button" className="secondary small" onClick={() => shiftAnchor(1)} title="Next">›</button>
            <button type="button" className="secondary small" onClick={() => { setMode("day"); setAnchor(todayStr()); }}>Today</button>
          </div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Showing <strong>{range.label}</strong>{mode !== "day" ? ` (${range.from} → ${range.to})` : ""}.</p>
        {summary && (
          <div className="stat-grid" style={{ marginTop: 8 }}>
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
          <input placeholder="Search pupil, class, ref…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: "auto" }}>
            <option value="">All statuses</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12 }}>{q || statusFilter ? `${rows.length} of ${records.length}` : `${records.length} mark(s)`}</span>
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
            <Th k="date" label="Date" /><Th k="pupil" label="Pupil" /><Th k="class" label="Class" /><Th k="year" label="Year" /><Th k="session" label="Session" /><Th k="status" label="Status" /><th>Note</th><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(r.id)} onChange={() => sel.toggle(r.id)} /></td>
                <td className="mono muted" style={{ fontSize: 12 }}>{r.date}</td>
                <td><strong>{r.studentName}</strong><div className="mono muted" style={{ fontSize: 11 }}>{r.studentRef}</div></td>
                <td className="muted">{r.className || "—"}</td>
                <td className="muted">{r.yearGroup || "—"}</td>
                <td className="muted">{r.session}</td>
                <td><span className={`badge ${statusBadge(r.status)}`}>{r.status}</span></td>
                <td className="muted">{r.note || "—"}</td>
                <td><SourceBadge src={r.source} /></td>
                <td className="right"><Kebab items={[
                  r.editable ? { label: "Present", onClick: () => setStatusOf(r, "present") } : null,
                  r.editable ? { label: "Absent (unauthorised)", onClick: () => setStatusOf(r, "unauthorised") } : null,
                  r.editable ? { label: "Authorised absence", onClick: () => setStatusOf(r, "authorised") } : null,
                  r.editable ? { label: "Late", onClick: () => setStatusOf(r, "late") } : null,
                  r.editable ? { label: "Delete", onClick: () => del(r), danger: true } : null,
                ]} /></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={10} className="muted">No marks for {range.label}. Widen the range, adjust filters, add one below or import a CSV.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Mark a pupil</h2>
        <form onSubmit={mark}>
          <div className="row">
            <div style={{ flex: 2 }}><label>Pupil</label><select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">— select —</option>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.reference})</option>)}</select></div>
            <div><label>Date</label><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div><label>Session</label><select value={f.session} onChange={(e) => setF({ ...f, session: e.target.value })}>{SESSIONS.map((s) => <option key={s}>{s}</option>)}</select></div>
            <div><label>Status</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          {selPupil && (
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Year: <strong>{selPupil.yearGroup || "—"}</strong> · Class: <strong>{pupilClass || "—"}</strong>{pupilTeacher ? <> · Class teacher: <strong>{pupilTeacher}</strong></> : null}
            </p>
          )}
          <label style={{ marginTop: 8 }}>Note (optional)</label>
          <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. medical appointment" />
          <button type="submit" style={{ marginTop: 12 }}>Save mark</button>
        </form>
      </div>
    </>
  );
}

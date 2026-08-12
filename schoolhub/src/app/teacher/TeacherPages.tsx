"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const DAYS: [number, string][] = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]];
function rateColor(r: number | null) { if (r == null) return "var(--muted)"; if (r >= 96) return "#16a34a"; if (r >= 90) return "#ca8a04"; return "#dc2626"; }

/* ------------------------------- Dashboard ------------------------------- */
export function TDashboard({ schoolId, onNavigate }: { schoolId: string; onNavigate: (k: string) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(`/api/teacher/dashboard?school=${schoolId}`).then((r) => r.json()).then(setD).catch(() => setD({ error: true })); }, [schoolId]);
  if (!d) return <div className="panel">Loading…</div>;
  if (d.error) return <div className="panel"><p className="muted">Couldn&apos;t load your dashboard.</p></div>;
  const s = d.stats || {};
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>{d.scope?.schoolName}</h2>
        <p className="sub" style={{ marginBottom: 10 }}>{d.scope?.classes?.join(", ") || "No classes assigned"}{d.scope?.subjects?.length ? ` · ${d.scope.subjects.join(", ")}` : ""}</p>
        <div className="stat-grid">
          <div className="stat"><div className="n">{s.students ?? 0}</div><div className="l">My pupils</div></div>
          <div className="stat"><div className="n">{s.lessonsToday ?? 0}</div><div className="l">Lessons today</div></div>
          <div className="stat"><div className="n" style={{ color: s.attendanceTakenToday ? "#16a34a" : "#dc2626" }}>{s.attendanceTakenToday ?? 0}</div><div className="l">Attendance marks today</div></div>
          <div className="stat"><div className="n" style={{ color: "#16a34a" }}>{s.positivePoints ?? 0}</div><div className="l">Positive pts (30d)</div></div>
          <div className="stat"><div className="n" style={{ color: s.reportsOutstanding ? "#ca8a04" : undefined }}>{s.reportsOutstanding ?? 0}</div><div className="l">Reports in progress</div></div>
        </div>
        <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => onNavigate("attendance")}>Take attendance</button>
          <button className="secondary" onClick={() => onNavigate("behaviour")}>Log behaviour</button>
          <button className="secondary" onClick={() => onNavigate("assistant")}>Ask AI</button>
        </div>
      </div>

      <div className="row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Today&apos;s lessons</h2><button className="secondary small" onClick={() => onNavigate("timetable")}>Timetable</button></div>
          {d.lessons.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>No lessons scheduled today.</p> : d.lessons.map((l: any) => (
            <div key={l.id} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
              <div><strong>{l.subject}</strong> <span className="muted">{l.className || l.yearGroup || ""}{l.room ? ` · ${l.room}` : ""}</span></div>
              <div className="mono muted" style={{ fontSize: 12 }}>{l.startTime}–{l.endTime}</div>
            </div>
          ))}
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Reports to write</h2><button className="secondary small" onClick={() => onNavigate("reports")}>Reports</button></div>
          {d.reportsToWrite.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>Nothing in progress.</p> : d.reportsToWrite.map((r: any) => (
            <div key={r.id} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
              <div><strong>{r.title}</strong> <span className="muted">· {r.student}</span></div><span className="badge trial">{r.status}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Recent behaviour</h2><button className="secondary small" onClick={() => onNavigate("behaviour")}>All</button></div>
          {d.recentBehaviour.length === 0 ? <p className="muted" style={{ marginTop: 8 }}>None logged recently.</p> : d.recentBehaviour.map((b: any) => (
            <div key={b.id} style={{ borderTop: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>{b.positive ? "⭐" : "⚠️"} <strong>{b.student}</strong> — {b.type} <span className="muted">{fmtDay(b.at)}</span></div>
          ))}
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Upcoming</h2><button className="secondary small" onClick={() => onNavigate("calendar")}>Calendar</button></div>
          {[...d.trips.map((t: any) => ({ k: `t${t.id}`, title: `🧳 ${t.title}`, when: t.date })), ...d.events.map((e: any) => ({ k: `e${e.id}`, title: e.title, when: fmtDay(e.startsAt) }))].slice(0, 8).map((x: any) => (
            <div key={x.k} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}><span>{x.title}</span><span className="muted">{x.when}</span></div>
          ))}
          {d.trips.length === 0 && d.events.length === 0 && <p className="muted" style={{ marginTop: 8 }}>Nothing upcoming.</p>}
        </div>
      </div>
    </>
  );
}

/* ------------------------------- Timetable ------------------------------- */
export function TTimetable({ schoolId }: { schoolId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/teacher/timetable?school=${schoolId}`).then((r) => r.json()).then((d) => setEntries(d.entries ?? [])).catch(() => {}); }, [schoolId]);
  const activeDays = DAYS.filter(([d]) => d <= 5 || entries.some((e) => e.dayOfWeek === d));
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>My timetable</h2>
      <p className="sub">Your weekly teaching schedule.</p>
      {entries.length === 0 ? <p className="muted">No timetable has been set for you yet.</p> : (
        <div style={{ overflowX: "auto" }}><div style={{ display: "grid", gridTemplateColumns: `repeat(${activeDays.length}, minmax(130px, 1fr))`, gap: 10, minWidth: activeDays.length * 140 }}>
          {activeDays.map(([dn, label]) => (
            <div key={dn}>
              <h3 style={{ fontSize: 13, textAlign: "center", padding: "6px 0", background: "#f7f9fc", borderRadius: 8, margin: "0 0 8px" }}>{label}</h3>
              {entries.filter((e) => e.dayOfWeek === dn).sort((a, b) => a.startTime.localeCompare(b.startTime)).map((e) => (
                <div key={e.id} style={{ background: "#eef2ff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{e.subject}</div>
                  <div className="mono muted" style={{ fontSize: 11 }}>{e.startTime}–{e.endTime}{e.period ? ` · ${e.period}` : ""}</div>
                  <div className="muted" style={{ fontSize: 11 }}>{[e.className || e.yearGroup, e.room].filter(Boolean).join(" · ") || "—"}</div>
                </div>
              ))}
              {entries.filter((e) => e.dayOfWeek === dn).length === 0 && <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>—</p>}
            </div>
          ))}
        </div></div>
      )}
    </div>
  );
}

/* -------------------------------- Calendar ------------------------------- */
const CAL_ICON: Record<string, string> = { event: "📌", trip: "🧳", lesson: "📚" };
export function TCalendar({ schoolId }: { schoolId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [type, setType] = useState("all");
  useEffect(() => { fetch(`/api/teacher/calendar?school=${schoolId}`).then((r) => r.json()).then((d) => setItems(d.items ?? [])).catch(() => {}); }, [schoolId]);
  const shown = items.filter((i) => type === "all" || i.type === type);
  const byDay: Record<string, any[]> = {};
  for (const i of shown) { const k = i.startsAt.slice(0, 10); (byDay[k] = byDay[k] || []).push(i); }
  return (
    <div className="panel">
      <div className="flex-between"><div><h2 style={{ margin: 0 }}>Calendar</h2><p className="sub" style={{ marginBottom: 0 }}>School events, your trips and your lessons this month.</p></div></div>
      <div className="chips" style={{ marginTop: 10 }}>
        {[["all", "All"], ["event", "Events"], ["trip", "Trips"], ["lesson", "Lessons"]].map(([k, l]) => <button key={k} className={type === k ? "" : "secondary"} onClick={() => setType(k)}>{l}</button>)}
      </div>
      <div style={{ marginTop: 12 }}>
        {Object.keys(byDay).sort().map((day) => (
          <div key={day} style={{ marginBottom: 12 }}>
            <div className="muted" style={{ fontWeight: 700, fontSize: 13 }}>{fmtDay(`${day}T00:00:00`)}</div>
            {byDay[day].map((i) => (
              <div key={i.id} style={{ borderTop: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
                {CAL_ICON[i.type] || "•"} <strong>{i.title}</strong> <span className="muted">{i.allDay ? "All day" : fmtTime(i.startsAt)}{i.location ? ` · ${i.location}` : ""}</span>
              </div>
            ))}
          </div>
        ))}
        {shown.length === 0 && <p className="muted">Nothing scheduled.</p>}
      </div>
    </div>
  );
}

/* -------------------------------- Students ------------------------------- */
export function TStudents({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [tab, setTab] = useState("attendance");
  useEffect(() => { fetch(`/api/teacher/students?school=${schoolId}`).then((r) => r.json()).then((d) => setStudents(d.students ?? [])).catch(() => {}); }, [schoolId]);
  useEffect(() => { if (open) { setDetail(null); fetch(`/api/teacher/students/${open}?school=${schoolId}`).then((r) => r.json()).then(setDetail).catch(() => {}); } }, [open, schoolId]);
  const filtered = useMemo(() => students.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()) || (s.reference || "").toLowerCase().includes(q.toLowerCase())), [students, q]);

  if (open) {
    const d = detail;
    return (
      <>
        <button className="secondary small" onClick={() => setOpen(null)}>← All pupils</button>
        {!d ? <div className="panel" style={{ marginTop: 10 }}>Loading…</div> : d.error ? <div className="panel" style={{ marginTop: 10 }}><p className="muted">{d.error}</p></div> : (
          <>
            <div className="panel" style={{ marginTop: 10 }}>
              <div className="flex-between"><div><h2 style={{ margin: 0 }}>{d.student.name}</h2><div className="muted" style={{ fontSize: 12 }}>{[d.student.yearGroup, d.student.className, d.student.house].filter(Boolean).join(" · ")} · {d.student.reference}</div></div>
                <div>{d.student.medicalAlert && <span className="badge suspended">Medical</span>} {d.student.sendIndicator && <span className="badge trial">SEND</span>}</div></div>
              {d.student.allergies && <div className="notice err" style={{ marginTop: 8 }}>Allergies: {d.student.allergies}</div>}
            </div>
            <div className="tabs">{[["attendance", "Attendance"], ["behaviour", "Behaviour"], ["reports", "Reports"], ["trips", "Trips"]].map(([k, l]) => <button key={k} className={tab === k ? "active" : ""} onClick={() => setTab(k)}>{l}</button>)}</div>
            {tab === "attendance" && (
              <div className="panel">
                <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ fontSize: 26, fontWeight: 800, color: rateColor(d.attendance.summary.rate) }}>{d.attendance.summary.rate == null ? "—" : `${d.attendance.summary.rate}%`}</div>
                  <div className="muted" style={{ fontSize: 13 }}>Present {d.attendance.summary.present} · Late {d.attendance.summary.late} · Absent {d.attendance.summary.absent} · {d.attendance.summary.total} sessions</div>
                </div>
                <table style={{ marginTop: 10 }}><thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Note</th></tr></thead><tbody>
                  {d.attendance.records.map((a: any, i: number) => <tr key={i}><td className="mono muted">{a.date}</td><td>{a.session}</td><td>{a.status}</td><td className="muted">{a.note || "—"}</td></tr>)}
                  {d.attendance.records.length === 0 && <tr><td colSpan={4} className="muted">No records.</td></tr>}
                </tbody></table>
              </div>
            )}
            {tab === "behaviour" && (
              <div className="panel">{d.behaviour.length === 0 ? <p className="muted">None logged.</p> : d.behaviour.map((b: any) => (
                <div key={b.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", fontSize: 13 }}>{b.positive ? "⭐" : "⚠️"} <strong>{b.type}</strong> {b.points ? `(${b.points})` : ""} <span className="muted">{b.teacherName || ""} · {fmtDay(b.at)}</span>{b.note ? <div className="muted">{b.note}</div> : null}</div>
              ))}</div>
            )}
            {tab === "reports" && (
              <div className="panel">{d.reports.length === 0 ? <p className="muted">No reports.</p> : d.reports.map((r: any) => (
                <div key={r.id} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "8px 0", fontSize: 13 }}><div><strong>{r.title}</strong> <span className="muted">{r.term || ""}</span></div><span className="badge trial">{r.status}</span></div>
              ))}</div>
            )}
            {tab === "trips" && (
              <div className="panel">{d.trips.length === 0 ? <p className="muted">Not on any of your trips.</p> : d.trips.map((t: any) => (
                <div key={t.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", fontSize: 13 }}><strong>{t.title}</strong> <span className="muted">· {t.date}{t.destination ? ` · ${t.destination}` : ""} · consent {t.consent}</span></div>
              ))}</div>
            )}
          </>
        )}
      </>
    );
  }

  return (
    <div className="panel">
      <div className="flex-between"><div><h2 style={{ margin: 0 }}>My pupils</h2><p className="sub" style={{ marginBottom: 0 }}>{students.length} pupils across your classes, subjects and trips.</p></div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" style={{ width: 200 }} /></div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Pupil</th><th>Year</th><th>Class</th><th>Flags</th><th className="right"></th></tr></thead>
        <tbody>
          {filtered.map((s) => (
            <tr key={s.id}><td><strong>{s.name}</strong><div className="mono muted" style={{ fontSize: 11 }}>{s.reference}</div></td><td className="muted">{s.yearGroup || "—"}</td><td className="muted">{s.className || "—"}</td>
              <td>{s.medicalAlert && <span className="badge suspended">Med</span>} {s.sendIndicator && <span className="badge trial">SEND</span>}</td>
              <td className="right"><button className="small" onClick={() => { setOpen(s.id); setTab("attendance"); }}>Open</button></td></tr>
          ))}
          {filtered.length === 0 && <tr><td colSpan={5} className="muted">{students.length === 0 ? "No pupils assigned yet — ask your admin to add you to a class, timetable or trip." : "No matches."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------- Attendance ------------------------------ */
const ATT: [string, string][] = [["present", "Present"], ["late", "Late"], ["authorised", "Auth. absent"], ["unauthorised", "Unauth. absent"]];
export function TAttendance({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [session, setSession] = useState("am");
  const [cls, setCls] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ school: schoolId, date, session }); if (cls) qs.set("class", cls);
    const d = await fetch(`/api/teacher/attendance?${qs}`).then((r) => r.json());
    setData(d); setMarks(Object.fromEntries((d.roster ?? []).map((r: any) => [r.id, r.status || ""])));
  }, [schoolId, date, session, cls]);
  useEffect(() => { load(); }, [load]);
  async function save() {
    setMsg(null);
    const payload = { school: schoolId, date, session, marks: Object.entries(marks).filter(([, v]) => v).map(([studentId, status]) => ({ studentId, status })) };
    const res = await fetch(`/api/teacher/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json();
    setMsg(res.ok && !d.error ? { kind: "ok", text: `Saved ${d.saved} mark(s).` } : { kind: "err", text: d.error || "Failed" });
    load();
  }
  const roster: any[] = data?.roster ?? [];
  const setAll = (status: string) => setMarks(Object.fromEntries(roster.map((r) => [r.id, status])));
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Attendance register</h2>
      <p className="sub">Mark attendance for your pupils. Only your assigned pupils appear here.</p>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
        <div><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: "auto" }} /></div>
        <div><label>Session</label><select value={session} onChange={(e) => setSession(e.target.value)} style={{ width: "auto" }}><option value="am">Morning</option><option value="pm">Afternoon</option><option value="day">Whole day</option></select></div>
        {(data?.classes ?? []).length > 0 && <div><label>Class</label><select value={cls} onChange={(e) => setCls(e.target.value)} style={{ width: "auto" }}><option value="">All my pupils</option>{data.classes.map((c: string) => <option key={c} value={c}>{c}</option>)}</select></div>}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}><button className="secondary small" onClick={() => setAll("present")}>All present</button></div>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Pupil</th><th>Class</th><th>Mark</th></tr></thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.id}>
              <td><strong>{r.name}</strong> {r.medicalAlert && <span className="badge suspended">Med</span>}</td><td className="muted">{r.className || "—"}</td>
              <td><div className="chips" style={{ margin: 0 }}>{ATT.map(([k, l]) => <button key={k} className={marks[r.id] === k ? "" : "secondary"} style={{ padding: "2px 8px", fontSize: 11 }} onClick={() => setMarks((m) => ({ ...m, [r.id]: k }))}>{l}</button>)}</div></td>
            </tr>
          ))}
          {roster.length === 0 && <tr><td colSpan={3} className="muted">No pupils in this view.</td></tr>}
        </tbody>
      </table>
      {roster.length > 0 && <button style={{ marginTop: 12 }} onClick={save}>Save register</button>}
    </div>
  );
}

/* ------------------------------- Behaviour ------------------------------- */
const B_TYPES = ["merit", "house_point", "praise", "certificate", "comment", "incident", "detention", "sanction"];
export function TBehaviour({ schoolId }: { schoolId: string }) {
  const [students, setStudents] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [f, setF] = useState({ studentId: "", type: "merit", points: 1, note: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    setStudents((await fetch(`/api/teacher/students?school=${schoolId}`).then((r) => r.json())).students ?? []);
    setRecords((await fetch(`/api/teacher/behaviour?school=${schoolId}`).then((r) => r.json())).records ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function log() {
    setMsg(null);
    if (!f.studentId) { setMsg({ kind: "err", text: "Choose a pupil." }); return; }
    const res = await fetch(`/api/teacher/behaviour`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ school: schoolId, ...f, points: Number(f.points) }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Logged." }); setF({ ...f, note: "" }); load();
  }
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Log behaviour</h2>
        <p className="sub">Record merits, praise or incidents for your pupils.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div style={{ flex: 2 }}><label>Pupil</label><select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })}><option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}{s.className ? ` (${s.className})` : ""}</option>)}</select></div>
          <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{B_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
          <div><label>Points</label><input type="number" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value as any })} style={{ width: 80 }} /></div>
        </div>
        <label>Note</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional detail" />
        <button style={{ marginTop: 12 }} onClick={log}>Log behaviour</button>
      </div>
      <div className="panel">
        <h2 style={{ fontSize: 16, margin: 0 }}>Recent</h2>
        <table><thead><tr><th>When</th><th>Pupil</th><th>Type</th><th>Pts</th><th>Note</th></tr></thead><tbody>
          {records.map((r) => <tr key={r.id}><td className="mono muted">{fmtDay(r.at)}</td><td>{r.positive ? "⭐" : "⚠️"} {r.student}</td><td>{r.type}</td><td>{r.points || "—"}</td><td className="muted">{r.note || "—"}</td></tr>)}
          {records.length === 0 && <tr><td colSpan={5} className="muted">Nothing logged yet.</td></tr>}
        </tbody></table>
      </div>
    </>
  );
}

/* -------------------------------- Reports -------------------------------- */
export function TReports({ schoolId }: { schoolId: string }) {
  const [reports, setReports] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [edit, setEdit] = useState<any | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    setReports((await fetch(`/api/teacher/reports?school=${schoolId}`).then((r) => r.json())).reports ?? []);
    setStudents((await fetch(`/api/teacher/students?school=${schoolId}`).then((r) => r.json())).students ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  function newReport() { setEdit({ studentId: "", title: "", term: "", type: "termly", summary: "", comments: "" }); setMsg(null); }
  function editReport(r: any) { setEdit({ id: r.id, studentId: r.studentId, title: r.title, term: r.term || "", type: r.type, summary: r.summary || "", comments: r.body?.comments || "" }); setMsg(null); }
  async function save(submit: boolean) {
    setMsg(null);
    if (!edit.studentId || !edit.title.trim()) { setMsg({ kind: "err", text: "Pupil and title are required." }); return; }
    const body = { school: schoolId, ...edit, submit, body: { comments: edit.comments } };
    const res = await fetch(`/api/teacher/reports`, { method: edit.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setEdit(null); load();
  }
  return (
    <>
      <div className="panel">
        <div className="flex-between"><div><h2 style={{ margin: 0 }}>Pupil reports</h2><p className="sub" style={{ marginBottom: 0 }}>Draft and submit reports for your pupils. Submitted reports go to leadership for approval &amp; release.</p></div><button onClick={newReport}>New report</button></div>
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Pupil</th><th>Report</th><th>Term</th><th>Status</th><th className="right"></th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}><td>{r.student}</td><td><strong>{r.title}</strong></td><td className="muted">{r.term || "—"}</td>
                <td><span className={`badge ${r.status === "released" || r.status === "approved" ? "active" : r.status === "submitted" ? "trial" : "archived"}`}>{r.status}</span></td>
                <td className="right">{r.editable ? <button className="small" onClick={() => editReport(r)}>Edit</button> : <span className="muted" style={{ fontSize: 12 }}>{r.authorMine ? "locked" : "—"}</span>}</td></tr>
            ))}
            {reports.length === 0 && <tr><td colSpan={5} className="muted">No reports yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="modal-overlay" onClick={() => setEdit(null)}>
          <div className="modal" style={{ maxWidth: 640, width: "95%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>{edit.id ? "Edit report" : "New report"}</h2><button className="secondary small" onClick={() => setEdit(null)}>Close</button></div>
            {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 8 }}>{msg.text}</div>}
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 2 }}><label>Pupil</label><select value={edit.studentId} onChange={(e) => setEdit({ ...edit, studentId: e.target.value })} disabled={!!edit.id}><option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label>Type</label><select value={edit.type} onChange={(e) => setEdit({ ...edit, type: e.target.value })}><option value="termly">Termly</option><option value="annual">Annual</option><option value="attendance_behaviour">Attendance/behaviour</option><option value="custom">Custom</option></select></div>
            </div>
            <div className="row">
              <div style={{ flex: 2 }}><label>Title</label><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} placeholder="e.g. Autumn Term Report" /></div>
              <div><label>Term</label><input value={edit.term} onChange={(e) => setEdit({ ...edit, term: e.target.value })} placeholder="Autumn 2026" /></div>
            </div>
            <label>Summary</label><input value={edit.summary} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} placeholder="One-line headline" />
            <label>Comments</label><textarea rows={6} value={edit.comments} onChange={(e) => setEdit({ ...edit, comments: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
            <div style={{ marginTop: 12, display: "flex", gap: 8 }}><button className="secondary" onClick={() => save(false)}>Save draft</button><button onClick={() => save(true)}>Submit for approval</button></div>
          </div>
        </div>
      )}
    </>
  );
}

/* --------------------------------- Trips --------------------------------- */
export function TTrips({ schoolId }: { schoolId: string }) {
  const [trips, setTrips] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  useEffect(() => { fetch(`/api/teacher/trips?school=${schoolId}`).then((r) => r.json()).then((d) => setTrips(d.trips ?? [])).catch(() => {}); }, [schoolId]);
  useEffect(() => { if (open) { setDetail(null); fetch(`/api/teacher/trips?school=${schoolId}&trip=${open}`).then((r) => r.json()).then(setDetail).catch(() => {}); } }, [open, schoolId]);
  if (open) {
    return (
      <>
        <button className="secondary small" onClick={() => setOpen(null)}>← All trips</button>
        {!detail ? <div className="panel" style={{ marginTop: 10 }}>Loading…</div> : (
          <>
            <div className="panel" style={{ marginTop: 10 }}>
              <h2 style={{ margin: 0 }}>{detail.trip?.title}</h2>
              <p className="sub" style={{ marginBottom: 0 }}>{detail.trip?.date}{detail.trip?.destination ? ` · ${detail.trip.destination}` : ""}{detail.trip?.departureTime ? ` · departs ${detail.trip.departureTime}` : ""}</p>
              {detail.staff?.length ? <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>Staff: {detail.staff.map((s: any) => `${s.name} (${s.role})`).join(", ")}</div> : null}
            </div>
            <div className="panel">
              <h2 style={{ fontSize: 16, margin: 0 }}>Pupils ({detail.students?.length ?? 0})</h2>
              <table><thead><tr><th>Pupil</th><th>Year</th><th>Consent</th><th>Flags</th></tr></thead><tbody>
                {(detail.students ?? []).map((s: any) => <tr key={s.id}><td>{s.name}</td><td className="muted">{s.yearGroup || "—"}</td><td><span className={`badge ${s.consent === "given" ? "active" : s.consent === "declined" ? "suspended" : "trial"}`}>{s.consent}</span></td><td>{s.medicalAlert && <span className="badge suspended">Med</span>}{s.allergies ? <span className="muted" style={{ fontSize: 11 }}> {s.allergies}</span> : null}</td></tr>)}
                {(detail.students ?? []).length === 0 && <tr><td colSpan={4} className="muted">No pupils on this trip.</td></tr>}
              </tbody></table>
            </div>
          </>
        )}
      </>
    );
  }
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>My trips</h2>
      <p className="sub">Trips you lead or supervise.</p>
      <table><thead><tr><th>Trip</th><th>Date</th><th>Destination</th><th>Pupils</th><th className="right"></th></tr></thead><tbody>
        {trips.map((t) => <tr key={t.id}><td><strong>{t.title}</strong></td><td className="mono muted">{t.date}</td><td className="muted">{t.destination || "—"}</td><td>{t.students}</td><td className="right"><button className="small" onClick={() => setOpen(t.id)}>Open</button></td></tr>)}
        {trips.length === 0 && <tr><td colSpan={5} className="muted">You aren&apos;t assigned to any trips.</td></tr>}
      </tbody></table>
    </div>
  );
}

/* ------------------------------ Notifications ---------------------------- */
export function TNotifications() {
  const [data, setData] = useState<any>(null);
  const load = useCallback(async () => setData(await fetch(`/api/me/notifications`).then((r) => r.json())), []);
  useEffect(() => { load(); }, [load]);
  async function markAll() { await fetch(`/api/me/notifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ all: true }) }); load(); }
  const items: any[] = data?.notifications ?? [];
  return (
    <div className="panel">
      <div className="flex-between"><h2 style={{ margin: 0 }}>Notifications {data?.unread ? <span className="badge" style={{ background: "#dc2626", color: "#fff" }}>{data.unread}</span> : null}</h2>{data?.unread ? <button className="secondary small" onClick={markAll}>Mark all read</button> : null}</div>
      <div style={{ marginTop: 10 }}>
        {items.length === 0 ? <p className="muted">No notifications.</p> : items.map((n) => (
          <div key={n.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", opacity: n.read ? 0.6 : 1 }}>
            <strong>{n.title}</strong>{n.body ? ` — ${n.body}` : ""}<div className="mono muted" style={{ fontSize: 11 }}>{dt(n.createdAt)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------- History -------------------------------- */
export function THistory({ schoolId }: { schoolId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { fetch(`/api/teacher/history?school=${schoolId}`).then((r) => r.json()).then((d) => setRows(d.entries ?? [])).catch(() => {}); }, [schoolId]);
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>My activity history</h2>
      <p className="sub">A record of actions you&apos;ve taken in the portal.</p>
      <table><thead><tr><th>When</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        {rows.map((a) => <tr key={a.id}><td className="mono muted" style={{ whiteSpace: "nowrap" }}>{dt(a.at)}</td><td>{String(a.action).replace(/_/g, " ")}</td><td className="muted">{a.targetType ? `${a.targetType}${a.targetId ? ` ${String(a.targetId).slice(0, 8)}` : ""}` : "—"}</td></tr>)}
        {rows.length === 0 && <tr><td colSpan={3} className="muted">No activity recorded yet.</td></tr>}
      </tbody></table>
    </div>
  );
}

/* -------------------------------- Profile -------------------------------- */
export function TProfile() {
  const [p, setP] = useState<any>(null);
  const [f, setF] = useState({ fullName: "", phone: "", photoUrl: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => { const d = await fetch(`/api/me/profile`).then((r) => r.json()); setP(d.profile); if (d.profile) setF({ fullName: d.profile.fullName || "", phone: d.profile.phone || "", photoUrl: d.profile.photoUrl || "" }); }, []);
  useEffect(() => { load(); }, [load]);
  async function save(e: React.FormEvent) { e.preventDefault(); setMsg(null); const res = await fetch(`/api/me/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) }); const d = await res.json(); setMsg(res.ok && !d.error ? { kind: "ok", text: "Saved." } : { kind: "err", text: d.error || "Failed" }); load(); }
  if (!p) return <div className="panel">Loading…</div>;
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>My profile</h2>
      <p className="sub">Your contact details. Email and role are managed by your school.</p>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <form onSubmit={save}>
        <div className="row"><div><label>Full name</label><input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div><div><label>Email (read-only)</label><input value={p.email || ""} readOnly disabled /></div></div>
        <div className="row"><div><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div><div><label>Photo URL</label><input value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} /></div></div>
        <button type="submit" style={{ marginTop: 12 }}>Save profile</button>
        <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Two-factor: {p.mfaEnabled ? "on" : "off"}</span>
      </form>
    </div>
  );
}

/* ------------------------------- Assistant ------------------------------- */
const T_EXAMPLES = ["Which of my pupils have low attendance?", "Summarise recent behaviour in my class", "What's on my timetable tomorrow?", "Any upcoming trips I'm supervising?", "How do I submit a pupil report?"];
export function TAssistant({ schoolId }: { schoolId: string }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [turns, setTurns] = useState<any[]>([]);
  async function ask(question?: string) {
    const text = (question ?? q).trim(); if (!text) return;
    setBusy(true); setQ("");
    try {
      const d = await fetch(`/api/teacher/ai`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ school: schoolId, question: text }) }).then((r) => r.json());
      setTurns((t) => [{ q: text, a: d.answer || d.error || "No answer", citations: d.citations || [], found: d.found }, ...t]);
    } catch { setTurns((t) => [{ q: text, a: "Network error", citations: [] }, ...t]); }
    finally { setBusy(false); }
  }
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Ask AI Assistant</h2>
      <p className="sub">Ask about your pupils, classes, timetable, trips, behaviour and reports — or how to do things. Answers are limited to the pupils and information you&apos;re responsible for.</p>
      <div className="row"><div style={{ flex: 4 }}><input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && ask()} placeholder="Ask a question…" /></div><div style={{ display: "flex", alignItems: "flex-end" }}><button disabled={busy} onClick={() => ask()}>{busy ? "…" : "Ask"}</button></div></div>
      <div className="chips" style={{ marginTop: 10 }}>{T_EXAMPLES.map((ex) => <button key={ex} className="secondary small" onClick={() => ask(ex)}>{ex}</button>)}</div>
      <div style={{ marginTop: 16 }}>
        {turns.map((t, i) => (
          <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <div style={{ fontWeight: 700 }}>{t.q}</div>
            <div style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{t.a}</div>
            {t.citations?.length > 0 && <div className="chips" style={{ marginTop: 8 }}><span className="muted" style={{ fontSize: 12 }}>Sources:</span>{t.citations.map((c: any, j: number) => <span key={j} className="chip">{c.title}</span>)}</div>}
            {t.found === false && <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>No matching information in your assigned scope.</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

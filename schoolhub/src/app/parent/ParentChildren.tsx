"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const TABS = ["Profile", "Attendance", "Behaviour", "Homework", "Reports", "Trips", "Contacts", "Messages"];
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const day = (v: any) => (v ? new Date(v).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "—");
const attBadge = (s: string) => s === "present" ? "active" : s === "late" ? "trial" : s === "authorised" || s === "excused" ? "archived" : "suspended";

export default function ParentChildren({ children }: { children: { id: string; name: string }[] }) {
  const [childId, setChildId] = useState<string>("");
  const [tab, setTab] = useState("Profile");
  const [data, setData] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [rerr, setRerr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/parent/child${childId ? `?student=${childId}` : ""}`).then((r) => r.json());
    setData(d);
    if (!childId && d.child) setChildId(d.child.id);
  }, [childId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setReport(null); setRerr(null); }, [childId, tab]);

  async function viewReport(id: string) {
    setRerr(null);
    try { const d = await fetch(`/api/parent/reports/${id}`).then((r) => r.json()); if (d.error) throw new Error(d.error); setReport(d.report); }
    catch (e: any) { setRerr(e.message || "Could not open report"); }
  }

  const ch = data?.child;

  return (
    <div id="p-children">
      <div className="panel">
        <div className="flex-between"><div><h2>My children</h2><p className="sub" style={{ marginBottom: 0 }}>Everything about each child in one place. Switch between children below.</p></div></div>
        {children.length > 1 && (
          <div className="chips" style={{ marginTop: 10 }}>
            {children.map((c) => <button key={c.id} className={childId === c.id ? "" : "secondary"} onClick={() => { setChildId(c.id); }}>{c.name}</button>)}
          </div>
        )}
        {ch && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12 }}>
            {ch.photoUrl ? <img src={ch.photoUrl} alt={ch.name} width={46} height={46} style={{ borderRadius: "50%", objectFit: "cover" }} /> : <span style={{ width: 46, height: 46, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#0ea5e9)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 700 }}>{ch.name.split(" ").map((w: string) => w[0]).join("").slice(0, 2)}</span>}
            <div><strong style={{ fontSize: 16 }}>{ch.name}</strong>{ch.medicalAlert && <span className="badge suspended" style={{ marginLeft: 6 }}>medical</span>}{ch.sendIndicator && <span className="badge trial" style={{ marginLeft: 4 }}>SEND</span>}<div className="muted" style={{ fontSize: 12 }}>{[ch.yearGroup, ch.className, ch.house, ch.schoolName].filter(Boolean).join(" · ")}</div></div>
          </div>
        )}
        <div className="tabs" style={{ marginTop: 14, marginBottom: 0 }}>
          {TABS.map((t) => <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{t}</button>)}
        </div>
      </div>

      <div className="panel">
        {!data ? <p className="muted">Loading…</p> : data.error ? <p className="muted">{data.error}</p> : (
          <>
            {tab === "Profile" && (
              <table><tbody>
                <tr><th style={{ width: 160 }}>Name</th><td>{ch.name}</td></tr>
                <tr><th>Reference</th><td className="mono">{ch.reference}</td></tr>
                <tr><th>Year / class</th><td>{[ch.yearGroup, ch.className].filter(Boolean).join(" · ") || "—"}</td></tr>
                <tr><th>House</th><td>{ch.house || "—"}</td></tr>
                <tr><th>Status</th><td><span className="badge active">{ch.status}</span></td></tr>
                <tr><th>Date of birth</th><td>{ch.dateOfBirth ? new Date(ch.dateOfBirth).toLocaleDateString() : "—"}</td></tr>
                <tr><th>Allergies</th><td>{ch.allergies || "None recorded"}</td></tr>
                <tr><th>Medical alert</th><td>{ch.medicalAlert ? "Yes" : "No"}</td></tr>
                <tr><th>School</th><td>{ch.schoolName}</td></tr>
              </tbody></table>
            )}

            {tab === "Attendance" && <ParentAttendance childId={childId} />}

            {tab === "Behaviour" && (
              <table><thead><tr><th>When</th><th>Type</th><th>Points</th><th>Note</th><th>By</th></tr></thead><tbody>
                {data.behaviour.map((b: any) => <tr key={b.id}><td className="mono muted">{day(b.at)}</td><td>{b.positive ? <span className="badge active">{b.type}</span> : <span className="badge suspended">{b.type}</span>}</td><td>{b.points}</td><td className="muted">{b.note || ""}</td><td className="muted">{b.teacherName || "—"}</td></tr>)}
                {data.behaviour.length === 0 && <tr><td colSpan={5} className="muted">No behaviour records.</td></tr>}
              </tbody></table>
            )}

            {tab === "Homework" && (
              <table><thead><tr><th>Due</th><th>Title</th><th>Subject</th></tr></thead><tbody>
                {data.homework.map((h: any) => <tr key={h.id}><td className="mono muted">{day(h.dueAt)}</td><td>{h.title}</td><td className="muted">{h.subject || "—"}</td></tr>)}
                {data.homework.length === 0 && <tr><td colSpan={3} className="muted">No homework set.</td></tr>}
              </tbody></table>
            )}

            {tab === "Reports" && (
              rerr ? <div className="notice err">{rerr}</div> : null || report ? (
                <div>
                  <button className="secondary small" onClick={() => setReport(null)}>← Back to reports</button>
                  <ReportReader report={report} />
                </div>
              ) : (
                <table><thead><tr><th>Report</th><th>Term</th><th>Released</th><th className="right"></th></tr></thead><tbody>
                  {data.reports.map((r: any) => <tr key={r.id}><td><strong>{r.title}</strong></td><td className="muted">{r.term || "—"}</td><td className="mono muted">{dt(r.releasedAt)}</td><td className="right"><button className="small" onClick={() => viewReport(r.id)}>View</button></td></tr>)}
                  {data.reports.length === 0 && <tr><td colSpan={4} className="muted">No released reports yet.</td></tr>}
                </tbody></table>
              )
            )}

            {tab === "Trips" && (
              <table><thead><tr><th>Trip</th><th>Date</th><th>Destination</th><th>Consent</th></tr></thead><tbody>
                {data.trips.map((t: any) => <tr key={t.id}><td>{t.title}</td><td className="mono muted">{t.date}</td><td className="muted">{t.destination || "—"}</td><td>{t.consentRequired ? <span className={`badge ${t.consent === "given" ? "active" : t.consent === "declined" ? "suspended" : "trial"}`}>{t.consent}</span> : <span className="muted">not required</span>}</td></tr>)}
                {data.trips.length === 0 && <tr><td colSpan={4} className="muted">No trips.</td></tr>}
              </tbody></table>
            )}

            {tab === "Contacts" && (
              <>
                <p className="sub">Emergency / linked contacts for {ch?.name}. Contact your school office to change these.</p>
                <table><thead><tr><th>Name</th><th>Relationship</th><th>Phone</th><th>Email</th></tr></thead><tbody>
                  {data.emergencyContacts.map((g: any, i: number) => <tr key={i}><td>{g.name || "—"}</td><td className="muted">{g.relationship || "—"}</td><td>{g.phone || "—"}</td><td className="muted">{g.email || "—"}</td></tr>)}
                  {data.emergencyContacts.length === 0 && <tr><td colSpan={4} className="muted">No contacts on record.</td></tr>}
                </tbody></table>
              </>
            )}

            {tab === "Messages" && (
              <div>
                {data.communications.length === 0 ? <p className="muted">No school communications yet.</p> : data.communications.map((n: any) => (
                  <div key={n.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", opacity: n.read ? 0.65 : 1 }}>
                    <strong>{n.title}</strong>{n.body ? ` — ${n.body}` : ""}<div className="mono muted" style={{ fontSize: 11 }}>{dt(n.at)}</div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Renders a released report as a readable document (same structured fields the
// school authors: attendance, per-subject attainment, comments, targets).
function ReportReader({ report }: { report: any }) {
  const b = report.body && typeof report.body === "object" ? report.body : {};
  const subjects: any[] = Array.isArray(b.subjects) ? b.subjects : [];
  const known = new Set(["attendancePct", "authAbs", "unauthAbs", "lates", "conduct", "subjects", "formTutorComment", "headComment", "targets"]);
  const other = Object.entries(b).filter(([k, v]) => !known.has(k) && v != null && v !== "");
  const nm = report.student ? `${report.student.preferredName || report.student.firstName} ${report.student.lastName || ""}`.trim() : "";
  return (
    <div style={{ marginTop: 12, fontSize: 14, lineHeight: 1.55 }}>
      <h3 style={{ margin: "0 0 2px" }}>{report.title}</h3>
      <div className="mono muted" style={{ fontSize: 12 }}>{[nm, report.term || report.type].filter(Boolean).join(" · ")}</div>
      {report.summary && <p style={{ marginTop: 10 }}>{report.summary}</p>}

      {(b.attendancePct || b.conduct) && (
        <>
          <h4 style={{ margin: "14px 0 4px" }}>Attendance &amp; conduct</h4>
          {b.attendancePct != null && <p style={{ margin: "2px 0" }}>Attendance: <strong>{b.attendancePct}%</strong>{b.authAbs ? ` · ${b.authAbs} authorised absence(s)` : ""}{b.unauthAbs ? ` · ${b.unauthAbs} unauthorised` : ""}{b.lates ? ` · ${b.lates} late(s)` : ""}</p>}
          {b.conduct && <p style={{ margin: "2px 0" }}>Conduct: {b.conduct}</p>}
        </>
      )}

      {subjects.length > 0 && (
        <>
          <h4 style={{ margin: "14px 0 4px" }}>Attainment</h4>
          <table><thead><tr><th>Subject</th><th>Attainment</th><th>Effort</th><th>Comment</th></tr></thead>
            <tbody>{subjects.map((s, i) => <tr key={i}><td><strong>{s.name}</strong></td><td>{s.attainment || "—"}</td><td>{s.effort || "—"}</td><td className="muted">{s.comment || ""}</td></tr>)}</tbody>
          </table>
        </>
      )}

      {(b.formTutorComment || b.headComment) && (
        <>
          <h4 style={{ margin: "14px 0 4px" }}>Comments</h4>
          {b.formTutorComment && <p style={{ margin: "2px 0" }}><strong>Form tutor:</strong> {b.formTutorComment}</p>}
          {b.headComment && <p style={{ margin: "2px 0" }}><strong>Head teacher:</strong> {b.headComment}</p>}
        </>
      )}

      {b.targets && (<><h4 style={{ margin: "14px 0 4px" }}>Targets</h4><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{b.targets}</p></>)}

      {other.length > 0 && (
        <div style={{ marginTop: 12 }}>
          {other.map(([k, v]: any) => <div key={k} style={{ borderTop: "1px solid var(--line)", padding: "6px 0" }}><strong style={{ textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</strong><div className="muted">{typeof v === "object" ? JSON.stringify(v) : String(v)}</div></div>)}
        </div>
      )}

      {report.fileUrl && <p style={{ marginTop: 12 }}><a className="linklike" href={report.fileUrl} target="_blank" rel="noreferrer">📎 Download attached report file</a></p>}
    </div>
  );
}

/* ---------------------------- Attendance (filtered) ---------------------- */
const ATT_STATUSES = ["present", "late", "authorised", "unauthorised", "excused", "absent"];
const ATT_SESSIONS: [string, string][] = [["am", "Morning"], ["pm", "Afternoon"], ["day", "Full day"]];
type PMode = "day" | "week" | "month" | "quarter" | "term" | "year";
const PMODES: [PMode, string][] = [["day", "Day"], ["week", "Week"], ["month", "Month"], ["quarter", "Quarter"], ["term", "Term"], ["year", "Year"]];
const pIso = (d: Date) => d.toISOString().slice(0, 10);

// {from,to} window for a mode around an anchor day. Quarters are calendar
// quarters; terms/years follow the UK academic convention (Sep–Aug).
function pRange(mode: PMode, anchor: string): { from: string; to: string; label: string } {
  const a = new Date(anchor + "T00:00:00Z");
  const y = a.getUTCFullYear(), m = a.getUTCMonth(), dd = a.getUTCDate();
  if (mode === "day") return { from: anchor, to: anchor, label: anchor };
  if (mode === "week") {
    const dow = (a.getUTCDay() + 6) % 7;
    const mon = new Date(Date.UTC(y, m, dd - dow)), sun = new Date(Date.UTC(y, m, dd - dow + 6));
    return { from: pIso(mon), to: pIso(sun), label: `Week of ${pIso(mon)}` };
  }
  if (mode === "month") {
    const first = new Date(Date.UTC(y, m, 1)), last = new Date(Date.UTC(y, m + 1, 0));
    return { from: pIso(first), to: pIso(last), label: a.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" }) };
  }
  if (mode === "quarter") {
    const q = Math.floor(m / 3), qs = q * 3;
    const first = new Date(Date.UTC(y, qs, 1)), last = new Date(Date.UTC(y, qs + 3, 0));
    return { from: pIso(first), to: pIso(last), label: `Q${q + 1} ${y}` };
  }
  if (mode === "term") {
    if (m >= 8) return { from: `${y}-09-01`, to: `${y}-12-31`, label: `Autumn term ${y}` };
    if (m <= 2) return { from: `${y}-01-01`, to: `${y}-03-31`, label: `Spring term ${y}` };
    return { from: `${y}-04-01`, to: `${y}-08-31`, label: `Summer term ${y}` };
  }
  const start = m >= 8 ? y : y - 1;
  return { from: `${start}-09-01`, to: `${start + 1}-08-31`, label: `${start}/${start + 1} academic year` };
}

function ParentAttendance({ childId }: { childId: string }) {
  const [mode, setMode] = useState<PMode>("month");
  const [anchor, setAnchor] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("");
  const [session, setSession] = useState("");
  const [data, setData] = useState<any>(null);
  const range = useMemo(() => pRange(mode, anchor), [mode, anchor]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ from: range.from, to: range.to });
    if (childId) qs.set("student", childId);
    if (status) qs.set("status", status);
    if (session) qs.set("session", session);
    const d = await fetch(`/api/parent/attendance?${qs}`).then((r) => r.json()).catch(() => null);
    setData(d);
  }, [childId, range.from, range.to, status, session]);
  useEffect(() => { load(); }, [load]);

  function shift(dir: number) {
    const a = new Date(anchor + "T00:00:00Z");
    const step = mode === "day" ? 1 : mode === "week" ? 7 : mode === "month" ? 30 : mode === "quarter" ? 91 : mode === "term" ? 120 : 365;
    a.setUTCDate(a.getUTCDate() + dir * step); setAnchor(pIso(a));
  }

  const summary = data?.summary;
  const records: any[] = data?.records ?? [];
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="seg" style={{ display: "inline-flex", gap: 4 }}>{PMODES.map(([mk, ml]) => <button key={mk} className={mk === mode ? "small" : "secondary small"} onClick={() => setMode(mk)}>{ml}</button>)}</div>
        <button className="secondary small" onClick={() => shift(-1)} title="Previous">‹</button>
        <input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} style={{ width: "auto" }} />
        <button className="secondary small" onClick={() => shift(1)} title="Next">›</button>
        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ width: "auto" }}><option value="">All statuses</option>{ATT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={session} onChange={(e) => setSession(e.target.value)} style={{ width: "auto" }}><option value="">All sessions</option>{ATT_SESSIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Showing <strong>{range.label}</strong>{mode !== "day" ? ` (${range.from} → ${range.to})` : ""}.</p>
      {summary && (
        <div className="stat-grid">
          <div className="stat"><div className="n">{summary.rate != null ? `${summary.rate}%` : "—"}</div><div className="l">Attendance</div></div>
          <div className="stat"><div className="n">{summary.present}</div><div className="l">Present</div></div>
          <div className="stat"><div className="n">{summary.late}</div><div className="l">Late</div></div>
          <div className="stat"><div className="n" style={{ color: summary.absent ? "var(--danger)" : undefined }}>{summary.absent}</div><div className="l">Absent</div></div>
        </div>
      )}
      <table style={{ marginTop: 12 }}><thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Note</th></tr></thead><tbody>
        {records.map((a: any, i: number) => <tr key={i}><td className="mono muted">{a.date}</td><td>{a.session}</td><td><span className={`badge ${attBadge(a.status)}`}>{a.status}</span></td><td className="muted">{a.note || ""}</td></tr>)}
        {records.length === 0 && <tr><td colSpan={4} className="muted">No attendance for {range.label}. Widen the range or adjust filters.</td></tr>}
      </tbody></table>
    </>
  );
}

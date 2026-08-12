"use client";

import { useCallback, useEffect, useState } from "react";

const TABS = ["Profile", "Attendance", "Behaviour", "Homework", "Reports", "Trips", "Contacts", "Messages"];
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const day = (v: any) => (v ? new Date(v).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "—");
const attBadge = (s: string) => s === "present" ? "active" : s === "late" ? "trial" : s === "authorised" || s === "excused" ? "archived" : "suspended";

export default function ParentChildren({ children }: { children: { id: string; name: string }[] }) {
  const [childId, setChildId] = useState<string>("");
  const [tab, setTab] = useState("Profile");
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/parent/child${childId ? `?student=${childId}` : ""}`).then((r) => r.json());
    setData(d);
    if (!childId && d.child) setChildId(d.child.id);
  }, [childId]);
  useEffect(() => { load(); }, [load]);

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

            {tab === "Attendance" && (
              <>
                <div className="stat-grid">
                  <div className="stat"><div className="n">{data.attendance.summary.rate != null ? `${data.attendance.summary.rate}%` : "—"}</div><div className="l">Attendance (60 days)</div></div>
                  <div className="stat"><div className="n">{data.attendance.summary.present}</div><div className="l">Present</div></div>
                  <div className="stat"><div className="n">{data.attendance.summary.late}</div><div className="l">Late</div></div>
                  <div className="stat"><div className="n" style={{ color: data.attendance.summary.absent ? "var(--danger)" : undefined }}>{data.attendance.summary.absent}</div><div className="l">Absent</div></div>
                </div>
                <table style={{ marginTop: 12 }}><thead><tr><th>Date</th><th>Session</th><th>Status</th><th>Note</th></tr></thead><tbody>
                  {data.attendance.records.map((a: any, i: number) => <tr key={i}><td className="mono muted">{a.date}</td><td>{a.session}</td><td><span className={`badge ${attBadge(a.status)}`}>{a.status}</span></td><td className="muted">{a.note || ""}</td></tr>)}
                  {data.attendance.records.length === 0 && <tr><td colSpan={4} className="muted">No attendance recorded in this period.</td></tr>}
                </tbody></table>
              </>
            )}

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
              <table><thead><tr><th>Report</th><th>Term</th><th>Released</th><th></th></tr></thead><tbody>
                {data.reports.map((r: any) => <tr key={r.id}><td>{r.title}</td><td className="muted">{r.term || "—"}</td><td className="mono muted">{dt(r.releasedAt)}</td><td className="right">{r.url ? <a className="linklike" href={r.url} target="_blank" rel="noreferrer">Open</a> : null}</td></tr>)}
                {data.reports.length === 0 && <tr><td colSpan={4} className="muted">No released reports yet.</td></tr>}
              </tbody></table>
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

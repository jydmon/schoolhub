"use client";

import { useEffect, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
function dueBadge(dateStr?: string | null) {
  if (!dateStr) return null;
  const days = Math.round((new Date(`${dateStr}T00:00:00`).getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="badge suspended">overdue</span>;
  if (days <= 30) return <span className="badge trial">{days}d</span>;
  if (days <= 60) return <span className="badge archived">{days}d</span>;
  return <span className="badge active">ok</span>;
}

export default function DriverHome({ onNavigate }: { onNavigate: (k: string) => void }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(`/api/driver/home`).then((r) => r.json()).then(setD).catch(() => setD({ error: true })); }, []);
  if (!d) return <div className="panel">Loading…</div>;
  if (d.error) return <div className="panel"><p className="muted">Couldn&apos;t load your dashboard.</p></div>;

  const checked = new Set((d.checkedToday || []).map((c: any) => c.journeyId));
  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Today{d.schoolName ? ` · ${d.schoolName}` : ""}</h2>
        <p className="sub" style={{ marginBottom: 10 }}>{d.date}</p>
        <div className="stat-grid">
          <div className="stat"><div className="n">{d.journeys.length}</div><div className="l">Journeys today</div></div>
          <div className="stat"><div className="n">{d.journeys.filter((j: any) => j.status === "completed").length}</div><div className="l">Completed</div></div>
          <div className="stat"><div className="n" style={{ color: d.unreadMessages ? "#dc2626" : undefined }}>{d.unreadMessages}</div><div className="l">Unread messages</div></div>
        </div>
        {d.next && (
          <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 10, padding: 12, background: "#eef2ff" }}>
            <div className="muted" style={{ fontSize: 12 }}>Next journey</div>
            <div className="flex-between" style={{ alignItems: "center", marginTop: 4 }}>
              <div><strong style={{ fontSize: 16 }}>{d.next.routeName}</strong> <span className="badge trial">{d.next.session.toUpperCase()}</span>
                <div className="muted" style={{ fontSize: 12 }}>{d.next.vehicle || "no vehicle"} · {d.next.total} pupil(s){checked.has(d.next.id) ? " · check done ✅" : " · pre-trip check due"}</div></div>
              <div style={{ display: "flex", gap: 8 }}>
                {!checked.has(d.next.id) && <button className="secondary" onClick={() => onNavigate("checks")}>Vehicle check</button>}
                <button onClick={() => onNavigate("journeys")}>Open journey</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {(d.reminders?.length > 0) && (
        <div className="panel" style={{ borderColor: "var(--warn)" }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Your compliance reminders</h2>
          {d.reminders.map((r: any, i: number) => (
            <div key={i} className="flex-between" style={{ borderTop: i ? "1px solid var(--line)" : "none", padding: "8px 0", fontSize: 14 }}>
              <span>{r.key} — expires {r.date}</span>{dueBadge(r.date)}
            </div>
          ))}
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Contact the transport office to renew these before they lapse.</p>
        </div>
      )}

      <div className="row" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 280 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>My routes</h2>
          {(d.assignments?.length ?? 0) === 0 ? <p className="muted" style={{ marginTop: 8 }}>No route assignments yet.</p> : d.assignments.map((a: any, i: number) => (
            <div key={i} style={{ fontSize: 14, padding: "4px 0" }}>🗺️ {a.routeName} <span className="muted">({a.role} · {a.session})</span></div>
          ))}
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 280 }}>
          <div className="flex-between"><h2 style={{ fontSize: 16, margin: 0 }}>Licence & checks</h2><button className="secondary small" onClick={() => onNavigate("checks")}>Vehicle checks</button></div>
          {d.profile ? (
            <div style={{ fontSize: 14, marginTop: 6 }}>
              <div className="flex-between" style={{ padding: "4px 0" }}><span>Licence {d.profile.licenceClasses ? `(${d.profile.licenceClasses})` : ""}</span>{dueBadge(d.profile.licenceExpiry)}</div>
              <div className="flex-between" style={{ padding: "4px 0" }}><span>DBS</span>{dueBadge(d.profile.dbsExpiry)}</div>
              <div className="flex-between" style={{ padding: "4px 0" }}><span>Medical</span>{dueBadge(d.profile.medicalDue)}</div>
            </div>
          ) : <p className="muted" style={{ marginTop: 8 }}>No personnel record yet — the transport office manages this.</p>}
        </div>
      </div>
    </>
  );
}

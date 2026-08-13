"use client";

import { useEffect, useMemo, useState } from "react";

const CAT_ICON: Record<string, string> = { sport: "⚽", music: "🎵", arts: "🎨", drama: "🎭", academic: "📘", stem: "🔬", wellbeing: "🧘", general: "🏫" };
const gbp = (pence: number) => (pence ? `£${(pence / 100).toFixed(2)}` : "Free");
const STATUS_TONE: Record<string, string> = { present: "active", late: "trial", absent: "suspended", excused: "role" };
const schedule = (c: any) => `${c.cadence === "weekly" && c.dayOfWeek ? c.dayOfWeek : c.cadence}${c.startTime ? ` · ${c.startTime}${c.endTime ? "–" + c.endTime : ""}` : ""}`;

export default function ParentClubs() {
  const [data, setData] = useState<any>(null);
  const [child, setChild] = useState("all");

  useEffect(() => { fetch(`/api/parent/clubs`).then((r) => r.json()).then(setData).catch(() => setData({ error: true })); }, []);

  const items: any[] = data?.items ?? [];
  const children: any[] = data?.children ?? [];
  const shown = useMemo(() => items.filter((i) => child === "all" || i.studentId === child), [items, child]);

  if (!data) return <div className="panel">Loading clubs…</div>;
  if (data.error) return <div className="panel"><h2>Clubs &amp; activities</h2><p className="muted">Couldn&apos;t load clubs right now.</p></div>;

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Clubs &amp; activities</h2>
        <p className="sub">The extracurricular clubs your {children.length > 1 ? "children belong" : "child belongs"} to, with their schedule and attendance so far. Only your own {children.length > 1 ? "children's" : "child's"} clubs are shown.</p>
        {children.length > 1 && (
          <div style={{ marginTop: 6 }}><label>Child</label>
            <select value={child} onChange={(e) => setChild(e.target.value)} style={{ width: "auto" }}>
              <option value="all">All children</option>
              {children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="panel"><p className="muted">No clubs to show{items.length ? " for this child" : " — your school hasn't enrolled your child in any clubs yet"}.</p></div>
      ) : shown.map((it) => {
        const c = it.club;
        const rate = it.sessionsRecorded ? Math.round((it.sessionsAttended / it.sessionsRecorded) * 100) : null;
        return (
          <div className="panel" key={it.membershipId}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 style={{ fontSize: 16, margin: 0 }}>{CAT_ICON[c.category] || "🏫"} {c.name}</h2>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{it.childName}{children.length > 1 && it.schoolName ? ` · ${it.schoolName}` : ""} · {schedule(c)}{c.location ? ` · ${c.location}` : ""}</div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {it.status === "waitlist" ? <span className="badge trial">waitlist</span> : <span className="badge active">enrolled</span>}
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>{gbp(c.cost)}</div>
              </div>
            </div>
            {c.description && <p style={{ marginTop: 8, marginBottom: 8 }}>{c.description}</p>}
            <div className="row" style={{ marginTop: 6 }}>
              <div className="stat"><div className="n" style={{ fontSize: 20 }}>{rate == null ? "—" : `${rate}%`}</div><div className="l">Attendance</div></div>
              <div className="stat"><div className="n" style={{ fontSize: 20 }}>{it.sessionsAttended}</div><div className="l">Attended</div></div>
              <div className="stat"><div className="n" style={{ fontSize: 20 }}>{it.sessionsRecorded}</div><div className="l">Sessions</div></div>
              {c.staffLead ? <div className="stat"><div className="n" style={{ fontSize: 15 }}>{c.staffLead}</div><div className="l">Led by</div></div> : null}
            </div>
            {it.history?.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div className="muted" style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Recent attendance</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {it.history.map((h: any, i: number) => (
                    <span key={i} className={`badge ${STATUS_TONE[h.status] || "role"}`} title={h.note || h.status}>
                      {new Date(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {h.status}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

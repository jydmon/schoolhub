"use client";

import { useCallback, useEffect, useState } from "react";

const DAYS: [number, string][] = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]];

export default function ParentTimetable({ children }: { children: { id: string; name: string }[] }) {
  const [childId, setChildId] = useState<string>("");
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/parent/timetable${childId ? `?child=${childId}` : ""}`).then((r) => r.json());
    setData(d);
    if (!childId && d.child) setChildId(d.child.id);
  }, [childId]);
  useEffect(() => { load(); }, [load]);

  const entries: any[] = data?.entries ?? [];
  const activeDays = DAYS.filter(([d]) => d <= 5 || entries.some((e) => e.dayOfWeek === d));

  return (
    <div id="p-timetable">
      <div className="panel">
        <div className="flex-between">
          <div><h2>Timetable</h2><p className="sub" style={{ marginBottom: 0 }}>Your child&apos;s weekly lessons. Lessons also appear on your Calendar. Read-only — set by the school.</p></div>
        </div>
        {children.length > 1 && (
          <div className="chips" style={{ marginTop: 10 }}>
            {children.map((c) => <button key={c.id} className={childId === c.id ? "" : "secondary"} onClick={() => setChildId(c.id)}>{c.name}</button>)}
          </div>
        )}
        {data?.child && <p className="muted" style={{ fontSize: 13, marginTop: 10, marginBottom: 0 }}>{data.child.name}{data.child.yearGroup ? ` · ${data.child.yearGroup}` : ""}{data.child.className ? ` · ${data.child.className}` : ""} · {data.child.schoolName}</p>}
      </div>

      <div className="panel">
        {!data ? <p className="muted">Loading…</p> : entries.length === 0 ? <p className="muted">No timetable has been published for your child yet.</p> : (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${activeDays.length}, 1fr)`, gap: 10 }}>
            {activeDays.map(([d, label]) => {
              const dayEntries = entries.filter((e) => e.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
              return (
                <div key={d}>
                  <h3 style={{ fontSize: 13, textAlign: "center", padding: "6px 0", background: "#f7f9fc", borderRadius: 8, margin: "0 0 8px" }}>{label}</h3>
                  {dayEntries.length === 0 ? <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>—</p> : dayEntries.map((e) => (
                    <div key={e.id} style={{ background: "#eef2ff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 8 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{e.subject}</div>
                      <div className="mono muted" style={{ fontSize: 11 }}>{e.startTime}–{e.endTime}{e.period ? ` · ${e.period}` : ""}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{[e.room, e.teacherName].filter(Boolean).join(" · ") || "—"}</div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

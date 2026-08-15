"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";

const DAYS: [number, string][] = [[1, "Monday"], [2, "Tuesday"], [3, "Wednesday"], [4, "Thursday"], [5, "Friday"], [6, "Saturday"], [7, "Sunday"]];
const DAY_LABEL: Record<number, string> = Object.fromEntries(DAYS) as any;
const blank = () => ({ dayOfWeek: 1, period: "", startTime: "09:00", endTime: "10:00", subject: "", yearGroup: "", className: "", room: "", teacherUserId: "" });

export default function TimetableTab({ schoolId }: { schoolId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  const [teachers, setTeachers] = useState<any[]>([]);
  const [fTeacher, setFTeacher] = useState("");
  const [fYear, setFYear] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState<any>(blank());
  const [editId, setEditId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const qs = new URLSearchParams();
    if (fTeacher) qs.set("teacher", fTeacher);
    if (fYear) qs.set("year", fYear);
    const d = await fetch(`/api/schools/${schoolId}/timetable${qs.toString() ? `?${qs}` : ""}`).then((r) => r.json());
    setEntries(d.entries ?? []);
  }, [schoolId, fTeacher, fYear]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch(`/api/schools/${schoolId}/users`).then((r) => r.json()).then((d) => setTeachers((d.users ?? []).filter((u: any) => u.role === "Teacher")));
  }, [schoolId]);

  const teacherName = (id?: string | null) => teachers.find((t) => t.user?.id === id)?.user?.fullName;
  const years = useMemo(() => Array.from(new Set(entries.map((e) => e.yearGroup).filter(Boolean))).sort(), [entries]);
  const activeDays = DAYS.filter(([d]) => d <= 5 || entries.some((e) => e.dayOfWeek === d));

  function openNew() { setEditId(null); setForm(blank()); setShowForm(true); setMsg(null); }
  function openEdit(e: any) { setEditId(e.id); setForm({ dayOfWeek: e.dayOfWeek, period: e.period || "", startTime: e.startTime, endTime: e.endTime, subject: e.subject, yearGroup: e.yearGroup || "", className: e.className || "", room: e.room || "", teacherUserId: e.teacherUserId || "" }); setShowForm(true); setMsg(null); }

  async function save(ev: React.FormEvent) {
    ev.preventDefault(); setMsg(null);
    const body = { ...form, dayOfWeek: Number(form.dayOfWeek), teacherUserId: form.teacherUserId || null };
    const url = editId ? `/api/schools/${schoolId}/timetable/${editId}` : `/api/schools/${schoolId}/timetable`;
    const res = await fetch(url, { method: editId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed to save" }); return; }
    setShowForm(false); setEditId(null); load();
  }
  async function del(id: string) {
    const res = await fetch(`/api/schools/${schoolId}/timetable/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed to delete" }); return; }
    setShowForm(false); load();
  }

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="timetables" title="Import class timetables" hint="No timetable system? Bulk-add lessons from a CSV (dayOfWeek Mon–Sun or 1–7, times HH:MM; optional teacher email links the slot to staff)." />
      <div className="panel">
        <div className="flex-between">
          <div><h2>Timetable</h2><p className="sub" style={{ marginBottom: 0 }}>Weekly lessons linked to a class/year and a teacher. Lessons also appear on the Calendar. Filter by teacher or year to see a specific schedule.</p></div>
          <button onClick={openNew}>New lesson</button>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</div>}
        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <div><label>Teacher</label><select value={fTeacher} onChange={(e) => setFTeacher(e.target.value)} style={{ width: "auto" }}><option value="">All teachers</option>{teachers.map((t) => <option key={t.user.id} value={t.user.id}>{t.user.fullName}</option>)}</select></div>
          <div><label>Year group</label><select value={fYear} onChange={(e) => setFYear(e.target.value)} style={{ width: "auto" }}><option value="">All years</option>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select></div>
          {(fTeacher || fYear) && <div style={{ display: "flex", alignItems: "flex-end" }}><button className="secondary small" onClick={() => { setFTeacher(""); setFYear(""); }}>Clear</button></div>}
          <div style={{ display: "flex", alignItems: "flex-end", marginLeft: "auto" }}><span className="muted" style={{ fontSize: 12 }}>{entries.length} lesson(s)</span></div>
        </div>
      </div>

      <div className="panel">
        <div style={{ overflowX: "auto" }}><div style={{ display: "grid", gridTemplateColumns: `repeat(${activeDays.length}, minmax(130px, 1fr))`, gap: 10, minWidth: activeDays.length * 140 }}>
          {activeDays.map(([d, label]) => {
            const dayEntries = entries.filter((e) => e.dayOfWeek === d).sort((a, b) => a.startTime.localeCompare(b.startTime));
            return (
              <div key={d}>
                <h3 style={{ fontSize: 13, textAlign: "center", padding: "6px 0", background: "#f7f9fc", borderRadius: 8, margin: "0 0 8px" }}>{label}</h3>
                {dayEntries.length === 0 ? <p className="muted" style={{ fontSize: 12, textAlign: "center" }}>—</p> : dayEntries.map((e) => (
                  <button key={e.id} onClick={() => openEdit(e)} style={{ display: "block", width: "100%", textAlign: "left", background: "#eef2ff", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 8, cursor: "pointer", color: "var(--ink)" }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{e.subject}</div>
                    <div className="mono muted" style={{ fontSize: 11 }}>{e.startTime}–{e.endTime}{e.period ? ` · ${e.period}` : ""}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{[e.className || e.yearGroup, e.room, e.teacherName].filter(Boolean).join(" · ") || "—"}</div>
                  </button>
                ))}
              </div>
            );
          })}
        </div></div>
        {entries.length === 0 && <p className="muted" style={{ marginTop: 10 }}>No lessons yet. Add one with “New lesson”, or import from your MIS.</p>}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" style={{ maxWidth: 620, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>{editId ? "Edit lesson" : "New lesson"}</h2><button className="secondary small" onClick={() => setShowForm(false)}>Close</button></div>
            {msg && msg.kind === "err" && <div className="notice err" style={{ marginTop: 10 }}>{msg.text}</div>}
            <form onSubmit={save} style={{ marginTop: 12 }}>
              <div className="row">
                <div><label>Day</label><select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>{DAYS.map(([d, l]) => <option key={d} value={d}>{l}</option>)}</select></div>
                <div><label>Start</label><input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} required /></div>
                <div><label>End</label><input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} required /></div>
                <div><label>Period (optional)</label><input value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} placeholder="P1" /></div>
              </div>
              <div className="row">
                <div style={{ flex: 2 }}><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></div>
                <div><label>Room</label><input value={form.room} onChange={(e) => setForm({ ...form, room: e.target.value })} /></div>
              </div>
              <div className="row">
                <div><label>Year group</label><input value={form.yearGroup} onChange={(e) => setForm({ ...form, yearGroup: e.target.value })} placeholder="Year 4" /></div>
                <div><label>Class</label><input value={form.className} onChange={(e) => setForm({ ...form, className: e.target.value })} placeholder="4B" /></div>
                <div><label>Teacher</label><select value={form.teacherUserId} onChange={(e) => setForm({ ...form, teacherUserId: e.target.value })}><option value="">—</option>{teachers.map((t) => <option key={t.user.id} value={t.user.id}>{t.user.fullName}</option>)}</select></div>
              </div>
              <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
                <button type="submit">{editId ? "Save lesson" : "Add lesson"}</button>
                {editId && <button type="button" className="danger small" onClick={() => del(editId)}>Delete</button>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

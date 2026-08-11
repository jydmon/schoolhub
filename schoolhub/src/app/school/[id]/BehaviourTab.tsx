"use client";

import { useEffect, useState, useCallback } from "react";

const TYPES: [string, string][] = [
  ["merit", "Merit point"], ["house_point", "House point"], ["badge", "Achievement badge"], ["praise", "Teacher praise"],
  ["certificate", "Certificate"], ["attendance_award", "Attendance award"], ["comment", "Teacher comment"],
  ["incident", "Behaviour incident"], ["detention", "Detention"], ["sanction", "Sanction"],
];

export default function BehaviourTab({ schoolId }: { schoolId: string }) {
  const [rewards, setRewards] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [f, setF] = useState({ studentId: "", type: "merit", points: 1, note: "", teacherName: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setRewards((await fetch(`/api/schools/${schoolId}/rewards`).then((r) => r.json())).rewards ?? []);
    setStudents((await fetch(`/api/schools/${schoolId}/students`).then((r) => r.json())).students ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const res = await fetch(`/api/schools/${schoolId}/rewards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, points: Number(f.points) }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg(d.error || "Failed"); return; }
    setMsg("Recorded — guardians notified per their preferences."); setF({ ...f, note: "" }); load();
  }

  return (
    <>
      <div className="panel">
        <h2>Rewards &amp; behaviour</h2>
        <p className="sub">Records normally arrive from the connected behaviour system (source of truth). You can also add one manually.</p>
        {msg && <div className="notice ok">{msg}</div>}
        <form onSubmit={add}>
          <div className="row">
            <div><label>Student</label><select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })} required><option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></div>
            <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
            <div><label>Points</label><input type="number" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value as any })} /></div>
            <div><label>Teacher</label><input value={f.teacherName} onChange={(e) => setF({ ...f, teacherName: e.target.value })} /></div>
          </div>
          <label>Note</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <button type="submit" style={{ marginTop: 12 }}>Add record</button>
        </form>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>When</th><th>Student</th><th>Type</th><th>Points</th><th>Teacher</th><th>Source</th></tr></thead>
          <tbody>
            {rewards.map((r) => (
              <tr key={r.id}><td className="mono muted">{new Date(r.at).toLocaleDateString()}</td><td>{r.student.firstName} {r.student.lastName}</td>
                <td>{r.positive ? <span className="badge active">{r.type}</span> : <span className="badge suspended">{r.type}</span>}{r.note ? <div className="muted" style={{ fontSize: 11 }}>{r.note}</div> : null}</td><td>{r.points}</td><td>{r.teacherName || "—"}</td><td className="muted">{r.source}</td></tr>
            ))}
            {rewards.length === 0 && <tr><td colSpan={6} className="muted">No records yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

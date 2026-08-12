"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useSel, useSort, SortTh, Kebab, SourceBadge, DetailModal } from "./EntityKit";

const TYPES: [string, string][] = [
  ["merit", "Merit point"], ["house_point", "House point"], ["badge", "Achievement badge"], ["praise", "Teacher praise"],
  ["certificate", "Certificate"], ["attendance_award", "Attendance award"], ["comment", "Teacher comment"],
  ["incident", "Behaviour incident"], ["detention", "Detention"], ["sanction", "Sanction"],
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES);
const POSITIVE = new Set(["merit", "house_point", "badge", "praise", "certificate", "attendance_award"]);
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");
const srcOf = (r: any) => (r.integrationId ? "api" : "manual");
const readOnly = (r: any) => !!r.integrationId;

export default function BehaviourTab({ schoolId }: { schoolId: string }) {
  const [rewards, setRewards] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [f, setF] = useState({ studentId: "", type: "merit", points: 1, note: "", teacherName: "", notifyGuardians: true });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);
  const sel = useSel();
  const srt = useSort("date", -1);

  // filters
  const [q, setQ] = useState("");
  const [fType, setFType] = useState("");
  const [fPol, setFPol] = useState("");
  const [fSource, setFSource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [detail, setDetail] = useState<any>(null);

  const load = useCallback(async () => {
    setRewards((await fetch(`/api/schools/${schoolId}/rewards`).then((r) => r.json())).rewards ?? []);
    setStudents((await fetch(`/api/schools/${schoolId}/students`).then((r) => r.json())).students ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/rewards`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, points: Number(f.points) }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: f.notifyGuardians ? `Recorded — ${d.notified ?? 0} guardian(s) notified per their preferences.` : "Recorded — guardians not notified (notification was turned off for this entry)." });
    setF({ ...f, note: "", points: 1 }); setShowForm(false); load();
  }
  async function del(id: string) {
    const res = await fetch(`/api/schools/${schoolId}/rewards/${id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed to delete" }); return; }
    setDetail(null); load();
  }
  async function bulkDelete() {
    const targets = rewards.filter((r) => sel.on(r.id) && !readOnly(r));
    for (const r of targets) await fetch(`/api/schools/${schoolId}/rewards/${r.id}`, { method: "DELETE" });
    sel.clear(); load();
  }

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rewards.filter((r) => {
      if (fType && r.type !== fType) return false;
      if (fPol === "positive" && !r.positive) return false;
      if (fPol === "negative" && r.positive) return false;
      if (fSource && srcOf(r) !== fSource) return false;
      if (from && new Date(r.at) < new Date(from)) return false;
      if (to && new Date(r.at) > new Date(`${to}T23:59:59`)) return false;
      if (needle) {
        const hay = `${r.student?.firstName} ${r.student?.lastName} ${r.note || ""} ${r.teacherName || ""} ${TYPE_LABEL[r.type] || r.type}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rewards, q, fType, fPol, fSource, from, to]);
  const view = srt.sort(filtered, (r, k) => k === "date" ? +new Date(r.at) : k === "name" ? `${r.student?.firstName} ${r.student?.lastName}`.toLowerCase() : k === "type" ? r.type : k === "points" ? (r.points ?? 0) : "");

  const stats = useMemo(() => {
    let posPoints = 0, posCount = 0, negCount = 0, detentions = 0;
    const byStudent: Record<string, { name: string; points: number }> = {};
    for (const r of filtered) {
      if (r.positive) { posCount++; posPoints += r.points || 0; const key = r.studentId; byStudent[key] = { name: `${r.student?.firstName} ${r.student?.lastName}`, points: (byStudent[key]?.points || 0) + (r.points || 0) }; }
      else { negCount++; if (r.type === "detention") detentions++; }
    }
    const top = Object.values(byStudent).sort((a, b) => b.points - a.points).slice(0, 3);
    return { posPoints, posCount, negCount, detentions, top };
  }, [filtered]);

  const clearFilters = () => { setQ(""); setFType(""); setFPol(""); setFSource(""); setFrom(""); setTo(""); };
  const hasFilters = q || fType || fPol || fSource || from || to;
  const manualSelected = rewards.filter((r) => sel.on(r.id) && !readOnly(r)).length;

  return (
    <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>Rewards &amp; behaviour</h2><p className="sub" style={{ marginBottom: 0 }}>Records normally arrive from the connected behaviour system (source of truth) and are read-only here. You can also add one manually.</p></div>
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "Add record"}</button>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}

        <div className="stat-grid" style={{ marginTop: 14 }}>
          <div className="stat"><div className="n" style={{ color: "var(--ok)" }}>{stats.posPoints}</div><div className="l">Positive points</div></div>
          <div className="stat"><div className="n">{stats.posCount}</div><div className="l">Positive records</div></div>
          <div className="stat"><div className="n" style={{ color: stats.negCount ? "var(--danger)" : undefined }}>{stats.negCount}</div><div className="l">Incidents &amp; sanctions</div></div>
          <div className="stat"><div className="n">{stats.detentions}</div><div className="l">Detentions</div></div>
        </div>
        {stats.top.length > 0 && <p className="muted" style={{ fontSize: 12.5, marginTop: 10 }}>Top merit earners (current filter): {stats.top.map((t) => `${t.name} (${t.points})`).join(" · ")}</p>}

        {showForm && (
          <form onSubmit={add} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="row">
              <div><label>Student</label><select value={f.studentId} onChange={(e) => setF({ ...f, studentId: e.target.value })} required><option value="">—</option>{students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}</option>)}</select></div>
              <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
              <div><label>Points</label><input type="number" value={f.points} onChange={(e) => setF({ ...f, points: e.target.value as any })} /></div>
              <div><label>Teacher</label><input value={f.teacherName} onChange={(e) => setF({ ...f, teacherName: e.target.value })} /></div>
            </div>
            <label>Note</label><input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
            <div className="chips" style={{ marginTop: 10 }}>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={f.notifyGuardians} onChange={(e) => setF({ ...f, notifyGuardians: e.target.checked })} /> Notify guardians</label>
              <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>Guardians still only receive it if their own notification preferences allow this type.</span>
            </div>
            <button type="submit" style={{ marginTop: 12 }}>Add record</button>
          </form>
        )}
      </div>

      <div className="panel">
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 180 }}><input placeholder="Search student, note, teacher…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">All types</option>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
          <div><select value={fPol} onChange={(e) => setFPol(e.target.value)}><option value="">Positive &amp; negative</option><option value="positive">Positive only</option><option value="negative">Incidents only</option></select></div>
          <div><select value={fSource} onChange={(e) => setFSource(e.target.value)}><option value="">All sources</option><option value="manual">Manual</option><option value="api">Integration</option></select></div>
          <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {hasFilters ? <button className="secondary small" onClick={clearFilters}>Clear</button> : null}
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>{filtered.length} of {rewards.length}</span>
        </div>

        {sel.ids.length > 0 && (
          <div className="bulkbar" style={{ marginTop: 12 }}>
            <span>{sel.ids.length} selected{manualSelected !== sel.ids.length ? ` · ${sel.ids.length - manualSelected} integration record(s) can't be deleted here` : ""}</span>
            <button className="danger small" onClick={bulkDelete} disabled={manualSelected === 0}>Delete {manualSelected} manual</button>
            <button className="secondary small" onClick={sel.clear}>Clear</button>
          </div>
        )}

        <table style={{ marginTop: 12 }}>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={view.length > 0 && view.every((r) => sel.on(r.id))} onChange={(e) => sel.setMany(view.map((r) => r.id), e.target.checked)} /></th>
            <SortTh k="date" label="When" sort={srt} /><SortTh k="name" label="Student" sort={srt} /><SortTh k="type" label="Type" sort={srt} /><SortTh k="points" label="Points" sort={srt} /><th>Teacher</th><th>Notified</th><th>Source</th><th className="right"></th>
          </tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(r.id)} onChange={() => sel.toggle(r.id)} /></td>
                <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{new Date(r.at).toLocaleDateString()}</td>
                <td><button className="linklike" onClick={() => setDetail(r)}>{r.student?.firstName} {r.student?.lastName}</button></td>
                <td>{r.positive ? <span className="badge active">{TYPE_LABEL[r.type] || r.type}</span> : <span className="badge suspended">{TYPE_LABEL[r.type] || r.type}</span>}{r.note ? <div className="muted" style={{ fontSize: 11 }}>{r.note}</div> : null}</td>
                <td>{r.points}</td>
                <td>{r.teacherName || "—"}</td>
                <td>{r.notifiedCount > 0 ? <span title="Guardians notified">👪 {r.notifiedCount}</span> : <span className="muted">—</span>}</td>
                <td><SourceBadge src={srcOf(r)} /></td>
                <td className="right">
                  <Kebab items={[
                    { label: "View", onClick: () => setDetail(r) },
                    !readOnly(r) ? { label: "Delete", onClick: () => del(r.id), danger: true } : null,
                  ]} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={9} className="muted">No records match your filters.</td></tr>}
          </tbody>
        </table>
      </div>

      {detail && (
        <DetailModal
          title={<span>{detail.student?.firstName} {detail.student?.lastName}</span>}
          subtitle={<span>{TYPE_LABEL[detail.type] || detail.type} · {dt(detail.at)} · <SourceBadge src={srcOf(detail)} /></span>}
          onClose={() => setDetail(null)}
        >
          {readOnly(detail) && <div className="notice info" style={{ marginBottom: 12 }}>This record came from the connected behaviour system and is read-only here.</div>}
          <table>
            <tbody>
              <tr><th style={{ width: 150 }}>Type</th><td>{detail.positive ? <span className="badge active">{TYPE_LABEL[detail.type] || detail.type}</span> : <span className="badge suspended">{TYPE_LABEL[detail.type] || detail.type}</span>}</td></tr>
              <tr><th>Points</th><td>{detail.points}</td></tr>
              <tr><th>When</th><td>{dt(detail.at)}</td></tr>
              <tr><th>Teacher</th><td>{detail.teacherName || "—"}</td></tr>
              {detail.category && <tr><th>Category</th><td>{detail.category}</td></tr>}
              {detail.note && <tr><th>Note</th><td>{detail.note}</td></tr>}
              <tr><th>Guardians notified</th><td>{detail.notifiedCount > 0 ? `${detail.notifiedCount} guardian(s)` : "None"}</td></tr>
              <tr><th>Source</th><td>{detail.integrationId ? "Integration (source of truth)" : "Manual entry"}</td></tr>
            </tbody>
          </table>
          {!readOnly(detail) && <div className="chips" style={{ marginTop: 14 }}><button className="danger small" onClick={() => del(detail.id)}>Delete record</button></div>}
        </DetailModal>
      )}
    </>
  );
}

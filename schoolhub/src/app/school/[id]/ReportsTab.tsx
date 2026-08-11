"use client";

import { useEffect, useState, useCallback } from "react";

const TYPES: [string, string][] = [
  ["annual", "Annual report card"],
  ["termly", "Termly / progress report"],
  ["attendance_behaviour", "Attendance & behaviour summary"],
  ["custom", "Custom report"],
];
const TYPE_LABEL = Object.fromEntries(TYPES) as Record<string, string>;
const CHANNELS = ["inapp", "push", "email", "sms", "whatsapp"];
const STATUS_BADGE: Record<string, string> = {
  draft: "trial", submitted: "trial", approved: "active", scheduled: "active", released: "active", withdrawn: "suspended",
};

function fmt(d: any) { return d ? new Date(d).toLocaleString() : "—"; }

export default function ReportsTab({ schoolId }: { schoolId: string }) {
  const [releases, setReleases] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [f, setF] = useState<any>({ name: "", type: "annual", term: "", channels: { inapp: true, push: true, email: true, sms: false, whatsapp: false } });

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/pupil-reports`).then((r) => r.json());
    setReleases(d.releases ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const loadDetail = useCallback(async (id: string) => {
    const d = await fetch(`/api/schools/${schoolId}/pupil-reports/${id}`).then((r) => r.json());
    setDetail(d.release ?? null);
  }, [schoolId]);

  useEffect(() => { if (open) loadDetail(open); else setDetail(null); }, [open, loadDetail]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const channels = Object.entries(f.channels).filter(([, v]) => v).map(([k]) => k);
    const res = await fetch(`/api/schools/${schoolId}/pupil-reports`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: f.name, type: f.type, term: f.term || undefined, notifyChannels: channels }),
    });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Release created as a draft. Add pupils' reports, then submit for approval." });
    setF({ ...f, name: "", term: "" });
    await load(); setOpen(d.release.id);
  }

  async function transition(id: string, action: string, extra: any = {}) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/pupil-reports/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: `Done — status is now "${d.status}".` });
    await load(); if (open) loadDetail(open);
  }

  return (
    <>
      <div className="panel">
        <h2>Pupil reports</h2>
        <p className="sub">Prepare report cards, get school-leadership sign-off, and release them to parents at a set time. Parents can&apos;t see a report until it&apos;s released; on release, guardians are notified through the notification centre honouring each family&apos;s channel preferences.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={create}>
          <div className="row">
            <div style={{ flex: 2 }}><label>Release name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Summer 2026 — Year 6 annual reports" required /></div>
            <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label>Term / period</label><input value={f.term} onChange={(e) => setF({ ...f, term: e.target.value })} placeholder="Summer 2026" /></div>
          </div>
          <div className="chips" style={{ marginTop: 10 }}>
            <span className="muted" style={{ fontSize: 13 }}>Notify on release:</span>
            {CHANNELS.map((c) => <label key={c} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!f.channels[c]} onChange={(e) => setF({ ...f, channels: { ...f.channels, [c]: e.target.checked } })} /> {c}</label>)}
          </div>
          <button type="submit" style={{ marginTop: 14 }}>Create release</button>
        </form>
      </div>

      <div className="panel">
        <h2>Releases</h2>
        <table>
          <thead><tr><th>Name</th><th>Type</th><th>Status</th><th>Reports</th><th>Release time</th><th>Viewed</th><th></th></tr></thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td>{r.name}<div className="muted" style={{ fontSize: 11 }}>{r.term || ""}</div></td>
                <td>{TYPE_LABEL[r.type] || r.type}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || "trial"}`}>{r.status}</span></td>
                <td>{r.reportCount}</td>
                <td className="muted" style={{ fontSize: 12 }}>{r.status === "released" ? fmt(r.releasedAt) : r.releaseAt ? fmt(r.releaseAt) : "—"}</td>
                <td>{r.viewed}/{r.reportCount}</td>
                <td className="right"><button className="small secondary" onClick={() => setOpen(open === r.id ? null : r.id)}>{open === r.id ? "Hide" : "Open"}</button></td>
              </tr>
            ))}
            {releases.length === 0 && <tr><td colSpan={7} className="muted">No report releases yet.</td></tr>}
          </tbody>
        </table>
      </div>

      {open && detail && <ReleaseDetail schoolId={schoolId} detail={detail} onChange={() => loadDetail(open)} transition={transition} reload={load} />}
    </>
  );
}

function ReleaseDetail({ schoolId, detail, onChange, transition, reload }: { schoolId: string; detail: any; onChange: () => void; transition: (id: string, a: string, e?: any) => void; reload: () => void }) {
  const [when, setWhen] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const editable = ["draft", "submitted"].includes(detail.status);
  const toIso = (v: string) => (v ? new Date(v).toISOString() : undefined);

  return (
    <div className="panel">
      <div className="flex-between">
        <div>
          <h2 style={{ marginBottom: 2 }}>{detail.name}</h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            {TYPE_LABEL[detail.type] || detail.type}{detail.term ? ` · ${detail.term}` : ""} · <span className={`badge ${STATUS_BADGE[detail.status] || "trial"}`}>{detail.status}</span>
            {detail.approvedBy ? ` · approved by ${detail.approvedBy.fullName}` : ""}
          </p>
        </div>
        <div>{editable && <button className="small" onClick={() => setAddOpen((v) => !v)}>{addOpen ? "Close" : "Add pupils"}</button>}</div>
      </div>

      {addOpen && editable && <AddPupils schoolId={schoolId} releaseId={detail.id} onAdded={() => { onChange(); reload(); }} />}

      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Pupil</th><th>Year</th><th>Title</th><th>Status</th><th>Viewed</th></tr></thead>
        <tbody>
          {(detail.reports || []).map((rep: any) => (
            <tr key={rep.id}>
              <td>{rep.student.firstName} {rep.student.lastName}</td>
              <td className="muted">{rep.student.yearGroup || "—"}</td>
              <td>{rep.title}{rep.fileUrl ? " 📎" : ""}</td>
              <td><span className={`badge ${STATUS_BADGE[rep.status] || "trial"}`}>{rep.status}</span></td>
              <td>{rep.firstViewedAt ? "✓" : "—"}</td>
            </tr>
          ))}
          {(detail.reports || []).length === 0 && <tr><td colSpan={5} className="muted">No pupil reports yet — add pupils above (or teachers add them from the app).</td></tr>}
        </tbody>
      </table>

      {/* Lifecycle action bar */}
      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        {["draft", "submitted"].includes(detail.status) && (
          <button onClick={() => transition(detail.id, "submit")} disabled={(detail.reports || []).length === 0}>Submit for approval</button>
        )}
        {detail.status === "submitted" && (
          <button onClick={() => transition(detail.id, "approve")}>Approve</button>
        )}
        {["approved", "scheduled"].includes(detail.status) && (
          <>
            <div><label style={{ fontSize: 12 }}>Release at</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
            <button className="secondary" disabled={!when} onClick={() => transition(detail.id, "schedule", { releaseAt: toIso(when) })}>Schedule</button>
            <button onClick={() => transition(detail.id, "release_now")}>Release now</button>
          </>
        )}
        {detail.status === "submitted" && (
          <>
            <div><label style={{ fontSize: 12 }}>Approve &amp; schedule for</label><input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} /></div>
            <button className="secondary" disabled={!when} onClick={() => transition(detail.id, "approve", { releaseAt: toIso(when) })}>Approve &amp; schedule</button>
          </>
        )}
        {["scheduled", "released", "approved"].includes(detail.status) && (
          <button className="danger small" onClick={() => { if (confirm("Withdraw this release? Parents will no longer see these reports.")) transition(detail.id, "withdraw"); }}>Withdraw</button>
        )}
      </div>
      {detail.status === "scheduled" && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Embargoed until {fmt(detail.releaseAt)} — parents can&apos;t see these reports until then. The release job publishes them automatically at that time.</p>}
      {detail.status === "released" && <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Released {fmt(detail.releasedAt)} · guardians notified via {detail.notifyChannels}.</p>}
    </div>
  );
}

function AddPupils({ schoolId, releaseId, onAdded }: { schoolId: string; releaseId: string; onAdded: () => void }) {
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/students?q=${encodeURIComponent(q)}`).then((r) => r.json());
    setStudents(d.students ?? []);
  }, [schoolId, q]);
  useEffect(() => { load(); }, [load]);

  async function add() {
    const ids = Object.entries(sel).filter(([, v]) => v).map(([k]) => k);
    if (ids.length === 0) return;
    setBusy(true);
    await fetch(`/api/schools/${schoolId}/pupil-reports/${releaseId}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reports: ids.map((studentId) => ({ studentId })) }),
    });
    setBusy(false); setSel({}); onAdded();
  }

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, marginTop: 10, background: "var(--bg-soft, #f8fafc)" }}>
      <div className="row">
        <div style={{ flex: 1 }}><input placeholder="Search pupils…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <button className="small" disabled={busy} onClick={add}>Add {Object.values(sel).filter(Boolean).length || ""} selected</button>
      </div>
      <div style={{ maxHeight: 200, overflow: "auto", marginTop: 8 }}>
        {students.map((s) => (
          <label key={s.id} className="chip" style={{ display: "inline-flex", margin: 3 }}>
            <input type="checkbox" style={{ width: "auto" }} checked={!!sel[s.id]} onChange={(e) => setSel({ ...sel, [s.id]: e.target.checked })} /> {s.firstName} {s.lastName}{s.yearGroup ? ` · ${s.yearGroup}` : ""}
          </label>
        ))}
        {students.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No pupils match.</p>}
      </div>
      <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Adds a blank report per pupil for staff to complete. Teachers can also author reports directly from the mobile app.</p>
    </div>
  );
}

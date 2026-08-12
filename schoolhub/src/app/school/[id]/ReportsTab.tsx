"use client";

import { useEffect, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";
import { useSel, Kebab, useSort, SortTh, DetailModal } from "./EntityKit";

const TYPES: [string, string][] = [
  ["annual", "Annual report card"],
  ["termly", "Termly / progress report"],
  ["attendance_behaviour", "Attendance & behaviour summary"],
  ["custom", "Custom report"],
];
const TYPE_LABEL = Object.fromEntries(TYPES) as Record<string, string>;
const CHANNELS = ["inapp", "push", "email", "sms", "whatsapp"];
const STATUS_BADGE: Record<string, string> = {
  draft: "trial", submitted: "trial", approved: "active", scheduled: "active", released: "active", withdrawn: "suspended", archived: "archived",
};
const STANDALONE_STATUSES = ["draft", "submitted", "approved", "released", "withdrawn", "archived"];
const SOURCE_BADGE = (s: string) => s === "api" ? <span className="badge role">API</span> : s === "import" ? <span className="badge trial">imported</span> : <span className="muted">manual</span>;
function fmt(d: any) { return d ? new Date(d).toLocaleString() : "—"; }

export default function ReportsTab({ schoolId }: { schoolId: string }) {
  const [releases, setReleases] = useState<any[]>([]);
  const [standalone, setStandalone] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [f, setF] = useState<any>({ name: "", type: "annual", term: "", channels: { inapp: true, push: true, email: true, sms: false, whatsapp: false } });
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [doc, setDoc] = useState<any>(null);
  const sel = useSel();
  const srt = useSort("student");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/pupil-reports`).then((r) => r.json());
    setReleases(d.releases ?? []);
    setStandalone(d.standaloneReports ?? []); sel.clear();
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const view = srt.sort(
    standalone.filter((r) => {
      if (fStatus && r.status !== fStatus) return false;
      const s = q.trim().toLowerCase();
      if (!s) return true;
      return [r.studentName, r.title, r.term, r.status, r.source, r.yearGroup].some((v) => String(v ?? "").toLowerCase().includes(s));
    }),
    (r, k) => k === "student" ? String(r.studentName).toLowerCase() : k === "title" ? String(r.title).toLowerCase() : k === "term" ? (r.term || "") : k === "status" ? r.status : "",
  );
  const allOn = view.length > 0 && view.every((r) => sel.on(r.id));

  async function patchReport(id: string, payload: any) {
    const res = await fetch(`/api/schools/${schoolId}/pupil-reports/reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) throw new Error(d.error || "Failed");
  }
  async function rowStatus(r: any, status: string) {
    setMsg(null);
    try { await patchReport(r.id, { status }); setMsg({ kind: "ok", text: `${r.studentName} → ${status}.` }); load(); }
    catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  }
  async function delReport(r: any) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/pupil-reports/reports/${r.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Could not delete" }); return; }
    setMsg({ kind: "ok", text: "Report removed." }); load();
  }
  async function bulkStatus(status: string) {
    setMsg(null); let n = 0, skip = 0;
    for (const id of sel.ids) { const r = standalone.find((x) => x.id === id); if (!r?.editable) { skip++; continue; } try { await patchReport(id, { status }); n++; } catch { skip++; } }
    sel.clear(); load(); setMsg({ kind: "ok", text: `Updated ${n} report(s) → ${status}${skip ? ` · ${skip} skipped (API-fed)` : ""}.` });
  }

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
    const res = await fetch(`/api/schools/${schoolId}/pupil-reports/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: `Done — status is now "${d.status}".` });
    await load(); if (open) loadDetail(open);
  }

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="pupil_reports" title="Import pupil reports" hint="No reporting system? Bulk-add report cards from a CSV (matched to pupils by student reference). They arrive as drafts." />

      <div className="panel">
        <div className="flex-between"><div><h2>Individual &amp; imported reports</h2><p className="sub" style={{ marginBottom: 0 }}>Per-pupil report cards. Open one to read it as a document; manual and imported reports can be edited, API-fed reports are read-only.</p></div></div>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", margin: "10px 0 12px" }}>
          <input placeholder="Search pupil, title, term…" value={q} onChange={(e) => setQ(e.target.value)} style={{ flex: 2, minWidth: 180 }} />
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All statuses</option>{STANDALONE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          <span className="muted" style={{ fontSize: 12 }}>{q || fStatus ? `${view.length} of ${standalone.length}` : `${standalone.length} report${standalone.length === 1 ? "" : "s"}`}</span>
        </div>

        {sel.ids.length > 0 && (
          <div className="bulkbar">
            <span>{sel.ids.length} selected</span>
            <button className="danger small" onClick={() => bulkStatus("archived")}>Archive</button>
            <select defaultValue="" onChange={(e) => { if (e.target.value) { bulkStatus(e.target.value); e.target.value = ""; } }} style={{ width: "auto" }}>
              <option value="">Set status…</option>{STANDALONE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button className="secondary small" onClick={() => sel.clear()}>Clear</button>
          </div>
        )}

        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((r) => r.id), e.target.checked)} /></th>
            <SortTh k="student" label="Pupil" sort={srt} /><SortTh k="title" label="Title" sort={srt} /><SortTh k="term" label="Term" sort={srt} /><SortTh k="status" label="Status" sort={srt} /><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((r) => (
              <tr key={r.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(r.id)} onChange={() => sel.toggle(r.id)} /></td>
                <td><button className="linklike" onClick={() => setDoc(r)}><strong>{r.studentName}</strong></button>{r.studentRef ? <div className="mono muted" style={{ fontSize: 11 }}>{r.studentRef}{r.yearGroup ? ` · ${r.yearGroup}` : ""}</div> : null}</td>
                <td>{r.title}{r.summary ? <div className="muted" style={{ fontSize: 11 }}>{r.summary}</div> : null}</td>
                <td className="muted">{r.term || "—"}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || "trial"}`}>{r.status}</span></td>
                <td>{SOURCE_BADGE(r.source)}</td>
                <td className="right">
                  <Kebab items={[
                    { label: "View / expand", onClick: () => setDoc(r) },
                    r.editable ? { label: "Archive", onClick: () => rowStatus(r, "archived"), danger: false } : null,
                    r.editable && r.status !== "draft" ? { label: "Set draft", onClick: () => rowStatus(r, "draft") } : null,
                    r.editable && r.status !== "approved" ? { label: "Set approved", onClick: () => rowStatus(r, "approved") } : null,
                    r.editable && r.status !== "released" ? { label: "Set released", onClick: () => rowStatus(r, "released") } : null,
                    r.editable ? { label: "Delete", onClick: () => delReport(r), danger: true } : null,
                  ]} />
                </td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={7} className="muted">{standalone.length ? "No reports match your filters." : "No individual reports yet — import a CSV above (matched to pupils by student reference)."}</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Create a report release</h2>
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
      {doc && <ReportDoc schoolId={schoolId} report={doc} onClose={() => setDoc(null)} onSaved={() => { setDoc(null); load(); }} />}
    </>
  );
}

// ---- Document-style pupil report viewer / editor ----
const blankBody = () => ({ attendancePct: "", authAbs: "", unauthAbs: "", lates: "", conduct: "", subjects: [] as any[], formTutorComment: "", headComment: "", targets: "" });
function ReportDoc({ schoolId, report, onClose, onSaved }: { schoolId: string; report: any; onClose: () => void; onSaved: () => void }) {
  const readOnly = report.source === "api";
  const [tab, setTab] = useState("Report");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [meta, setMeta] = useState({ title: report.title || "", term: report.term || "", type: report.type || "annual", status: report.status || "draft", summary: report.summary || "" });
  const [body, setBody] = useState<any>({ ...blankBody(), ...(report.body || {}) });
  const subjects: any[] = Array.isArray(body.subjects) ? body.subjects : [];
  const tabs = readOnly ? ["Report", "Attainment", "Comments"] : ["Report", "Attainment", "Comments", "Edit"];

  function setSubject(i: number, patch: any) { setBody((b: any) => ({ ...b, subjects: subjects.map((s, j) => j === i ? { ...s, ...patch } : s) })); }
  function addSubject() { setBody((b: any) => ({ ...b, subjects: [...subjects, { name: "", attainment: "", effort: "", comment: "" }] })); }
  function removeSubject(i: number) { setBody((b: any) => ({ ...b, subjects: subjects.filter((_, j) => j !== i) })); }

  async function save() {
    setMsg(null);
    try {
      const res = await fetch(`/api/schools/${schoolId}/pupil-reports/reports/${report.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: meta.title, term: meta.term, type: meta.type, status: meta.status, summary: meta.summary, body }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) throw new Error(d.error || "Failed to save");
      onSaved();
    } catch (e: any) { setMsg({ kind: "err", text: e.message }); }
  }

  const th = { textAlign: "left" as const, fontSize: 12, color: "var(--muted)", padding: "4px 8px" };
  const td = { padding: "4px 8px", borderTop: "1px solid var(--line)" };

  return (
    <DetailModal
      title={<span>{report.studentName}</span>}
      subtitle={<span>{meta.title || TYPE_LABEL[report.type] || report.type}{meta.term ? ` · ${meta.term}` : ""} · <span className={`badge ${STATUS_BADGE[meta.status] || "trial"}`}>{meta.status}</span> · {SOURCE_BADGE(report.source)}</span>}
      onClose={onClose} tabs={tabs} active={tab} onTab={setTab}
    >
      {msg && <div className={`notice ${msg.kind}`} style={{ marginBottom: 10 }}>{msg.text}</div>}
      {readOnly && <div className="notice info" style={{ marginBottom: 10 }}>This report is fed by an integration and is read-only here.</div>}

      {tab === "Report" && (
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
            <div><span className="muted">Pupil:</span> <strong>{report.studentName}</strong></div>
            <div><span className="muted">Year:</span> {report.yearGroup || "—"}</div>
            <div><span className="muted">Report:</span> {TYPE_LABEL[meta.type] || meta.type}</div>
            <div><span className="muted">Term:</span> {meta.term || "—"}</div>
          </div>
          <h3 style={{ margin: "6px 0" }}>Attendance &amp; conduct</h3>
          <p style={{ margin: "2px 0" }}>Attendance: <strong>{body.attendancePct ? `${body.attendancePct}%` : "—"}</strong>{body.authAbs ? ` · ${body.authAbs} authorised absence(s)` : ""}{body.unauthAbs ? ` · ${body.unauthAbs} unauthorised` : ""}{body.lates ? ` · ${body.lates} late(s)` : ""}</p>
          {body.conduct && <p style={{ margin: "2px 0" }}>Conduct: {body.conduct}</p>}
          {body.targets && (<><h3 style={{ margin: "12px 0 6px" }}>Targets for next term</h3><p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{body.targets}</p></>)}
          {report.fileUrl && <p style={{ marginTop: 12 }}><a className="linklike" href={report.fileUrl} target="_blank" rel="noreferrer">📎 Attached report file</a></p>}
        </div>
      )}

      {tab === "Attainment" && (
        subjects.length === 0 ? <p className="muted">No subject attainment recorded{readOnly ? "." : " — add it in the Edit tab."}</p> : (
          <table><thead><tr><th style={th}>Subject</th><th style={th}>Attainment</th><th style={th}>Effort</th><th style={th}>Comment</th></tr></thead>
            <tbody>{subjects.map((s, i) => <tr key={i}><td style={td}><strong>{s.name}</strong></td><td style={td}>{s.attainment || "—"}</td><td style={td}>{s.effort || "—"}</td><td style={td} className="muted">{s.comment || ""}</td></tr>)}</tbody>
          </table>
        )
      )}

      {tab === "Comments" && (
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>
          <h3 style={{ margin: "2px 0 4px" }}>Form tutor</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{body.formTutorComment || <span className="muted">—</span>}</p>
          <h3 style={{ margin: "14px 0 4px" }}>Head teacher</h3>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{body.headComment || <span className="muted">—</span>}</p>
        </div>
      )}

      {tab === "Edit" && !readOnly && (
        <div>
          <div className="row">
            <div style={{ flex: 2 }}><label>Title</label><input value={meta.title} onChange={(e) => setMeta({ ...meta, title: e.target.value })} /></div>
            <div><label>Type</label><select value={meta.type} onChange={(e) => setMeta({ ...meta, type: e.target.value })}>{TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></div>
            <div><label>Term</label><input value={meta.term} onChange={(e) => setMeta({ ...meta, term: e.target.value })} /></div>
            <div><label>Status</label><select value={meta.status} onChange={(e) => setMeta({ ...meta, status: e.target.value })}>{STANDALONE_STATUSES.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          <label>Headline / summary</label><input value={meta.summary} onChange={(e) => setMeta({ ...meta, summary: e.target.value })} />
          <div className="row" style={{ marginTop: 8 }}>
            <div><label>Attendance %</label><input value={body.attendancePct} onChange={(e) => setBody({ ...body, attendancePct: e.target.value })} /></div>
            <div><label>Authorised abs.</label><input value={body.authAbs} onChange={(e) => setBody({ ...body, authAbs: e.target.value })} /></div>
            <div><label>Unauthorised</label><input value={body.unauthAbs} onChange={(e) => setBody({ ...body, unauthAbs: e.target.value })} /></div>
            <div><label>Lates</label><input value={body.lates} onChange={(e) => setBody({ ...body, lates: e.target.value })} /></div>
          </div>
          <label>Conduct / behaviour</label><input value={body.conduct} onChange={(e) => setBody({ ...body, conduct: e.target.value })} />

          <div className="flex-between" style={{ marginTop: 14 }}><label style={{ margin: 0 }}>Subjects</label><button type="button" className="secondary small" onClick={addSubject}>Add subject</button></div>
          {subjects.map((s, i) => (
            <div className="row" key={i} style={{ marginTop: 6 }}>
              <div style={{ flex: 2 }}><input placeholder="Subject" value={s.name} onChange={(e) => setSubject(i, { name: e.target.value })} /></div>
              <div><input placeholder="Attainment" value={s.attainment} onChange={(e) => setSubject(i, { attainment: e.target.value })} /></div>
              <div><input placeholder="Effort" value={s.effort} onChange={(e) => setSubject(i, { effort: e.target.value })} /></div>
              <div style={{ flex: 2 }}><input placeholder="Comment" value={s.comment} onChange={(e) => setSubject(i, { comment: e.target.value })} /></div>
              <button type="button" className="danger small" onClick={() => removeSubject(i)}>✕</button>
            </div>
          ))}
          {subjects.length === 0 && <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>No subjects yet — add rows above.</p>}

          <label style={{ marginTop: 12 }}>Form tutor comment</label>
          <textarea rows={3} value={body.formTutorComment} onChange={(e) => setBody({ ...body, formTutorComment: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
          <label>Head teacher comment</label>
          <textarea rows={3} value={body.headComment} onChange={(e) => setBody({ ...body, headComment: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
          <label>Targets for next term</label>
          <textarea rows={2} value={body.targets} onChange={(e) => setBody({ ...body, targets: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />

          <button style={{ marginTop: 14 }} onClick={save}>Save report</button>
        </div>
      )}
    </DetailModal>
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

      <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
        {["draft", "submitted"].includes(detail.status) && (
          <button onClick={() => transition(detail.id, "submit")} disabled={(detail.reports || []).length === 0}>Submit for approval</button>
        )}
        {detail.status === "submitted" && (<button onClick={() => transition(detail.id, "approve")}>Approve</button>)}
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

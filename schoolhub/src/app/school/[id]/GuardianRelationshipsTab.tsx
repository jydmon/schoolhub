"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const RELATIONSHIPS = ["Parent", "Mother", "Father", "Guardian", "Carer", "Grandparent", "Other"];
const STATUS_BADGE: Record<string, string> = { draft: "archived", invited: "trial", active: "active", suspended: "suspended", revoked: "suspended" };
const STATUS_LABEL: Record<string, string> = { draft: "Draft", invited: "Invited", active: "Active", suspended: "Suspended", revoked: "Revoked" };
const CHANNELS: [string, string][] = [["email", "Email"], ["sms", "SMS"], ["whatsapp", "WhatsApp"]];
const blankForm = () => ({ studentId: "", guardianName: "", guardianEmail: "", guardianPhone: "", relationship: "Parent", hasParentalResponsibility: true, isPrimaryContact: false, isEmergencyContact: false, collectionAuthorised: false, custodyArrangement: "" });
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");

export default function GuardianRelationshipsTab({ schoolId }: { schoolId: string }) {
  const [rels, setRels] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [fStatus, setFStatus] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<any>(blankForm());
  const [detail, setDetail] = useState<any>(null);
  const [invite, setInvite] = useState<any>(null); // { rel, channels, result }

  const load = useCallback(async () => {
    const qs = fStatus ? `?status=${fStatus}` : "";
    const d = await fetch(`/api/schools/${schoolId}/relationships${qs}`).then((r) => r.json());
    setRels(d.relationships ?? []);
  }, [schoolId, fStatus]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/schools/${schoolId}/students`).then((r) => r.json()).then((d) => setStudents(d.students ?? [])); }, [schoolId]);

  const sName = (s: any) => (s ? `${s.firstName} ${s.lastName}`.trim() : "");
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const r of rels) c[r.status] = (c[r.status] || 0) + 1; return c; }, [rels]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!form.studentId) { setMsg({ kind: "err", text: "Choose a pupil." }); return; }
    const res = await fetch(`/api/schools/${schoolId}/relationships`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setShowNew(false); setForm(blankForm()); setMsg({ kind: "ok", text: "Relationship created (draft). Now issue an invitation so the guardian can verify." }); load();
  }

  async function act(rel: any, action: string, extra: any = {}) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/relationships/${rel.id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: `Done: ${action}.` }); load();
    if (detail) openDetail(rel.id);
  }

  async function openDetail(relId: string) {
    const d = await fetch(`/api/schools/${schoolId}/relationships/${relId}`).then((r) => r.json());
    setDetail(d.relationship);
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>Guardian access &amp; relationships</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Parents never gain access from a child&apos;s name and date of birth. Access is created here, verified by the guardian, and can be suspended or revoked at any time. Every change is audited.</p></div>
          <button onClick={() => { setShowNew(true); setForm(blankForm()); setMsg(null); }}>New relationship</button>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</div>}
        <div className="chips" style={{ marginTop: 12 }}>
          <button className={fStatus === "" ? "" : "secondary"} onClick={() => setFStatus("")}>All ({rels.length})</button>
          {["draft", "invited", "active", "suspended", "revoked"].map((s) => <button key={s} className={fStatus === s ? "" : "secondary"} onClick={() => setFStatus(s)}>{STATUS_LABEL[s]} ({counts[s] || 0})</button>)}
        </div>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Child</th><th>Guardian</th><th>Relationship</th><th>Status</th><th>Verified</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rels.map((r) => (
              <tr key={r.id}>
                <td><strong>{sName(r.student)}</strong>{r.student?.yearGroup ? <div className="mono muted" style={{ fontSize: 11 }}>{r.student.yearGroup}</div> : null}</td>
                <td>{r.guardianName}<div className="mono muted" style={{ fontSize: 11 }}>{r.guardianEmail}{r.guardianPhone ? ` · ${r.guardianPhone}` : ""}</div></td>
                <td className="muted">{r.relationship}</td>
                <td><span className={`badge ${STATUS_BADGE[r.status] || "archived"}`}>{STATUS_LABEL[r.status] || r.status}</span></td>
                <td className="mono muted" style={{ fontSize: 11 }}>{r.verifiedAt ? `${r.verificationMethod || ""} · ${new Date(r.verifiedAt).toLocaleDateString()}` : "—"}</td>
                <td className="right nowrap">
                  {(r.status === "draft" || r.status === "invited") && <button className="small" onClick={() => setInvite({ rel: r, channels: ["email"], result: null })}>{r.status === "invited" ? "Reissue" : "Invite"}</button>}{" "}
                  {(r.status === "draft" || r.status === "invited") && <button className="secondary small" onClick={() => { if (confirm(`Confirm you have verified ${r.guardianName}'s identity in person? This grants access to ${sName(r.student)}.`)) act(r, "verify"); }}>Verify in person</button>}{" "}
                  {r.status === "active" && <button className="secondary small" onClick={() => { if (confirm(`Suspend access for ${r.guardianName}? Their link to ${sName(r.student)} will be removed until resumed.`)) act(r, "suspend"); }}>Suspend</button>}{" "}
                  {r.status === "suspended" && <button className="small" onClick={() => act(r, "resume")}>Resume</button>}{" "}
                  <button className="secondary small" onClick={() => openDetail(r.id)}>History</button>{" "}
                  {r.status !== "revoked" && <button className="danger small" onClick={() => { if (confirm(`Revoke this relationship? ${r.guardianName}'s access to ${sName(r.student)} is removed and any pending invite is cancelled.`)) act(r, "revoke"); }}>Revoke</button>}
                </td>
              </tr>
            ))}
            {rels.length === 0 && <tr><td colSpan={6} className="muted">No guardian relationships yet. Create one to grant a parent access to a pupil.</td></tr>}
          </tbody>
        </table>
      </div>

      {/* New relationship */}
      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal" style={{ maxWidth: 620, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>New guardian relationship</h2><button className="secondary small" onClick={() => setShowNew(false)}>Close</button></div>
            <form onSubmit={create} style={{ marginTop: 12 }}>
              <label>Pupil</label>
              <select value={form.studentId} onChange={(e) => setForm({ ...form, studentId: e.target.value })} required>
                <option value="">— choose a pupil —</option>
                {students.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.reference ? ` (${s.reference})` : ""}{s.yearGroup ? ` · ${s.yearGroup}` : ""}</option>)}
              </select>
              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ flex: 2 }}><label>Guardian name</label><input value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} required /></div>
                <div><label>Relationship</label><select value={form.relationship} onChange={(e) => setForm({ ...form, relationship: e.target.value })}>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
              <div className="row">
                <div><label>Email</label><input type="email" value={form.guardianEmail} onChange={(e) => setForm({ ...form, guardianEmail: e.target.value })} required /></div>
                <div><label>Mobile (optional)</label><input value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} placeholder="+44…" /></div>
              </div>
              <div className="chips" style={{ marginTop: 10 }}>
                {[["hasParentalResponsibility", "Parental responsibility"], ["isPrimaryContact", "Primary contact"], ["isEmergencyContact", "Emergency contact"], ["collectionAuthorised", "Authorised to collect"]].map(([k, l]) => (
                  <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!form[k]} onChange={(e) => setForm({ ...form, [k]: e.target.checked })} /> {l}</label>
                ))}
              </div>
              <div style={{ marginTop: 10 }}><label>Custody arrangement (optional)</label><input value={form.custodyArrangement} onChange={(e) => setForm({ ...form, custodyArrangement: e.target.value })} placeholder="e.g. Shared, Weekends" /></div>
              <div style={{ marginTop: 14 }}><button type="submit">Create relationship</button> <span className="muted" style={{ fontSize: 12, marginLeft: 8 }}>Creates a draft — you&apos;ll then send the guardian a verification invitation.</span></div>
            </form>
          </div>
        </div>
      )}

      {/* Invite / reissue */}
      {invite && (
        <div className="modal-overlay" onClick={() => setInvite(null)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>{invite.rel.status === "invited" ? "Reissue" : "Send"} verification invitation</h2><button className="secondary small" onClick={() => setInvite(null)}>Close</button></div>
            <p className="sub">To <strong>{invite.rel.guardianName}</strong> ({invite.rel.guardianEmail}). They&apos;ll confirm their identity before access to {sName(invite.rel.student)} is granted.</p>
            <div className="chips">
              {CHANNELS.map(([k, l]) => <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={invite.channels.includes(k)} onChange={(e) => setInvite({ ...invite, channels: e.target.checked ? [...invite.channels, k] : invite.channels.filter((c: string) => c !== k) })} /> {l}</label>)}
            </div>
            {!invite.result ? (
              <button style={{ marginTop: 12 }} onClick={async () => {
                const res = await fetch(`/api/schools/${schoolId}/relationships/${invite.rel.id}/invite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: invite.channels }) });
                const d = await res.json();
                setInvite({ ...invite, result: d }); load();
              }}>{invite.rel.status === "invited" ? "Reissue" : "Send"} invitation</button>
            ) : (
              <div style={{ marginTop: 12 }}>
                <div className={`notice ${invite.result.status === "invited" ? "ok" : "err"}`}>{invite.result.message}</div>
                {(invite.result.results || []).map((r: any, i: number) => (
                  <div key={i} style={{ fontSize: 13, padding: "4px 0" }}><strong style={{ textTransform: "capitalize" }}>{r.channel}</strong>: <span className={r.status === "sent" ? "" : "muted"}>{r.status}</span> — {r.detail}</div>
                ))}
                {invite.result.link && (
                  <div style={{ marginTop: 8 }}><label>Secure verification link (copy if needed)</label><input readOnly value={invite.result.link} onFocus={(e) => e.currentTarget.select()} /></div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Detail + audit history + amend */}
      {detail && <DetailModal schoolId={schoolId} detail={detail} onClose={() => setDetail(null)} onChanged={() => { openDetail(detail.id); load(); }} setMsg={setMsg} />}
    </>
  );
}

function DetailModal({ schoolId, detail, onClose, onChanged, setMsg }: { schoolId: string; detail: any; onClose: () => void; onChanged: () => void; setMsg: (m: any) => void }) {
  const [edit, setEdit] = useState(false);
  const [f, setF] = useState<any>({ guardianName: detail.guardianName, guardianEmail: detail.guardianEmail, guardianPhone: detail.guardianPhone || "", relationship: detail.relationship, custodyArrangement: detail.custodyArrangement || "", hasParentalResponsibility: detail.hasParentalResponsibility, isPrimaryContact: detail.isPrimaryContact, isEmergencyContact: detail.isEmergencyContact, collectionAuthorised: detail.collectionAuthorised });
  const sName = detail.student ? `${detail.student.firstName} ${detail.student.lastName}`.trim() : "";

  async function saveAmend() {
    const res = await fetch(`/api/schools/${schoolId}/relationships/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setEdit(false); onChanged();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720, width: "96%", maxHeight: "88vh", overflowY: "auto" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>{detail.guardianName} → {sName}</h2><div className="muted" style={{ fontSize: 12 }}>{detail.guardianEmail}{detail.guardianPhone ? ` · ${detail.guardianPhone}` : ""} · {STATUS_LABEL[detail.status] || detail.status}</div></div>
          <button className="secondary small" onClick={onClose}>Close</button>
        </div>

        <div className="row" style={{ marginTop: 10, gap: 20, fontSize: 13 }}>
          <div className="muted">Created {dt(detail.createdAt)}</div>
          <div className="muted">Invited {dt(detail.invitedAt)}</div>
          <div className="muted">Verified {detail.verifiedAt ? `${dt(detail.verifiedAt)} (${detail.verificationMethod})` : "—"}</div>
          <div className="muted">Linked {dt(detail.linkedAt)}</div>
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="flex-between"><h3 style={{ fontSize: 14, margin: 0 }}>Details</h3>{detail.status !== "revoked" && <button className="secondary small" onClick={() => setEdit((v) => !v)}>{edit ? "Cancel" : "Amend"}</button>}</div>
          {!edit ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>
              {detail.relationship} · {detail.hasParentalResponsibility ? "has PR" : "no PR"}{detail.isPrimaryContact ? " · primary" : ""}{detail.isEmergencyContact ? " · emergency" : ""}{detail.collectionAuthorised ? " · can collect" : ""}{detail.custodyArrangement ? ` · ${detail.custodyArrangement}` : ""}
            </div>
          ) : (
            <div style={{ marginTop: 8 }}>
              <div className="row">
                <div style={{ flex: 2 }}><label>Name</label><input value={f.guardianName} onChange={(e) => setF({ ...f, guardianName: e.target.value })} /></div>
                <div><label>Relationship</label><select value={f.relationship} onChange={(e) => setF({ ...f, relationship: e.target.value })}>{RELATIONSHIPS.map((r) => <option key={r} value={r}>{r}</option>)}</select></div>
              </div>
              <div className="row">
                <div><label>Email</label><input value={f.guardianEmail} onChange={(e) => setF({ ...f, guardianEmail: e.target.value })} /></div>
                <div><label>Mobile</label><input value={f.guardianPhone} onChange={(e) => setF({ ...f, guardianPhone: e.target.value })} /></div>
              </div>
              <div className="chips" style={{ marginTop: 8 }}>
                {[["hasParentalResponsibility", "Parental responsibility"], ["isPrimaryContact", "Primary contact"], ["isEmergencyContact", "Emergency contact"], ["collectionAuthorised", "Authorised to collect"]].map(([k, l]) => (
                  <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {l}</label>
                ))}
              </div>
              <div style={{ marginTop: 8 }}><label>Custody arrangement</label><input value={f.custodyArrangement} onChange={(e) => setF({ ...f, custodyArrangement: e.target.value })} /></div>
              <button style={{ marginTop: 10 }} onClick={saveAmend}>Save changes</button>
            </div>
          )}
        </div>

        <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>Audit history ({detail.audit?.length || 0})</h3>
        <div>
          {(detail.audit || []).map((a: any) => (
            <div key={a.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
              <div className="flex-between">
                <strong style={{ textTransform: "capitalize" }}>{String(a.action).replace(/_/g, " ")}</strong>
                <span className="mono muted" style={{ fontSize: 11 }}>{dt(a.createdAt)}</span>
              </div>
              <div className="muted" style={{ fontSize: 12 }}>by {a.actorEmail || "system"} ({a.actorRole || "school"}){a.ip ? ` · ${a.ip}` : ""}</div>
              {a.note && <div style={{ fontSize: 13, marginTop: 2 }}>{a.note}</div>}
              {(Object.keys(a.previousValues || {}).length > 0 || Object.keys(a.newValues || {}).length > 0) && (
                <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
                  {Object.keys(a.newValues || {}).map((k) => (
                    <div key={k}>{k}: {JSON.stringify((a.previousValues || {})[k])} → {JSON.stringify((a.newValues || {})[k])}</div>
                  ))}
                </div>
              )}
            </div>
          ))}
          {(!detail.audit || detail.audit.length === 0) && <p className="muted">No history yet.</p>}
        </div>
      </div>
    </div>
  );
}

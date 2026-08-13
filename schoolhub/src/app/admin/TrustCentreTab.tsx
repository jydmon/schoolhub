"use client";

import { useEffect, useState, useCallback } from "react";

// Super-Admin Document Management System + Trust Centre control. Self-contained
// (own fetch helpers) so it slots into AdminPortal with a single import.

const CATEGORIES = ["policy", "security", "privacy", "compliance", "terms", "certification", "subprocessor", "other"];
const STATUS_TONE: Record<string, string> = { draft: "trial", review: "role", approved: "active", published: "active", archived: "archived" };
const NEXT: Record<string, { to: string; label: string; danger?: boolean }[]> = {
  draft: [{ to: "review", label: "Submit for review" }, { to: "published", label: "Publish now" }],
  review: [{ to: "approved", label: "Approve" }, { to: "draft", label: "Send back to draft" }],
  approved: [{ to: "published", label: "Publish" }, { to: "draft", label: "Back to draft" }],
  published: [{ to: "archived", label: "Archive", danger: true }, { to: "draft", label: "Unpublish (to draft)" }],
  archived: [{ to: "draft", label: "Restore to draft" }],
};
const BLANK = { title: "", category: "policy", summary: "", bodyHtml: "", ownerName: "", linkUrl: "", effectiveDate: "", reviewDate: "", publicTrust: true, toParents: false, toMobile: false, requireAck: false };

async function api(url: string, method = "GET", body?: any) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export default function TrustCentreTab() {
  const [docs, setDocs] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [statusF, setStatusF] = useState("all");
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [history, setHistory] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { const d = await api(`/api/platform/trust`); setDocs(d.documents || []); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = docs.filter((d) => {
    if (statusF !== "all" && d.status !== statusF) return false;
    const s = q.trim().toLowerCase();
    if (s && ![d.title, d.category, d.summary].some((v) => String(v ?? "").toLowerCase().includes(s))) return false;
    return true;
  });

  async function transition(id: string, to: string) {
    setMsg(null);
    try { await api(`/api/platform/trust`, "PATCH", { id, status: to }); setMsg({ k: "ok", t: `Moved to ${to}.` }); load(); if (edit?.id === id) openEdit(id); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function del(d: any) {
    if (!confirm(`Delete "${d.title}"? This removes it and its version history.`)) return;
    try { await api(`/api/platform/trust?id=${d.id}`, "DELETE"); setMsg({ k: "ok", t: "Deleted." }); setEdit(null); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function openEdit(id: string) {
    try { const d = await api(`/api/platform/trust?id=${id}`); const doc = d.document; setEdit({ ...doc, effectiveDate: doc.effectiveDate ? String(doc.effectiveDate).slice(0, 10) : "", reviewDate: doc.reviewDate ? String(doc.reviewDate).slice(0, 10) : "" }); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function saveEdit() {
    setMsg(null);
    try {
      await api(`/api/platform/trust`, "PATCH", {
        id: edit.id, title: edit.title, category: edit.category, summary: edit.summary, bodyHtml: edit.bodyHtml,
        ownerName: edit.ownerName, linkUrl: edit.linkUrl, effectiveDate: edit.effectiveDate || null, reviewDate: edit.reviewDate || null,
        publicTrust: edit.publicTrust, toParents: edit.toParents, toMobile: edit.toMobile, requireAck: edit.requireAck,
      });
      setMsg({ k: "ok", t: "Saved." }); load(); openEdit(edit.id);
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>Document management &amp; Trust Centre</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Author platform documents through their lifecycle (draft → review → approve → publish → archive), with version history and an audit trail. Publish to the public <a className="linklike" href="/trust" target="_blank" rel="noreferrer">Trust Centre</a>, the mobile app, or parents (optionally requiring acknowledgement).</p></div>
          <button onClick={() => setShowNew(true)}>New document</button>
        </div>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : msg.k === "err" ? "err" : "info"}`} style={{ marginTop: 10 }}>{msg.t}</div>}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
          <input placeholder="Search documents…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: "auto" }}>
            <option value="all">All statuses</option>{["draft", "review", "approved", "published", "archived"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{rows.length} of {docs.length}</span>
        </div>
        <table>
          <thead><tr><th>Document</th><th>Category</th><th>Status</th><th>Destinations</th><th>Ver.</th><th>Acks</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td><button className="linklike" onClick={() => openEdit(d.id)}><strong>{d.title}</strong></button>{d.summary ? <div className="muted" style={{ fontSize: 11 }}>{d.summary}</div> : null}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{d.category}</td>
                <td><span className={`badge ${STATUS_TONE[d.status] || "role"}`}>{d.status}</span></td>
                <td style={{ fontSize: 11 }}>{[d.publicTrust && "Public", d.toParents && "Parents", d.toMobile && "Mobile", d.requireAck && "Ack"].filter(Boolean).join(" · ") || <span className="muted">—</span>}</td>
                <td>{d.version}</td>
                <td>{d.ackCount || 0}</td>
                <td className="right">
                  <button className="secondary small" onClick={() => openEdit(d.id)}>Edit</button>{" "}
                  <button className="secondary small" onClick={() => setHistory(d)}>History</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">{docs.length ? "No documents match your filter." : "No documents yet — create the first one."}</td></tr>}
          </tbody>
        </table>
      </div>

      {(showNew || edit) && (
        <div className="modal-overlay" onClick={() => { setShowNew(false); setEdit(null); }}>
          <div className="modal" style={{ maxWidth: 780, width: "96%" }} onClick={(e) => e.stopPropagation()}>
            {showNew ? <NewDoc onClose={() => setShowNew(false)} onCreated={(id: string) => { setShowNew(false); load(); openEdit(id); }} /> : (
              <>
                <div className="flex-between" style={{ alignItems: "flex-start" }}>
                  <div><h2 style={{ margin: 0 }}>{edit.title}</h2><div className="muted" style={{ fontSize: 12 }}>v{edit.version} · <span className={`badge ${STATUS_TONE[edit.status]}`}>{edit.status}</span> · /{edit.slug}</div></div>
                  <button className="secondary small" onClick={() => setEdit(null)}>Close</button>
                </div>
                {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 8 }}>{msg.t}</div>}

                <div className="row" style={{ marginTop: 12 }}>
                  <div style={{ flex: 2 }}><label>Title</label><input value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} /></div>
                  <div><label>Category</label><select value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
                </div>
                <label>Summary</label>
                <input value={edit.summary || ""} onChange={(e) => setEdit({ ...edit, summary: e.target.value })} placeholder="One-line description shown in listings" />
                <label>Body (HTML allowed)</label>
                <textarea value={edit.bodyHtml || ""} onChange={(e) => setEdit({ ...edit, bodyHtml: e.target.value })} rows={8} style={{ width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }} />
                <div className="row" style={{ marginTop: 8 }}>
                  <div><label>Owner</label><input value={edit.ownerName || ""} onChange={(e) => setEdit({ ...edit, ownerName: e.target.value })} /></div>
                  <div><label>External link (optional)</label><input value={edit.linkUrl || ""} onChange={(e) => setEdit({ ...edit, linkUrl: e.target.value })} placeholder="https://…" /></div>
                  <div><label>Effective date</label><input type="date" value={edit.effectiveDate || ""} onChange={(e) => setEdit({ ...edit, effectiveDate: e.target.value })} /></div>
                  <div><label>Review date</label><input type="date" value={edit.reviewDate || ""} onChange={(e) => setEdit({ ...edit, reviewDate: e.target.value })} /></div>
                </div>
                <label style={{ marginTop: 10 }}>Publish destinations</label>
                <div className="chips">
                  {([["publicTrust", "Public Trust Centre"], ["toParents", "Parent portal"], ["toMobile", "Mobile app"], ["requireAck", "Require acknowledgement"]] as [string, string][]).map(([k, l]) => (
                    <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!edit[k]} onChange={(e) => setEdit({ ...edit, [k]: e.target.checked })} /> {l}</label>
                  ))}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                  <button onClick={saveEdit}>Save changes</button>
                  {(NEXT[edit.status] || []).map((n) => (
                    <button key={n.to} className={n.danger ? "danger secondary" : "secondary"} onClick={() => transition(edit.id, n.to)}>{n.label}</button>
                  ))}
                  <button className="danger secondary" style={{ marginLeft: "auto" }} onClick={() => del(edit)}>Delete</button>
                </div>

                {edit.versions?.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div className="muted" style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Version history</div>
                    <table><thead><tr><th>When</th><th>Ver.</th><th>Status</th><th>Note</th></tr></thead>
                      <tbody>{edit.versions.slice(0, 12).map((v: any) => (
                        <tr key={v.id}><td className="muted">{new Date(v.changedAt).toLocaleString()}</td><td>{v.version}</td><td><span className={`badge ${STATUS_TONE[v.status] || "role"}`}>{v.status}</span></td><td className="muted">{v.note || "—"}</td></tr>
                      ))}</tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {history && (
        <div className="modal-overlay" onClick={() => setHistory(null)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between"><h2 style={{ margin: 0 }}>{history.title}</h2><button className="secondary small" onClick={() => setHistory(null)}>Close</button></div>
            <p className="sub">Status: {history.status} · version {history.version} · {history.versionCount} history entries · {history.ackCount || 0} acknowledgements.</p>
            <button className="secondary" onClick={() => { openEdit(history.id); setHistory(null); }}>Open full editor & history</button>
          </div>
        </div>
      )}
    </>
  );
}

function NewDoc({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [f, setF] = useState<any>({ ...BLANK });
  const [err, setErr] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault(); setErr("");
    try { const r = await api(`/api/platform/trust`, "POST", f); onCreated(r.id); }
    catch (e: any) { setErr(e.message); }
  }
  return (
    <>
      <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>New document</h2><button className="secondary small" onClick={onClose}>Close</button></div>
      {err && <div className="notice err" style={{ marginTop: 8 }}>{err}</div>}
      <form onSubmit={create} style={{ marginTop: 12 }}>
        <div className="row">
          <div style={{ flex: 2 }}><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required placeholder="Information Security Policy" /></div>
          <div><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <label>Summary</label>
        <input value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} placeholder="One-line description" />
        <label>Body (HTML allowed)</label>
        <textarea value={f.bodyHtml} onChange={(e) => setF({ ...f, bodyHtml: e.target.value })} rows={6} style={{ width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }} />
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>New documents start as a draft. Set destinations and publish from the editor once ready.</p>
        <button type="submit" style={{ marginTop: 10 }}>Create draft</button>
      </form>
    </>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";

const CATEGORIES = ["policy", "parent_handbook", "student_handbook", "uniform", "behaviour", "attendance", "safeguarding", "transport", "trip", "menu", "term_dates", "newsletter", "emergency", "faq"];
const CAT_LABEL: Record<string, string> = {
  policy: "School policy", parent_handbook: "Parent handbook", student_handbook: "Student handbook", uniform: "Uniform policy",
  behaviour: "Behaviour policy", attendance: "Attendance policy", safeguarding: "Safeguarding", transport: "Transport guidance",
  trip: "Trip information", menu: "Lunch menu", term_dates: "Term dates", newsletter: "Newsletter", emergency: "Emergency procedures", faq: "FAQ",
};
const STATUSES = ["draft", "under_review", "approved", "published", "superseded", "archived"];
const STATUS_BADGE: Record<string, string> = { draft: "archived", under_review: "trial", approved: "trial", published: "active", superseded: "archived", archived: "suspended" };

function blankDoc() {
  return { title: "", description: "", category: "policy", sourceType: "text", parent: true, staff: true, effectiveDate: "", reviewDate: "", expiryDate: "", linkUrl: "", bodyText: "", status: "draft" };
}

export default function KnowledgeTab({ schoolId }: { schoolId: string }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [mailboxes, setMailboxes] = useState<any[]>([]);
  const [form, setForm] = useState<any>(blankDoc());
  const [ingest, setIngest] = useState({ title: "", sourceType: "newsletter", bodyText: "" });
  const [mbox, setMbox] = useState({ address: "", label: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [d, m] = await Promise.all([
      fetch(`/api/schools/${schoolId}/documents`).then((r) => r.json()),
      fetch(`/api/schools/${schoolId}/mailboxes`).then((r) => r.json()),
    ]);
    setDocs(d.documents ?? []);
    setMailboxes(m.mailboxes ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const audienceRoles = [form.parent && "parent", form.staff && "staff"].filter(Boolean);
    const body = { ...form, audienceRoles, effectiveDate: form.effectiveDate || undefined, reviewDate: form.reviewDate || undefined, expiryDate: form.expiryDate || undefined };
    const res = await fetch(`/api/schools/${schoolId}/documents`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Document created." }); setForm(blankDoc()); setShowForm(false); load();
  }
  async function setStatus(id: string, status: string) {
    await fetch(`/api/schools/${schoolId}/documents/${id}/status`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    load();
  }
  async function newVersion(id: string) { await fetch(`/api/schools/${schoolId}/documents/${id}/version`, { method: "POST" }); load(); }
  async function del(id: string) { await fetch(`/api/schools/${schoolId}/documents/${id}`, { method: "DELETE" }); load(); }
  async function doIngest(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/schools/${schoolId}/documents/ingest`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: ingest.title, sourceType: ingest.sourceType, bodyText: ingest.bodyText }) });
    const d = await res.json();
    if (res.ok && !d.error) { setIngest({ title: "", sourceType: "newsletter", bodyText: "" }); setMsg({ kind: "ok", text: "Communication ingested and published (searchable)." }); load(); }
  }
  async function connectMailbox(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/schools/${schoolId}/mailboxes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mbox) });
    setMbox({ address: "", label: "" }); load();
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>Knowledge Hub</h2><p className="sub" style={{ marginBottom: 0 }}>{docs.length} document(s) · only <strong>published</strong> items are searchable by parents</p></div>
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "New document"}</button>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
        {showForm && (
          <form onSubmit={create} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="row">
              <div style={{ flex: 2 }}><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
              <div><label>Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></div>
              <div><label>Source type</label><select value={form.sourceType} onChange={(e) => setForm({ ...form, sourceType: e.target.value })}>{["text", "pdf", "docx", "image", "link", "letter"].map((s) => <option key={s}>{s}</option>)}</select></div>
            </div>
            <label>Description</label>
            <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            {form.sourceType === "link" && <><label>Link URL</label><input value={form.linkUrl} onChange={(e) => setForm({ ...form, linkUrl: e.target.value })} /></>}
            <label>Body text (searchable content — paste extracted text for PDFs/Word)</label>
            <textarea rows={4} value={form.bodyText} onChange={(e) => setForm({ ...form, bodyText: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
            <div className="row" style={{ marginTop: 8 }}>
              <div><label>Effective date</label><input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} /></div>
              <div><label>Review date</label><input type="date" value={form.reviewDate} onChange={(e) => setForm({ ...form, reviewDate: e.target.value })} /></div>
              <div><label>Expiry date</label><input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></div>
            </div>
            <div className="chips" style={{ marginTop: 10 }}>
              <span className="muted" style={{ fontSize: 13 }}>Audience:</span>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.parent} onChange={(e) => setForm({ ...form, parent: e.target.checked })} /> Parents</label>
              <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.staff} onChange={(e) => setForm({ ...form, staff: e.target.checked })} /> Staff</label>
            </div>
            <button type="submit" style={{ marginTop: 14 }}>Create document</button>
          </form>
        )}
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Title</th><th>Category</th><th>Audience</th><th>Ver</th><th>Status</th><th className="right">Lifecycle</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.title}</strong>{d.reviewDate && <div className="muted" style={{ fontSize: 11 }}>review {new Date(d.reviewDate).toLocaleDateString()}</div>}</td>
                <td>{CAT_LABEL[d.category] || d.category}</td>
                <td className="muted" style={{ fontSize: 12 }}>{d.audienceRoles}</td>
                <td>v{d.version}</td>
                <td><span className={`badge ${STATUS_BADGE[d.status]}`}>{d.status}</span></td>
                <td className="right">
                  <select value={d.status} onChange={(e) => setStatus(d.id, e.target.value)} style={{ width: "auto", display: "inline-block", padding: "4px 6px", fontSize: 12 }}>
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>{" "}
                  <button className="secondary small" onClick={() => newVersion(d.id)}>New ver</button>{" "}
                  <button className="danger small" onClick={() => del(d.id)}>×</button>
                </td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={6} className="muted">No documents yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <h2>Ingest newsletter / email</h2>
          <p className="sub">Paste a newsletter or sent parent email to make it searchable.</p>
          <form onSubmit={doIngest}>
            <div className="row">
              <div style={{ flex: 2 }}><label>Title</label><input value={ingest.title} onChange={(e) => setIngest({ ...ingest, title: e.target.value })} required /></div>
              <div><label>Type</label><select value={ingest.sourceType} onChange={(e) => setIngest({ ...ingest, sourceType: e.target.value })}><option value="newsletter">Newsletter</option><option value="email">Email</option></select></div>
            </div>
            <label>Content</label>
            <textarea rows={4} value={ingest.bodyText} onChange={(e) => setIngest({ ...ingest, bodyText: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} required />
            <button type="submit" style={{ marginTop: 10 }}>Ingest &amp; publish</button>
          </form>
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 300 }}>
          <h2>Shared mailboxes</h2>
          <p className="sub">Approved mailboxes whose messages can be ingested.</p>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {mailboxes.map((m) => <li key={m.id}>{m.address}{m.label ? ` (${m.label})` : ""} <span className="badge active">{m.status}</span></li>)}
            {mailboxes.length === 0 && <li className="muted">None connected.</li>}
          </ul>
          <form onSubmit={connectMailbox} style={{ marginTop: 10 }}>
            <div className="row">
              <div><label>Address</label><input type="email" value={mbox.address} onChange={(e) => setMbox({ ...mbox, address: e.target.value })} required /></div>
              <div><label>Label</label><input value={mbox.label} onChange={(e) => setMbox({ ...mbox, label: e.target.value })} /></div>
            </div>
            <button type="submit" style={{ marginTop: 10 }}>Connect mailbox</button>
          </form>
        </div>
      </div>
    </>
  );
}

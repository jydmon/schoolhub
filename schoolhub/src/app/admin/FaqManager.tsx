"use client";

import { useEffect, useState, useCallback } from "react";

// Super-Administrator FAQ management for the platform console. Self-contained
// (own fetch helpers) so it drops into AdminPortal with a single import. Uses
// the existing /api/platform/faqs endpoints (list/create/update/delete/import).

const dtShort = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");
const STATUS_BADGE: Record<string, string> = { published: "active", draft: "trial", archived: "archived" };

async function api(url: string, method = "GET", body?: any) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

const BLANK = { id: "", question: "", answer: "", category: "", status: "published" };

export default function FaqManager() {
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState<any>({ ...BLANK });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [q, setQ] = useState("");
  const [statusF, setStatusF] = useState("all");
  const [importText, setImportText] = useState("");
  const [showImport, setShowImport] = useState(false);

  const load = useCallback(async () => {
    try { const d = await api(`/api/platform/faqs`); setItems(d.items || []); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = items.filter((it) => {
    if (statusF !== "all" && it.status !== statusF) return false;
    const s = q.trim().toLowerCase();
    if (s && ![it.question, it.answer, it.category].some((v) => String(v ?? "").toLowerCase().includes(s))) return false;
    return true;
  });
  const categories = Array.from(new Set(items.map((i) => i.category).filter(Boolean)));

  async function save() {
    setMsg(null);
    try {
      const isEdit = !!f.id;
      if (isEdit) await api(`/api/platform/faqs/${f.id}`, "PUT", { question: f.question, answer: f.answer, category: f.category, status: f.status });
      else await api(`/api/platform/faqs`, "POST", { question: f.question, answer: f.answer, category: f.category, status: f.status });
      setF({ ...BLANK }); setMsg({ k: "ok", t: isEdit ? "FAQ saved." : "FAQ created." }); load();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function setStatus(id: string, status: string) { try { await api(`/api/platform/faqs/${id}`, "PUT", { status }); load(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function del(id: string) { if (!confirm("Delete this FAQ?")) return; try { await api(`/api/platform/faqs/${id}`, "DELETE"); if (f.id === id) setF({ ...BLANK }); load(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function runImport() {
    setMsg(null); const txt = importText.trim(); if (!txt) return;
    let body: any;
    if (txt.startsWith("[") || txt.startsWith("{")) { try { const j = JSON.parse(txt); body = Array.isArray(j) ? { items: j } : j.items ? j : { items: [j] }; } catch { body = { csv: txt }; } }
    else body = { csv: txt };
    try { const d = await api(`/api/platform/faqs/import`, "POST", body); setImportText(""); setShowImport(false); setMsg({ k: "ok", t: `Imported ${d.created} of ${d.total} FAQs.` }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>FAQ management</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Create, categorise, publish/unpublish, archive, delete and bulk-import the FAQs shown to users in Help &amp; support and the mobile app.</p></div>
          <button className="secondary" onClick={() => setShowImport((s) => !s)}>{showImport ? "Hide import" : "Bulk import"}</button>
        </div>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 10 }}>{msg.t}</div>}

        {showImport && (
          <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "#f8fafc" }}>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Paste CSV (<code>question,answer,category,status</code> header) or a JSON array of <code>{`{question, answer, category?, status?}`}</code>.</p>
            <textarea rows={5} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"question,answer,category,status\nHow do I reset my password?,Go to My profile → Security.,Account,published"} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "monospace" }} />
            <button style={{ marginTop: 8 }} onClick={runImport} disabled={!importText.trim()}>Run import</button>
          </div>
        )}

        <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
          <div style={{ flex: 3 }}><label>Question</label><input value={f.question} onChange={(e) => setF({ ...f, question: e.target.value })} placeholder="How do I…?" /></div>
          <div><label>Category</label><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} placeholder="General" list="faq-cats" />
            <datalist id="faq-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist></div>
          <div><label>Status</label><select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
        </div>
        <label>Answer</label>
        <textarea rows={3} value={f.answer} onChange={(e) => setF({ ...f, answer: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} placeholder="The answer users will see…" />
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          <button onClick={save} disabled={!f.question || !f.answer}>{f.id ? "Save changes" : "Add FAQ"}</button>
          {f.id && <button className="secondary" onClick={() => setF({ ...BLANK })}>Cancel edit</button>}
        </div>
      </div>

      <div className="panel">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <input placeholder="Search FAQs…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: "auto" }}><option value="all">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{rows.length} of {items.length}</span>
        </div>
        <table style={{ marginTop: 10 }}>
          <thead><tr><th>Question</th><th>Category</th><th>Status</th><th>Updated</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.id}>
                <td><strong>{it.question}</strong><div className="muted" style={{ fontSize: 12, maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.answer}</div></td>
                <td className="muted">{it.category || "General"}</td>
                <td><span className={`badge ${STATUS_BADGE[it.status] || "trial"}`}>{it.status}</span></td>
                <td className="mono muted" style={{ fontSize: 12 }}>{dtShort(it.updatedAt)}</td>
                <td className="right" style={{ whiteSpace: "nowrap" }}>
                  <button className="small secondary" onClick={() => setF({ id: it.id, question: it.question, answer: it.answer, category: it.category || "", status: it.status })}>Edit</button>{" "}
                  {it.status !== "published" ? <button className="small secondary" onClick={() => setStatus(it.id, "published")}>Publish</button> : <button className="small secondary" onClick={() => setStatus(it.id, "draft")}>Unpublish</button>}{" "}
                  {it.status !== "archived" && <button className="small secondary" onClick={() => setStatus(it.id, "archived")}>Archive</button>}{" "}
                  <button className="small secondary danger" onClick={() => del(it.id)}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">{items.length ? "No FAQs match your filter." : "No FAQs yet — add one or bulk-import."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

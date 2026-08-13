"use client";

import { useCallback, useEffect, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const dtShort = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");
const STATUS_BADGE: Record<string, string> = { open: "trial", in_progress: "trial", waiting: "archived", resolved: "active", closed: "archived" };

export default function HelpSupport({ contactHint }: { contactHint?: string }) {
  const [tab, setTab] = useState<"help" | "mine" | "manage">("help");
  const [canManage, setCanManage] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({ category: "question", subject: "", body: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  // FAQs
  const [faqs, setFaqs] = useState<any[]>([]);
  const [faqAdmin, setFaqAdmin] = useState(false);
  const [allFaqs, setAllFaqs] = useState<any[]>([]);
  const [ff, setFf] = useState<any>({ id: "", question: "", answer: "", category: "", status: "published" });
  const [importText, setImportText] = useState("");
  const [faqMsg, setFaqMsg] = useState("");

  const load = useCallback(async (scope: "mine" | "manage") => {
    const d = await fetch(`/api/support/tickets?scope=${scope}`).then((r) => r.json());
    setTickets(d.tickets ?? []); setCanManage(!!d.canManage);
  }, []);
  const loadFaqs = useCallback(async () => {
    const d = await fetch(`/api/faqs`).then((r) => r.json()).catch(() => ({}));
    setFaqs(d.items ?? []); setFaqAdmin(!!d.canManage);
    if (d.canManage) fetch(`/api/platform/faqs`).then((r) => r.json()).then((x) => setAllFaqs(x.items ?? [])).catch(() => {});
  }, []);
  useEffect(() => { load("mine").then(() => load("manage").then(() => {})); loadFaqs(); }, [load, loadFaqs]);
  useEffect(() => { if (tab === "mine") load("mine"); if (tab === "manage") load("manage"); }, [tab, load]);
  const loadDetail = useCallback(async (id: string) => { const d = await fetch(`/api/support/tickets/${id}`).then((r) => r.json()); setDetail(d); }, []);
  useEffect(() => { if (open) loadDetail(open); }, [open, loadDetail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!form.subject.trim() || !form.body.trim()) { setMsg({ kind: "err", text: "Add a subject and a description." }); return; }
    const res = await fetch(`/api/support/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setForm({ category: "question", subject: "", body: "" }); setMsg({ kind: "ok", text: "Support request raised — you'll be notified when it's answered." }); setTab("mine"); load("mine");
  }
  async function sendReply() {
    if (!reply.trim() || !open) return;
    await fetch(`/api/support/tickets/${open}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply.trim() }) });
    setReply(""); loadDetail(open);
  }
  async function setStatus(status: string) {
    if (!open) return;
    await fetch(`/api/support/tickets/${open}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadDetail(open); load(tab === "manage" ? "manage" : "mine");
  }

  // ---- FAQ admin actions ----
  async function faqSave() {
    setFaqMsg("");
    const isEdit = !!ff.id;
    const url = isEdit ? `/api/platform/faqs/${ff.id}` : `/api/platform/faqs`;
    const res = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ff) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setFaqMsg(d.error || "Failed"); return; }
    setFf({ id: "", question: "", answer: "", category: "", status: "published" }); setFaqMsg(isEdit ? "Saved." : "Created."); loadFaqs();
  }
  async function faqSetStatus(id: string, status: string) {
    await fetch(`/api/platform/faqs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadFaqs();
  }
  async function faqDelete(id: string) {
    await fetch(`/api/platform/faqs/${id}`, { method: "DELETE" });
    loadFaqs();
  }
  async function faqImport() {
    setFaqMsg("");
    const txt = importText.trim();
    if (!txt) return;
    let body: any;
    if (txt.startsWith("[") || txt.startsWith("{")) { try { const j = JSON.parse(txt); body = Array.isArray(j) ? { items: j } : j.items ? j : { items: [j] }; } catch { body = { csv: txt }; } }
    else body = { csv: txt };
    const res = await fetch(`/api/platform/faqs/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setFaqMsg(d.error || "Import failed"); return; }
    setImportText(""); setFaqMsg(`Imported ${d.created} of ${d.total} FAQs.`); loadFaqs();
  }

  if (open && detail) {
    const t = detail.ticket;
    return (
      <>
        <button className="secondary small" onClick={() => { setOpen(null); setDetail(null); }}>← Back</button>
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="flex-between" style={{ alignItems: "flex-start" }}>
            <div><h2 style={{ margin: 0 }}>{t.subject}</h2><div className="muted" style={{ fontSize: 12 }}>{t.category} · raised by {t.userName || t.userEmail} · {dt(t.createdAt)}</div></div>
            <span className={`badge ${STATUS_BADGE[t.status] || "trial"}`}>{t.status.replace(/_/g, " ")}</span>
          </div>
          <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "#fafbfe", marginTop: 12, maxHeight: 380, overflowY: "auto" }}>
            {(detail.messages || []).map((m: any) => (
              <div key={m.id} style={{ textAlign: m.mine ? "right" : "left", margin: "6px 0" }}>
                <div style={{ display: "inline-block", maxWidth: "82%", background: m.mine ? "#4f46e5" : "#fff", color: m.mine ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", fontSize: 13, textAlign: "left" }}>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{m.senderName}{m.senderRole === "support" ? " · support" : ""}</div>
                  <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                  <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{dt(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>
          {t.status !== "closed" && (
            <div className="row" style={{ marginTop: 10 }}>
              <div style={{ flex: 4 }}><input value={reply} onChange={(e) => setReply(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendReply()} placeholder="Write a reply…" /></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={sendReply}>Send</button></div>
            </div>
          )}
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {canManage && !t.isOwner && ["in_progress", "waiting", "resolved"].map((s) => <button key={s} className="secondary small" onClick={() => setStatus(s)}>Mark {s.replace(/_/g, " ")}</button>)}
            {t.status !== "closed" && <button className="secondary small" onClick={() => setStatus("closed")}>Close ticket</button>}
          </div>
        </div>
      </>
    );
  }

  const cats = Array.from(new Set(faqs.map((f) => f.category || "General")));

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Help &amp; support</h2>
        <p className="sub">Find answers, raise a request, and track your tickets.{contactHint ? ` ${contactHint}` : ""}</p>
        <div className="tabs" style={{ marginTop: 6 }}>
          <button className={tab === "help" ? "active" : ""} onClick={() => setTab("help")}>Guides &amp; FAQs</button>
          <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>My tickets</button>
          {canManage && <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>Manage requests</button>}
        </div>
      </div>

      {tab === "help" && (
        <>
          <div className="panel">
            <h2 style={{ fontSize: 16, margin: 0 }}>Frequently asked questions</h2>
            {faqs.length === 0 && <p className="muted" style={{ marginTop: 8 }}>No FAQs published yet.</p>}
            {cats.map((cat) => (
              <div key={cat} style={{ marginTop: 10 }}>
                {cats.length > 1 && <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</div>}
                {faqs.filter((f) => (f.category || "General") === cat).map((it) => (
                  <div key={it.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                    <button className="linklike" style={{ fontSize: 14, fontWeight: 600, textAlign: "left" }} onClick={() => setOpenFaq(openFaq === it.id ? null : it.id)}>{openFaq === it.id ? "▾" : "▸"} {it.question}</button>
                    {openFaq === it.id && (
                      <>
                        <p className="muted" style={{ margin: "6px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{it.answer}</p>
                        <p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>Published {dtShort(it.publishedAt || it.createdAt)} · Updated {dtShort(it.updatedAt)}</p>
                      </>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {faqAdmin && (
            <div className="panel">
              <h2 style={{ fontSize: 16, margin: 0 }}>Manage FAQs (Super Administrator)</h2>
              {faqMsg && <div className={`notice ${faqMsg.includes("fail") || faqMsg.includes("Failed") ? "err" : "ok"}`}>{faqMsg}</div>}
              <div className="row" style={{ marginTop: 8 }}>
                <div style={{ flex: 3 }}><label>Question</label><input value={ff.question} onChange={(e) => setFf({ ...ff, question: e.target.value })} /></div>
                <div><label>Category</label><input value={ff.category} onChange={(e) => setFf({ ...ff, category: e.target.value })} placeholder="General" /></div>
                <div><label>Status</label><select value={ff.status} onChange={(e) => setFf({ ...ff, status: e.target.value })}><option value="published">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div>
              </div>
              <label>Answer</label>
              <textarea rows={3} value={ff.answer} onChange={(e) => setFf({ ...ff, answer: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button onClick={faqSave} disabled={!ff.question || !ff.answer}>{ff.id ? "Save changes" : "Add FAQ"}</button>
                {ff.id && <button className="secondary" onClick={() => setFf({ id: "", question: "", answer: "", category: "", status: "published" })}>Cancel edit</button>}
              </div>

              <details style={{ marginTop: 12 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Bulk import</summary>
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Paste CSV (<code>question,answer,category,status</code> header) or a JSON array of <code>{`{question, answer, category?, status?}`}</code>.</p>
                <textarea rows={5} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={"question,answer,category,status\nHow do I reset my password?,Go to My profile → Security.,Account,published"} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 12, fontFamily: "monospace" }} />
                <button style={{ marginTop: 8 }} onClick={faqImport} disabled={!importText.trim()}>Import FAQs</button>
              </details>

              <table style={{ marginTop: 12 }}>
                <thead><tr><th>Question</th><th>Category</th><th>Status</th><th>Updated</th><th className="right"></th></tr></thead>
                <tbody>
                  {allFaqs.map((f) => (
                    <tr key={f.id}>
                      <td><strong>{f.question}</strong></td>
                      <td className="muted">{f.category || "General"}</td>
                      <td><span className={`badge ${f.status === "published" ? "active" : f.status === "archived" ? "archived" : "trial"}`}>{f.status}</span></td>
                      <td className="mono muted" style={{ fontSize: 12 }}>{dtShort(f.updatedAt)}</td>
                      <td className="right" style={{ whiteSpace: "nowrap" }}>
                        <button className="small secondary" onClick={() => setFf({ id: f.id, question: f.question, answer: f.answer, category: f.category || "", status: f.status })}>Edit</button>{" "}
                        {f.status !== "published" ? <button className="small secondary" onClick={() => faqSetStatus(f.id, "published")}>Publish</button> : <button className="small secondary" onClick={() => faqSetStatus(f.id, "draft")}>Unpublish</button>}{" "}
                        {f.status !== "archived" && <button className="small secondary" onClick={() => faqSetStatus(f.id, "archived")}>Archive</button>}{" "}
                        <button className="small secondary" onClick={() => faqDelete(f.id)}>Delete</button>
                      </td>
                    </tr>
                  ))}
                  {allFaqs.length === 0 && <tr><td colSpan={5} className="muted">No FAQs yet.</td></tr>}
                </tbody>
              </table>
            </div>
          )}

          <div className="panel">
            <h2 style={{ fontSize: 16, margin: 0 }}>Submit a support request</h2>
            {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
            <form onSubmit={submit} style={{ marginTop: 8 }}>
              <div className="row">
                <div><label>Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option value="question">Question</option><option value="issue">Issue</option><option value="bug">Report a bug</option><option value="account">Account</option><option value="other">Other</option></select></div>
                <div style={{ flex: 3 }}><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary" /></div>
              </div>
              <label>Description</label>
              <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} placeholder="Tell us what's happening, and any steps to reproduce…" />
              <button type="submit" style={{ marginTop: 12 }}>Submit request</button>
            </form>
          </div>
        </>
      )}

      {(tab === "mine" || tab === "manage") && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>{tab === "manage" ? "Support requests for your school" : "My support requests"}</h2>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>Subject</th><th>Category</th>{tab === "manage" && <th>From</th>}<th>Status</th><th>Updated</th><th className="right"></th></tr></thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.id}>
                  <td><strong>{t.subject}</strong></td><td className="muted">{t.category}</td>
                  {tab === "manage" && <td className="muted">{t.userName || t.userEmail}</td>}
                  <td><span className={`badge ${STATUS_BADGE[t.status] || "trial"}`}>{t.status.replace(/_/g, " ")}</span></td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{new Date(t.updatedAt).toLocaleDateString()}</td>
                  <td className="right"><button className="small" onClick={() => setOpen(t.id)}>Open</button></td>
                </tr>
              ))}
              {tickets.length === 0 && <tr><td colSpan={tab === "manage" ? 6 : 5} className="muted">No tickets{tab === "manage" ? " for your school" : " yet"}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

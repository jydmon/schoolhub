"use client";

import { useCallback, useEffect, useState } from "react";
import { Kebab, useSort, SortTh } from "@/components/TableKit";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const dtShort = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");

const STATUS_BADGE: Record<string, string> = {
  open: "trial", acknowledged: "trial", assigned: "role", in_progress: "role",
  pending_user: "archived", pending_third_party: "archived", waiting: "archived",
  resolved: "active", closed: "archived", reopened: "suspended",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open", acknowledged: "Acknowledged", assigned: "Assigned", in_progress: "In Progress",
  pending_user: "Pending User", pending_third_party: "Pending Third-Party", waiting: "Pending User",
  resolved: "Resolved", closed: "Closed", reopened: "Reopened",
};
// Full 9-state lifecycle offered to support staff.
const LIFECYCLE = ["acknowledged", "assigned", "in_progress", "pending_user", "pending_third_party", "resolved", "closed"];
const PRIORITIES: [string, string][] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]];
const SEVERITIES: [string, string][] = [["minor", "Minor"], ["normal", "Normal"], ["major", "Major"], ["critical", "Critical"]];
const PRIORITY_BADGE: Record<string, string> = { low: "role", medium: "trial", high: "suspended", critical: "suspended" };
const CATEGORY_SUBS: Record<string, string[]> = {
  question: ["How-to", "Account", "Billing", "Other"], issue: ["Login", "Data", "Performance", "Notifications", "Other"],
  bug: ["Web app", "Mobile app", "Report/export", "Other"], account: ["Password", "Role/permissions", "New user", "Other"],
  billing: ["Invoice", "Subscription", "Refund", "Other"], other: [],
};
function slaBadge(t: any): { tone: string; label: string } | null {
  switch (t.slaState) {
    case "breached": return { tone: "suspended", label: "SLA breached" };
    case "due_soon": return { tone: "trial", label: `Due in ${Math.max(0, Math.round((t.slaMinutesLeft || 0) / 60))}h` };
    case "ok": return t.slaMinutesLeft != null ? { tone: "role", label: `SLA ${Math.round((t.slaMinutesLeft || 0) / 60)}h` } : null;
    case "met": return { tone: "active", label: "Within SLA" };
    default: return null;
  }
}
async function filesToAttachments(files: FileList | null): Promise<any[]> {
  if (!files) return [];
  const out: any[] = [];
  for (const f of Array.from(files).slice(0, 4)) {
    if (f.size > 1_600_000) continue; // ~1.6MB cap per file
    const dataUrl: string = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(String(r.result || "")); r.readAsDataURL(f); });
    out.push({ name: f.name, type: f.type, dataUrl });
  }
  return out;
}
const isImage = (a: any) => (a.type || "").startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name || "");

export default function HelpSupport({ contactHint }: { contactHint?: string }) {
  const [tab, setTab] = useState<"help" | "mine" | "manage" | "reports">("help");
  const [canManage, setCanManage] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [replyInternal, setReplyInternal] = useState(false);
  const [replyFiles, setReplyFiles] = useState<any[]>([]);
  const [form, setForm] = useState<any>({ category: "question", subcategory: "", priority: "medium", severity: "normal", subject: "", body: "" });
  const [formFiles, setFormFiles] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [openFaq, setOpenFaq] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState(""); const [fPriority, setFPriority] = useState(""); const [fq, setFq] = useState("");
  const [mineQ, setMineQ] = useState("");
  const srt = useSort("updated", -1);
  const [report, setReport] = useState<any>(null);

  // FAQs
  const [faqs, setFaqs] = useState<any[]>([]);
  const [faqAdmin, setFaqAdmin] = useState(false);
  const [allFaqs, setAllFaqs] = useState<any[]>([]);
  const [ff, setFf] = useState<any>({ id: "", question: "", answer: "", category: "", status: "published" });
  const [importText, setImportText] = useState("");
  const [faqMsg, setFaqMsg] = useState("");

  const load = useCallback(async (scope: "mine" | "manage") => {
    const qs = new URLSearchParams({ scope });
    if (scope === "manage") { if (fStatus) qs.set("status", fStatus); if (fPriority) qs.set("priority", fPriority); if (fq.trim()) qs.set("q", fq.trim()); }
    const d = await fetch(`/api/support/tickets?${qs}`).then((r) => r.json());
    setTickets(d.tickets ?? []);
    // Only ever raise canManage — the "mine" scope response doesn't assert
    // management rights, so it must not clear the Manage/Reports tabs once the
    // "manage" scope has established the user can manage. (Fixes the tabs
    // disappearing after opening "My tickets".)
    setCanManage((prev) => prev || !!d.canManage);
  }, [fStatus, fPriority, fq]);
  const loadFaqs = useCallback(async () => {
    const d = await fetch(`/api/faqs`).then((r) => r.json()).catch(() => ({}));
    setFaqs(d.items ?? []); setFaqAdmin(!!d.canManage);
    if (d.canManage) fetch(`/api/platform/faqs`).then((r) => r.json()).then((x) => setAllFaqs(x.items ?? [])).catch(() => {});
  }, []);
  const loadReport = useCallback(async () => { const d = await fetch(`/api/support/reports`).then((r) => r.json()).catch(() => ({})); setReport(d.report ?? null); }, []);
  useEffect(() => { load("mine").then(() => load("manage")); loadFaqs(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (tab === "mine") load("mine"); if (tab === "manage") load("manage"); if (tab === "reports") loadReport(); }, [tab, load, loadReport]);
  const loadDetail = useCallback(async (id: string) => { const d = await fetch(`/api/support/tickets/${id}`).then((r) => r.json()); setDetail(d); }, []);
  useEffect(() => { if (open) loadDetail(open); }, [open, loadDetail]);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!form.subject.trim() || !form.body.trim()) { setMsg({ kind: "err", text: "Add a subject and a description." }); return; }
    const res = await fetch(`/api/support/tickets`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, attachments: formFiles }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setForm({ category: "question", subcategory: "", priority: "medium", subject: "", body: "" }); setFormFiles([]);
    setMsg({ kind: "ok", text: `Request ${d.ticket?.reference || ""} raised — you'll be notified when it's answered.` }); setTab("mine"); load("mine");
  }
  async function sendReply() {
    if ((!reply.trim() && !replyFiles.length) || !open) return;
    await fetch(`/api/support/tickets/${open}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: reply.trim(), internal: replyInternal, attachments: replyFiles }) });
    setReply(""); setReplyFiles([]); setReplyInternal(false); loadDetail(open);
  }
  async function patch(payload: any) {
    if (!open) return;
    await fetch(`/api/support/tickets/${open}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    loadDetail(open); load(tab === "manage" ? "manage" : "mine");
  }

  // ---- FAQ admin actions (unchanged) ----
  async function faqSave() {
    setFaqMsg("");
    const isEdit = !!ff.id;
    const url = isEdit ? `/api/platform/faqs/${ff.id}` : `/api/platform/faqs`;
    const res = await fetch(url, { method: isEdit ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ff) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setFaqMsg(d.error || "Failed"); return; }
    setFf({ id: "", question: "", answer: "", category: "", status: "published" }); setFaqMsg(isEdit ? "Saved." : "Created."); loadFaqs();
  }
  async function faqSetStatus(id: string, status: string) { await fetch(`/api/platform/faqs/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); loadFaqs(); }
  async function faqDelete(id: string) { await fetch(`/api/platform/faqs/${id}`, { method: "DELETE" }); loadFaqs(); }
  async function faqImport() {
    setFaqMsg(""); const txt = importText.trim(); if (!txt) return;
    let body: any;
    if (txt.startsWith("[") || txt.startsWith("{")) { try { const j = JSON.parse(txt); body = Array.isArray(j) ? { items: j } : j.items ? j : { items: [j] }; } catch { body = { csv: txt }; } } else body = { csv: txt };
    const res = await fetch(`/api/platform/faqs/import`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setFaqMsg(d.error || "Import failed"); return; }
    setImportText(""); setFaqMsg(`Imported ${d.created} of ${d.total} FAQs.`); loadFaqs();
  }

  // ---------- Ticket detail ----------
  if (open && detail) {
    const t = detail.ticket;
    const manage = t.canManage;
    const sla = slaBadge(t);
    return (
      <>
        <button className="secondary small" onClick={() => { setOpen(null); setDetail(null); }}>← Back</button>
        <div className="panel" style={{ marginTop: 10 }}>
          <div className="flex-between" style={{ alignItems: "flex-start" }}>
            <div>
              <h2 style={{ margin: 0 }}>{t.subject}</h2>
              <div className="muted" style={{ fontSize: 12 }}>{t.reference} · {t.category}{t.subcategory ? ` / ${t.subcategory}` : ""} · raised by {t.userName || t.userEmail} · {dt(t.createdAt)}{t.assignedToName ? ` · assigned to ${t.assignedToName}` : ""}</div>
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className={`badge ${PRIORITY_BADGE[t.priority] || "trial"}`}>{t.priority}</span>
              <span className="badge role" title="Severity">sev: {t.severity || "normal"}</span>
              {t.escalated ? <span className="badge suspended">escalated</span> : null}
              {sla ? <span className={`badge ${sla.tone}`}>{sla.label}</span> : null}
              <span className={`badge ${STATUS_BADGE[t.status] || "trial"}`}>{STATUS_LABEL[t.status] || t.status}</span>
            </div>
          </div>

          <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "#fafbfe", marginTop: 12, maxHeight: 420, overflowY: "auto" }}>
            {(detail.messages || []).map((m: any) => (
              <div key={m.id} style={{ textAlign: m.mine ? "right" : "left", margin: "6px 0" }}>
                <div style={{ display: "inline-block", maxWidth: "84%", background: m.internal ? "#fff7ed" : m.mine ? "#4f46e5" : "#fff", color: m.internal ? "#9a3412" : m.mine ? "#fff" : "var(--ink)", border: m.internal ? "1px solid #fdba74" : "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", fontSize: 13, textAlign: "left" }}>
                  <div style={{ fontSize: 11, opacity: 0.75 }}>{m.senderName}{m.senderRole === "support" ? " · support" : ""}{m.internal ? " · internal note" : ""}</div>
                  {m.body && m.body !== "(attachment)" ? <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div> : null}
                  {(m.attachments || []).length ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                    {m.attachments.map((a: any, i: number) => isImage(a)
                      ? <a key={i} href={a.dataUrl} target="_blank" rel="noreferrer"><img src={a.dataUrl} alt={a.name} style={{ maxWidth: 120, maxHeight: 90, borderRadius: 6, border: "1px solid var(--line)" }} /></a>
                      : <a key={i} href={a.dataUrl} download={a.name} className="badge role" style={{ textDecoration: "none" }}>📎 {a.name}</a>)}
                  </div> : null}
                  <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{dt(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </div>

          {t.status !== "closed" && (
            <div style={{ marginTop: 10 }}>
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} placeholder={replyInternal ? "Internal note (not visible to the requester)…" : "Write a reply…"} rows={2} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
              <div className="row" style={{ marginTop: 6, alignItems: "center" }}>
                <div><input type="file" multiple accept="image/*,.pdf,.txt,.csv" onChange={async (e) => setReplyFiles(await filesToAttachments(e.target.files))} /></div>
                {manage ? <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={replyInternal} onChange={(e) => setReplyInternal(e.target.checked)} /> Internal note</label> : null}
                <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end" }}><button onClick={sendReply}>Send</button></div>
              </div>
              {replyFiles.length ? <div className="muted" style={{ fontSize: 11 }}>{replyFiles.length} attachment(s) ready</div> : null}
            </div>
          )}

          {manage && (
            <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Support actions</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <select value="" onChange={(e) => e.target.value && patch({ status: e.target.value })}>
                  <option value="">Set status…</option>
                  {LIFECYCLE.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                  {t.status !== "open" && <option value="reopened">Reopen</option>}
                </select>
                <select value={t.priority} onChange={(e) => patch({ priority: e.target.value })}>
                  {PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l} priority</option>)}
                </select>
                <select value={t.severity || "normal"} onChange={(e) => patch({ severity: e.target.value })}>
                  {SEVERITIES.map(([k, l]) => <option key={k} value={k}>{l} severity</option>)}
                </select>
                <button className="secondary small" onClick={() => patch({ assignToMe: true })}>Assign to me</button>
                <button className={`secondary small${t.escalated ? " danger" : ""}`} onClick={() => patch({ escalated: !t.escalated })}>{t.escalated ? "De-escalate" : "Escalate"}</button>
              </div>
            </div>
          )}
          {!manage && t.status !== "closed" && (
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button className="secondary small" onClick={() => patch({ status: "closed" })}>Close ticket</button>
              {(t.status === "resolved") && <button className="secondary small" onClick={() => patch({ status: "reopened" })}>Reopen</button>}
            </div>
          )}
        </div>
      </>
    );
  }

  const cats = Array.from(new Set(faqs.map((f) => f.category || "General")));
  const subs = CATEGORY_SUBS[form.category] || [];

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Help &amp; support</h2>
        <p className="sub">Find answers, raise a request, and track your tickets.{contactHint ? ` ${contactHint}` : ""}</p>
        <div className="tabs" style={{ marginTop: 6 }}>
          <button className={tab === "help" ? "active" : ""} onClick={() => setTab("help")}>Guides &amp; FAQs</button>
          <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>My tickets</button>
          {canManage && <button className={tab === "manage" ? "active" : ""} onClick={() => setTab("manage")}>Manage requests</button>}
          {canManage && <button className={tab === "reports" ? "active" : ""} onClick={() => setTab("reports")}>Reports</button>}
        </div>
      </div>

      {tab === "help" && (
        <>
          <div className="panel">
            <h2 style={{ fontSize: 16, margin: 0 }}>Submit a support request</h2>
            {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
            <form onSubmit={submit} style={{ marginTop: 8 }}>
              <div className="row">
                <div><label>Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, subcategory: "" })}><option value="question">Question</option><option value="issue">Issue</option><option value="bug">Report a bug</option><option value="account">Account</option><option value="billing">Billing</option><option value="other">Other</option></select></div>
                {subs.length > 0 && <div><label>Subcategory</label><select value={form.subcategory} onChange={(e) => setForm({ ...form, subcategory: e.target.value })}><option value="">—</option>{subs.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>}
                <div><label>Priority</label><select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>{PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div><label>Severity</label><select value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>{SEVERITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
                <div style={{ flex: 3 }}><label>Subject</label><input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Brief summary" /></div>
              </div>
              <label>Description</label>
              <textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} placeholder="Tell us what's happening, and any steps to reproduce…" />
              <label style={{ marginTop: 8 }}>Attach screenshots / files (optional)</label>
              <input type="file" multiple accept="image/*,.pdf,.txt,.csv" onChange={async (e) => setFormFiles(await filesToAttachments(e.target.files))} />
              {formFiles.length ? <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{formFiles.length} file(s) attached</span> : null}
              <div><button type="submit" style={{ marginTop: 12 }}>Submit request</button></div>
            </form>
          </div>

          <div className="panel">
            <h2 style={{ fontSize: 16, margin: 0 }}>Frequently asked questions</h2>
            {faqs.length === 0 && <p className="muted" style={{ marginTop: 8 }}>No FAQs published yet.</p>}
            {cats.map((cat) => (
              <div key={cat} style={{ marginTop: 10 }}>
                {cats.length > 1 && <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em" }}>{cat}</div>}
                {faqs.filter((f) => (f.category || "General") === cat).map((it) => (
                  <div key={it.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                    <button className="linklike" style={{ fontSize: 14, fontWeight: 600, textAlign: "left" }} onClick={() => setOpenFaq(openFaq === it.id ? null : it.id)}>{openFaq === it.id ? "▾" : "▸"} {it.question}</button>
                    {openFaq === it.id && (<><p className="muted" style={{ margin: "6px 0 0", fontSize: 13, whiteSpace: "pre-wrap" }}>{it.answer}</p><p className="muted" style={{ margin: "4px 0 0", fontSize: 11 }}>Published {dtShort(it.publishedAt || it.createdAt)} · Updated {dtShort(it.updatedAt)}</p></>)}
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

        </>
      )}

      {(tab === "mine" || tab === "manage") && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>{tab === "manage" ? "Support requests for your school" : "My support requests"}</h2>
          {tab === "manage" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "10px 0" }}>
              <input placeholder="Search subject or SH-ref…" value={fq} onChange={(e) => setFq(e.target.value)} style={{ maxWidth: 220 }} />
              <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ width: "auto" }}><option value="">All statuses</option>{Object.keys(STATUS_LABEL).filter((k) => k !== "waiting").map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
              <select value={fPriority} onChange={(e) => setFPriority(e.target.value)} style={{ width: "auto" }}><option value="">All priorities</option>{PRIORITIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              <button className="secondary small" onClick={() => load("manage")}>Apply</button>
            </div>
          )}
          {tab === "mine" && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "10px 0" }}>
              <input placeholder="Search my tickets…" value={mineQ} onChange={(e) => setMineQ(e.target.value)} style={{ maxWidth: 240 }} />
              <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{tickets.length} ticket(s)</span>
            </div>
          )}
          <table style={{ marginTop: 8 }}>
            <thead><tr><SortTh k="ref" label="Ref" sort={srt} /><SortTh k="subject" label="Subject" sort={srt} /><SortTh k="priority" label="Priority" sort={srt} />{tab === "manage" && <th>From</th>}<th>SLA</th><SortTh k="status" label="Status" sort={srt} /><SortTh k="updated" label="Updated" sort={srt} /><th className="right">Actions</th></tr></thead>
            <tbody>
              {srt.sort(
                (tab === "mine" && mineQ.trim() ? tickets.filter((t) => [t.reference, t.subject, t.category, t.status].some((v) => String(v ?? "").toLowerCase().includes(mineQ.trim().toLowerCase()))) : tickets),
                (t, k) => k === "ref" ? String(t.reference ?? "") : k === "subject" ? String(t.subject ?? "").toLowerCase() : k === "priority" ? ({ low: 0, medium: 1, high: 2, critical: 3 } as any)[t.priority] ?? 0 : k === "status" ? String(t.status ?? "") : k === "updated" ? (t.updatedAt || "") : ""
              ).map((t) => { const sla = slaBadge(t); return (
                <tr key={t.id}>
                  <td className="mono muted" style={{ fontSize: 12 }}>{t.reference}</td>
                  <td><strong>{t.subject}</strong>{t.escalated ? <span className="badge suspended" style={{ marginLeft: 6 }}>escalated</span> : null}<div className="muted" style={{ fontSize: 11 }}>{t.category}{t.subcategory ? ` / ${t.subcategory}` : ""}</div></td>
                  <td><span className={`badge ${PRIORITY_BADGE[t.priority] || "trial"}`}>{t.priority}</span></td>
                  {tab === "manage" && <td className="muted">{t.userName || t.userEmail}{t.assignedToName ? <div style={{ fontSize: 11 }}>→ {t.assignedToName}</div> : null}</td>}
                  <td>{sla ? <span className={`badge ${sla.tone}`}>{sla.label}</span> : <span className="muted">—</span>}</td>
                  <td><span className={`badge ${STATUS_BADGE[t.status] || "trial"}`}>{STATUS_LABEL[t.status] || t.status}</span></td>
                  <td className="mono muted" style={{ fontSize: 12 }}>{new Date(t.updatedAt).toLocaleDateString()}</td>
                  <td className="right"><Kebab items={[
                    { label: "Open", onClick: () => setOpen(t.id) },
                    { label: "Copy reference", onClick: () => { try { navigator.clipboard?.writeText(t.reference || ""); } catch { /* ignore */ } } },
                  ]} /></td>
                </tr>
              ); })}
              {tickets.length === 0 && <tr><td colSpan={tab === "manage" ? 8 : 7} className="muted">No tickets{tab === "manage" ? " for your school" : " yet"}.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === "reports" && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>Support reports</h2>
          {!report ? <p className="muted" style={{ marginTop: 8 }}>Loading…</p> : (
            <>
              <div className="stat-grid" style={{ marginTop: 10 }}>
                <div className="stat"><div className="n">{report.total}</div><div className="l">Total tickets</div></div>
                <div className="stat"><div className="n">{report.open}</div><div className="l">Open</div></div>
                <div className="stat"><div className="n">{report.closed}</div><div className="l">Resolved / closed</div></div>
                <div className="stat"><div className="n">{report.breached}</div><div className="l">SLA breached</div></div>
                <div className="stat"><div className="n">{report.slaCompliance}%</div><div className="l">SLA compliance</div></div>
                <div className="stat"><div className="n">{report.avgResolutionHours == null ? "—" : `${report.avgResolutionHours}h`}</div><div className="l">Avg resolution</div></div>
              </div>
              <div className="row" style={{ marginTop: 14, gap: 16, flexWrap: "wrap" }}>
                <MiniTable title="By status" rows={report.byStatusLabelled} />
                <MiniTable title="By priority" rows={report.byPriorityLabelled} />
                <MiniTable title="By category" rows={report.byCategoryLabelled} />
                <MiniTable title="By school" rows={report.bySchoolLabelled} />
                <MiniTable title="Team workload" rows={report.byAssigneeLabelled} />
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

function MiniTable({ title, rows }: { title: string; rows: { label: string; value: number }[] }) {
  return (
    <div style={{ minWidth: 200, flex: 1 }}>
      <div className="muted" style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{title}</div>
      <table><tbody>
        {(rows || []).length === 0 ? <tr><td className="muted">No data</td></tr> : rows.map((r) => (
          <tr key={r.label}><td>{r.label}</td><td className="right"><strong>{r.value}</strong></td></tr>
        ))}
      </tbody></table>
    </div>
  );
}

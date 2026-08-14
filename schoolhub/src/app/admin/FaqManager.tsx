"use client";

import { useEffect, useState, useCallback } from "react";
import { Kebab, useSort, SortTh } from "@/components/TableKit";

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

// 20 starter FAQs — loaded on demand and fully editable afterwards (item A7).
const SEED_FAQS = [
  { question: "How do I reset my password?", answer: "Go to My profile → My security and use the reset option, or click 'Forgot password?' on the sign-in page.", category: "Account", status: "published" },
  { question: "How do I enable two-factor authentication (2FA)?", answer: "Open My security, choose 'Set up authenticator app', scan the code and enter the 6-digit code to confirm.", category: "Account", status: "published" },
  { question: "How do I update my contact details?", answer: "Open My profile and edit your name, phone and photo. Your email is managed by your school.", category: "Account", status: "published" },
  { question: "How do I change my notification preferences?", answer: "Go to My preferences (or Notifications & contact preferences on mobile) to choose channels and categories.", category: "Notifications", status: "published" },
  { question: "Why am I not receiving notifications?", answer: "Check your delivery channels under preferences, and make sure the relevant category is switched on. Emergency alerts are always delivered.", category: "Notifications", status: "published" },
  { question: "How do I see my child's timetable?", answer: "Parents: open Timetable in your portal to see the current week for each child.", category: "Parents", status: "published" },
  { question: "How do I report my child's absence?", answer: "Use the Transport or Notifications area to submit an absence, or contact the school office.", category: "Parents", status: "published" },
  { question: "Where can I see my child's clubs and attendance?", answer: "Open Clubs & activities in the parent portal to see enrolments and attendance for each child.", category: "Parents", status: "published" },
  { question: "How do I view school meals and allergens?", answer: "Open Menu in the parent portal to see the weekly menu, dietary options and allergen information.", category: "Parents", status: "published" },
  { question: "How do I message my school?", answer: "Use Messaging in your portal to start a secure conversation with the relevant staff.", category: "Communication", status: "published" },
  { question: "How do I raise a support ticket?", answer: "Open Help & support → Submit a support request, choose a category, priority and severity, and describe the issue.", category: "Support", status: "published" },
  { question: "How do I track a support ticket?", answer: "Open Help & support → My tickets to see the status, replies and reference (SH-XXXXXX) of each request.", category: "Support", status: "published" },
  { question: "How do I accept a school policy?", answer: "When a policy needs your acknowledgement you'll see a prompt at the top of your portal — open it, read the policy and select 'I have read & understood'.", category: "Policies", status: "published" },
  { question: "Where can I read published policies?", answer: "Open Trust & policies (parents) or the Policies prompt shown in your portal. Published policies are always available to read.", category: "Policies", status: "published" },
  { question: "How do I add a new user (staff)?", answer: "School Administrators: open Users & roles → Add user, set a role, and either set a password or send an email invite.", category: "Administration", status: "published" },
  { question: "How do I create a custom role?", answer: "School Administrators: open Access management → Roles & permissions → Create role, then set feature, page and CRUD permissions.", category: "Administration", status: "published" },
  { question: "How do I import data from a spreadsheet?", answer: "Most modules (students, staff, vehicles, clubs, menus) have an Import CSV option; download the template, fill it in and upload.", category: "Administration", status: "published" },
  { question: "How do I generate and export a report?", answer: "Open Reports & search, choose a report and download it as PDF, Excel or CSV.", category: "Reports", status: "published" },
  { question: "How do I search across the portal?", answer: "Use Reports & search (staff) or Search (parents) to find pupils, staff, events, clubs, documents and more. Results can be downloaded as CSV.", category: "Reports", status: "published" },
  { question: "Who do I contact for urgent help?", answer: "Raise a High or Critical priority support ticket, or contact your school office directly for time-sensitive matters.", category: "Support", status: "published" },
];

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

  const srt = useSort("updated", -1);
  const rows = items.filter((it) => {
    if (statusF !== "all" && it.status !== statusF) return false;
    const s = q.trim().toLowerCase();
    if (s && ![it.question, it.answer, it.category].some((v) => String(v ?? "").toLowerCase().includes(s))) return false;
    return true;
  });
  const view = srt.sort(rows, (it, k) => k === "question" ? String(it.question ?? "").toLowerCase() : k === "category" ? String(it.category ?? "").toLowerCase() : k === "status" ? String(it.status ?? "") : k === "updated" ? (it.updatedAt || "") : "");
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
  async function seedStarter() {
    setMsg(null);
    try { const d = await api(`/api/platform/faqs/import`, "POST", { items: SEED_FAQS }); setMsg({ k: "ok", t: `Loaded ${d.created} starter FAQ(s).` }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function runImport() {
    setMsg(null); const txt = importText.trim(); if (!txt) return;
    let body: any;
    if (txt.startsWith("[") || txt.startsWith("{")) { try { const j = JSON.parse(txt); body = Array.isArray(j) ? { items: j } : j.items ? j : { items: [j] }; } catch { body = { csv: txt }; } }
    else body = { csv: txt };
    try { const d = await api(`/api/platform/faqs/import`, "POST", body); setImportText(""); setShowImport(false); setMsg({ k: "ok", t: `Imported ${d.created} of ${d.total} FAQs.` }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  // Downloadable import template (CSV — opens directly in Excel/Sheets).
  function downloadTemplate() {
    const rows = [
      ["question", "answer", "category", "status"],
      ["How do I reset my password?", "Go to My profile → My security and use the reset option.", "Account", "published"],
      ["Where can I see the school calendar?", "Open the Calendar tab in your portal.", "Parents", "published"],
    ];
    const csv = rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "faq-import-template.csv"; a.click(); URL.revokeObjectURL(url);
  }
  // Validate an uploaded file against the template BEFORE processing.
  async function onFile(file: File) {
    setMsg(null);
    let text = "";
    try { text = await file.text(); } catch { setMsg({ k: "err", t: "Couldn't read that file." }); return; }
    const trimmed = text.replace(/^﻿/, "").trim();
    if (!trimmed) { setMsg({ k: "err", t: "That file is empty." }); return; }
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) { setImportText(trimmed); setShowImport(true); setMsg({ k: "ok", t: "JSON file loaded — review below, then Run import." }); return; }
    const header = (trimmed.split(/\r?\n/)[0] || "").toLowerCase();
    const cols = header.split(",").map((c) => c.replace(/^"|"$/g, "").trim());
    if (!cols.includes("question") || !cols.includes("answer")) {
      setMsg({ k: "err", t: "This file doesn't match the template. The first row must include at least ‘question’ and ‘answer’ columns — download the template to see the expected format." });
      return;
    }
    setImportText(trimmed); setShowImport(true);
    setMsg({ k: "ok", t: "File validated against the template — review below, then Run import." });
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>FAQ management</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Create, categorise, publish/unpublish, archive, delete and bulk-import the FAQs shown to users in Help &amp; support and the mobile app.</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            {items.length === 0 && <button className="secondary" onClick={seedStarter}>Load 20 starter FAQs</button>}
            <button className="secondary" onClick={downloadTemplate}>Download template</button>
            <button className="secondary" onClick={() => setShowImport((s) => !s)}>{showImport ? "Hide import" : "Bulk import"}</button>
          </div>
        </div>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 10 }}>{msg.t}</div>}

        {showImport && (
          <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 8, padding: 12, background: "#f8fafc" }}>
            <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Upload a file (validated against the template) or paste CSV (<code>question,answer,category,status</code> header) or a JSON array of <code>{`{question, answer, category?, status?}`}</code>. Not sure of the format? Use <button className="linklike" style={{ fontSize: 12 }} onClick={downloadTemplate}>Download template</button>.</p>
            <input type="file" accept=".csv,.txt,.json,text/csv,application/json" onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.currentTarget.value = ""; }} style={{ marginBottom: 8 }} />
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
          <thead><tr><SortTh k="question" label="Question" sort={srt} /><SortTh k="category" label="Category" sort={srt} /><SortTh k="status" label="Status" sort={srt} /><SortTh k="updated" label="Updated" sort={srt} /><th className="right">Actions</th></tr></thead>
          <tbody>
            {view.map((it) => (
              <tr key={it.id}>
                <td><strong>{it.question}</strong><div className="muted" style={{ fontSize: 12, maxWidth: 460, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.answer}</div></td>
                <td className="muted">{it.category || "General"}</td>
                <td><span className={`badge ${STATUS_BADGE[it.status] || "trial"}`}>{it.status}</span></td>
                <td className="mono muted" style={{ fontSize: 12 }}>{dtShort(it.updatedAt)}</td>
                <td className="right"><Kebab items={[
                  { label: "Edit", onClick: () => setF({ id: it.id, question: it.question, answer: it.answer, category: it.category || "", status: it.status }) },
                  it.status !== "published" ? { label: "Publish", onClick: () => setStatus(it.id, "published") } : { label: "Unpublish", onClick: () => setStatus(it.id, "draft") },
                  it.status !== "archived" ? { label: "Archive", onClick: () => setStatus(it.id, "archived") } : { label: "Restore to draft", onClick: () => setStatus(it.id, "draft") },
                  { label: "Delete", onClick: () => del(it.id), danger: true },
                ]} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={5} className="muted">{items.length ? "No FAQs match your filter." : "No FAQs yet — add one or bulk-import."}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

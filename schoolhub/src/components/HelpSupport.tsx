"use client";

import { useCallback, useEffect, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
const STATUS_BADGE: Record<string, string> = { open: "trial", in_progress: "trial", waiting: "archived", resolved: "active", closed: "archived" };
const FAQS: { q: string; a: string }[] = [
  { q: "How do I change my password?", a: "Go to My profile → Security, enter your current password and a new one. Changing it signs you out of other devices." },
  { q: "I didn't receive an email notification.", a: "Check My profile → Notification settings and make sure Email is enabled. If emails still don't arrive, your school's email provider may not be configured yet — raise a ticket below and an administrator will help." },
  { q: "How do I update my contact details?", a: "My profile lets you update your name, username, contact number and photo. Your email and role are managed by your school." },
  { q: "Who can see my messages and data?", a: "Access is strictly role-based and limited to your school. Parents see only their own children; teachers see only their assigned pupils; drivers see only their own journeys." },
  { q: "How do I get help with something not covered here?", a: "Raise a support request below. Your school administrators are notified and can reply — you'll see their responses on this page and get a notification." },
];

export default function HelpSupport({ contactHint }: { contactHint?: string }) {
  const [tab, setTab] = useState<"help" | "mine" | "manage">("help");
  const [canManage, setCanManage] = useState(false);
  const [tickets, setTickets] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState({ category: "question", subject: "", body: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const load = useCallback(async (scope: "mine" | "manage") => {
    const d = await fetch(`/api/support/tickets?scope=${scope}`).then((r) => r.json());
    setTickets(d.tickets ?? []); setCanManage(!!d.canManage);
  }, []);
  useEffect(() => { load("mine").then(() => load("manage").then(() => {})); }, [load]);
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
            <div style={{ marginTop: 8 }}>
              {FAQS.map((it, i) => (
                <div key={i} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                  <button className="linklike" style={{ fontSize: 14, fontWeight: 600, textAlign: "left" }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>{openFaq === i ? "▾" : "▸"} {it.q}</button>
                  {openFaq === i && <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>{it.a}</p>}
                </div>
              ))}
            </div>
          </div>
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

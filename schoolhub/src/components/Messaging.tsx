"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");

// Shared in-app messaging for every role. Conversations are restricted to the
// user's own school community and role-based contact rules (enforced server-side).
export default function Messaging() {
  const [threads, setThreads] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [text, setText] = useState("");
  const [compose, setCompose] = useState(false);
  const [to, setTo] = useState("");
  const [cq, setCq] = useState("");

  const loadList = useCallback(async () => {
    const d = await fetch(`/api/messages`).then((r) => r.json());
    setThreads(d.threads ?? []); setContacts(d.contacts ?? []);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  const loadConv = useCallback(async (id: string) => { const d = await fetch(`/api/messages/${id}`).then((r) => r.json()); setConv(d); loadList(); }, [loadList]);
  useEffect(() => { if (active) loadConv(active); }, [active, loadConv]);

  async function send() {
    if (!text.trim()) return;
    const res = await fetch(`/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: active, body: text.trim() }) });
    const d = await res.json(); if (d.error) return;
    setText(""); loadConv(active!);
  }
  async function startNew() {
    if (!to || !text.trim()) return;
    const res = await fetch(`/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUserId: to, body: text.trim() }) });
    const d = await res.json(); if (d.error) { alert(d.error); return; }
    setCompose(false); setTo(""); setText(""); await loadList(); setActive(d.threadId);
  }
  const filteredContacts = useMemo(() => contacts.filter((c) => !cq || c.name.toLowerCase().includes(cq.toLowerCase()) || (c.role || "").toLowerCase().includes(cq.toLowerCase())), [contacts, cq]);

  return (
    <div className="panel">
      <div className="flex-between"><div><h2 style={{ margin: 0 }}>Messages</h2><p className="sub" style={{ marginBottom: 0 }}>Message people in your school community. Conversations stay within your school.</p></div>
        <button onClick={() => { setCompose(true); setActive(null); setConv(null); setText(""); }}>New message</button></div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: "0 0 260px", minWidth: 220 }}>
          {threads.length === 0 && <p className="muted">No conversations yet.</p>}
          {threads.map((t) => (
            <button key={t.threadId} onClick={() => { setCompose(false); setActive(t.threadId); }} style={{ display: "block", width: "100%", textAlign: "left", background: active === t.threadId ? "#eef2ff" : "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", color: "var(--ink)" }}>
              <div style={{ fontWeight: 700 }}>{t.title}{t.unread > 0 && <span className="badge" style={{ background: "#dc2626", color: "#fff", marginLeft: 6 }}>{t.unread}</span>}</div>
              {t.last && <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last.mine ? "You: " : ""}{t.last.body}</div>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 300 }}>
          {compose ? (
            <div>
              <label>To</label>
              <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search people…" style={{ marginBottom: 8 }} />
              <select value={to} onChange={(e) => setTo(e.target.value)} size={6} style={{ width: "100%", height: "auto" }}>
                {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.role}{c.schoolName ? ` · ${c.schoolName}` : ""}</option>)}
              </select>
              {filteredContacts.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No contacts available.</p>}
              <label style={{ marginTop: 10 }}>Message</label>
              <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ width: "100%", padding: 10, border: "1px solid var(--line)", borderRadius: 8, fontSize: 13 }} />
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}><button onClick={startNew} disabled={!to || !text.trim()}>Send</button><button className="secondary" onClick={() => setCompose(false)}>Cancel</button></div>
            </div>
          ) : !active || !conv ? (
            <p className="muted">Select a conversation, or start a new message.</p>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{conv.thread?.participants?.join(", ")}</div>
              <div style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, minHeight: 260, maxHeight: 440, overflowY: "auto", background: "#fafbfe" }}>
                {(conv.messages || []).length === 0 ? <p className="muted">No messages yet.</p> : conv.messages.map((m: any) => (
                  <div key={m.id} style={{ textAlign: m.mine ? "right" : "left", margin: "6px 0" }}>
                    <div style={{ display: "inline-block", maxWidth: "80%", background: m.mine ? "#4f46e5" : "#fff", color: m.mine ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 10, padding: "6px 10px", fontSize: 13, textAlign: "left" }}>
                      {!m.mine && <div style={{ fontSize: 11, opacity: 0.7 }}>{m.senderName}</div>}
                      <div style={{ whiteSpace: "pre-wrap" }}>{m.body}</div>
                      <div style={{ fontSize: 10, opacity: 0.65, marginTop: 2 }}>{dt(m.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="row" style={{ marginTop: 10 }}>
                <div style={{ flex: 4 }}><input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Write a message…" /></div>
                <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={send}>Send</button></div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

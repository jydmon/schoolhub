"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downscaleToDataUrl } from "@/components/image";
import { REACTION_EMOJIS, EMOJI_PALETTE, MAX_ATTACHMENTS, readersOf } from "@/lib/messaging-logic";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");
const MAX_ATTACH_BYTES = 2_000_000;

type Attachment = { name: string; type: string; size?: number; dataUrl: string };

// Shared in-app messaging for every role (Teams-style). Rich text, emoji,
// attachments, reactions, read receipts, search and history. Who you can message
// is restricted to your school community and role rules (enforced server-side).
export default function Messaging() {
  const [threads, setThreads] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [compose, setCompose] = useState(false);
  const [to, setTo] = useState("");
  const [cq, setCq] = useState("");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const composeEditorRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async (q = "") => {
    const url = q ? `/api/messages?q=${encodeURIComponent(q)}` : `/api/messages`;
    const d = await fetch(url).then((r) => r.json());
    setThreads(d.threads ?? []); setContacts(d.contacts ?? []);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  // Debounced server search.
  useEffect(() => { const t = setTimeout(() => loadList(search.trim()), 250); return () => clearTimeout(t); }, [search, loadList]);

  const loadConv = useCallback(async (id: string) => {
    const d = await fetch(`/api/messages/${id}`).then((r) => r.json());
    setConv(d); loadList(search.trim());
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 30);
  }, [loadList, search]);
  useEffect(() => { if (active) loadConv(active); }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadEarlier() {
    if (!active || !conv?.oldestId) return;
    setLoadingMore(true);
    try {
      const d = await fetch(`/api/messages/${active}?before=${encodeURIComponent(conv.oldestId)}`).then((r) => r.json());
      setConv((c: any) => ({ ...d, messages: [...(d.messages || []), ...(c.messages || [])], hasMore: d.hasMore, oldestId: d.oldestId, members: c.members, thread: c.thread }));
    } finally { setLoadingMore(false); }
  }

  async function addFiles(files: FileList | null) {
    if (!files || !files.length) return;
    const next: Attachment[] = [];
    for (const f of Array.from(files)) {
      if (pending.length + next.length >= MAX_ATTACHMENTS) break;
      try {
        if (f.type.startsWith("image/")) {
          const dataUrl = await downscaleToDataUrl(f, 1280, 0.7);
          if (dataUrl.length > MAX_ATTACH_BYTES) { alert(`"${f.name}" is too large after compression.`); continue; }
          next.push({ name: f.name, type: f.type, size: dataUrl.length, dataUrl });
        } else {
          if (f.size > MAX_ATTACH_BYTES) { alert(`"${f.name}" is too large (max 2MB).`); continue; }
          const dataUrl = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(f); });
          next.push({ name: f.name, type: f.type || "application/octet-stream", size: f.size, dataUrl });
        }
      } catch { /* skip unreadable file */ }
    }
    if (next.length) setPending((p) => [...p, ...next].slice(0, MAX_ATTACHMENTS));
  }

  function readEditor(ref: React.RefObject<HTMLDivElement>): { html: string; text: string } {
    const el = ref.current;
    if (!el) return { html: "", text: "" };
    const text = (el.innerText || "").trim();
    return { html: text ? el.innerHTML.trim() : "", text };
  }
  function clearEditor(ref: React.RefObject<HTMLDivElement>) { if (ref.current) ref.current.innerHTML = ""; }

  async function send() {
    if (!active) return;
    const { html, text } = readEditor(editorRef);
    if (!text && !pending.length) return;
    const res = await fetch(`/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: active, bodyHtml: html, body: text, attachments: pending }) });
    const d = await res.json(); if (d.error) { alert(d.error); return; }
    clearEditor(editorRef); setPending([]); loadConv(active);
  }
  async function startNew() {
    const { html, text } = readEditor(composeEditorRef);
    if (!to || (!text && !pending.length)) return;
    const res = await fetch(`/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ toUserId: to, bodyHtml: html, body: text, attachments: pending }) });
    const d = await res.json(); if (d.error) { alert(d.error); return; }
    clearEditor(composeEditorRef); setPending([]); setCompose(false); setTo(""); await loadList(); setActive(d.threadId);
  }
  async function react(messageId: string, emoji: string) {
    if (!active) return;
    const res = await fetch(`/api/messages/${active}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, emoji }) });
    const d = await res.json(); if (d.error) return;
    setConv((c: any) => ({ ...c, messages: (c.messages || []).map((m: any) => m.id === messageId ? { ...m, reactions: d.reactions } : m) }));
  }

  const filteredContacts = useMemo(() => contacts.filter((c) => !cq || c.name.toLowerCase().includes(cq.toLowerCase()) || (c.role || "").toLowerCase().includes(cq.toLowerCase())), [contacts, cq]);
  const members = conv?.members || [];
  // Index of the last of MY messages, for the "Seen" receipt (Teams-style).
  const lastMineIdx = useMemo(() => { const ms = conv?.messages || []; for (let i = ms.length - 1; i >= 0; i--) if (ms[i].mine) return i; return -1; }, [conv]);

  return (
    <div className="panel">
      <div className="flex-between"><div><h2 style={{ margin: 0 }}>Messages</h2><p className="sub" style={{ marginBottom: 0 }}>Message people in your school community. Conversations stay within your school.</p></div>
        <button onClick={() => { setCompose(true); setActive(null); setConv(null); setPending([]); }}>New message</button></div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ flex: "0 0 280px", minWidth: 240 }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search messages & people…" style={{ width: "100%", marginBottom: 8 }} />
          {threads.length === 0 && <p className="muted">{search ? "No conversations match." : "No conversations yet."}</p>}
          {threads.map((t) => (
            <button key={t.threadId} onClick={() => { setCompose(false); setActive(t.threadId); }} style={{ display: "block", width: "100%", textAlign: "left", background: active === t.threadId ? "#eef2ff" : "transparent", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", marginBottom: 6, cursor: "pointer", color: "var(--ink)" }}>
              <div style={{ fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>{t.isGroup ? "👥 " : ""}{t.title}{t.unread > 0 && <span className="badge" style={{ background: "#dc2626", color: "#fff", marginLeft: "auto" }}>{t.unread}</span>}</div>
              {t.last && <div className="muted" style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.last.mine ? "You: " : ""}{t.last.body}</div>}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, minWidth: 320 }}>
          {compose ? (
            <div>
              <label>To</label>
              <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search people…" style={{ marginBottom: 8 }} />
              <select value={to} onChange={(e) => setTo(e.target.value)} size={6} style={{ width: "100%", height: "auto" }}>
                {filteredContacts.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.role}{c.schoolName ? ` · ${c.schoolName}` : ""}</option>)}
              </select>
              {filteredContacts.length === 0 && <p className="muted" style={{ fontSize: 13 }}>No contacts available.</p>}
              <label style={{ marginTop: 10 }}>Message</label>
              <RichComposer editorRef={composeEditorRef} onAddFiles={addFiles} pending={pending} onRemove={(i) => setPending((p) => p.filter((_, x) => x !== i))} />
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}><button onClick={startNew} disabled={!to}>Send</button><button className="secondary" onClick={() => { setCompose(false); setPending([]); }}>Cancel</button></div>
            </div>
          ) : !active || !conv ? (
            <p className="muted">Select a conversation, or start a new message.</p>
          ) : (
            <>
              <div className="muted" style={{ fontSize: 13, marginBottom: 8 }}>{conv.thread?.isGroup ? "👥 " : ""}{conv.thread?.participants?.join(", ")}</div>
              <div ref={scrollRef} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, minHeight: 280, maxHeight: 460, overflowY: "auto", background: "#fafbfe" }}>
                {conv.hasMore && <div style={{ textAlign: "center", marginBottom: 8 }}><button className="secondary small" onClick={loadEarlier} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load earlier messages"}</button></div>}
                {(conv.messages || []).length === 0 ? <p className="muted">No messages yet.</p> : conv.messages.map((m: any, idx: number) => {
                  const seen = m.mine && idx === lastMineIdx ? readersOf(m.createdAt, m.senderId, members) : [];
                  return (
                    <div key={m.id} style={{ textAlign: m.mine ? "right" : "left", margin: "8px 0" }}>
                      <div style={{ display: "inline-block", maxWidth: "82%", background: m.mine ? "#4f46e5" : "#fff", color: m.mine ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "left" }}>
                        {(!m.mine && conv.thread?.isGroup) && <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 700 }}>{m.senderName}</div>}
                        {m.bodyHtml
                          ? <div className="dm-rich" style={{ wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
                          : <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{m.body}</div>}
                        {(m.attachments || []).length > 0 && <Attachments items={m.attachments} mine={m.mine} />}
                        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3 }}>{dt(m.createdAt)}{m.editedAt ? " · edited" : ""}</div>
                      </div>
                      <ReactionBar msg={m} onReact={react} />
                      {m.mine && idx === lastMineIdx && seen.length > 0 && (
                        <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>Seen{conv.thread?.isGroup ? ` by ${seen.map((s) => s.name).join(", ")}` : ""}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              <RichComposer editorRef={editorRef} onAddFiles={addFiles} pending={pending} onRemove={(i) => setPending((p) => p.filter((_, x) => x !== i))} onEnter={send} />
              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}><button onClick={send}>Send</button></div>
            </>
          )}
        </div>
      </div>
      <style>{`
        .dm-rich a { color: inherit; text-decoration: underline; }
        .dm-rich ul, .dm-rich ol { margin: 4px 0 4px 18px; }
        .dm-rich p { margin: 4px 0; }
        .dm-editor:empty:before { content: attr(data-placeholder); color: #9aa3b2; }
        .dm-editor:focus { outline: 2px solid #c7d2fe; }
        .dm-tool { border: 1px solid var(--line); background: #fff; border-radius: 6px; width: 30px; height: 28px; cursor: pointer; font-size: 13px; }
        .dm-emoji-pop { position: absolute; z-index: 20; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.12); display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; width: 320px; }
        .dm-emoji-pop button { border: none; background: transparent; font-size: 18px; cursor: pointer; padding: 3px; border-radius: 6px; }
        .dm-emoji-pop button:hover { background: #eef2ff; }
        .dm-react { border: 1px solid var(--line); background: #fff; border-radius: 12px; padding: 1px 7px; font-size: 12px; cursor: pointer; }
        .dm-react.mine { background: #eef2ff; border-color: #c7d2fe; }
      `}</style>
    </div>
  );
}

// ---- Rich-text composer: formatting toolbar + emoji picker + attachments ----
function RichComposer({ editorRef, onAddFiles, pending, onRemove, onEnter }: {
  editorRef: React.RefObject<HTMLDivElement>; onAddFiles: (f: FileList | null) => void;
  pending: Attachment[]; onRemove: (i: number) => void; onEnter?: () => void;
}) {
  const [emoji, setEmoji] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cmd = (c: string, v?: string) => { document.execCommand(c, false, v); editorRef.current?.focus(); };
  function insertEmoji(e: string) { editorRef.current?.focus(); document.execCommand("insertText", false, e); setEmoji(false); }
  function addLink() { const url = prompt("Link URL (https://…)"); if (url) cmd("createLink", url); }
  return (
    <div style={{ position: "relative" }}>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="dm-tool" title="Bold" onClick={() => cmd("bold")}><b>B</b></button>
        <button type="button" className="dm-tool" title="Italic" onClick={() => cmd("italic")}><i>I</i></button>
        <button type="button" className="dm-tool" title="Underline" onClick={() => cmd("underline")}><u>U</u></button>
        <button type="button" className="dm-tool" title="Bulleted list" onClick={() => cmd("insertUnorderedList")}>•</button>
        <button type="button" className="dm-tool" title="Link" onClick={addLink}>🔗</button>
        <button type="button" className="dm-tool" title="Emoji" onClick={() => setEmoji((s) => !s)}>😊</button>
        <button type="button" className="dm-tool" title="Attach" onClick={() => fileRef.current?.click()}>📎</button>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: "none" }} onChange={(e) => { onAddFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
      </div>
      {emoji && (
        <div className="dm-emoji-pop" style={{ bottom: "100%", left: 0, marginBottom: 6 }}>
          {EMOJI_PALETTE.map((e) => <button key={e} type="button" onClick={() => insertEmoji(e)}>{e}</button>)}
        </div>
      )}
      <div
        ref={editorRef}
        className="dm-editor"
        contentEditable
        suppressContentEditableWarning
        data-placeholder="Write a message…"
        onKeyDown={(e) => { if (onEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); } }}
        style={{ minHeight: 44, maxHeight: 160, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", fontSize: 13, background: "#fff" }}
      />
      {pending.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
          {pending.map((a, i) => (
            <div key={i} style={{ position: "relative", border: "1px solid var(--line)", borderRadius: 8, padding: a.type.startsWith("image/") ? 0 : "6px 10px", background: "#fff" }}>
              {a.type.startsWith("image/")
                ? <img src={a.dataUrl} alt={a.name} style={{ width: 60, height: 60, objectFit: "cover", borderRadius: 8, display: "block" }} />
                : <span style={{ fontSize: 12 }}>📎 {a.name}</span>}
              <button type="button" onClick={() => onRemove(i)} style={{ position: "absolute", top: -8, right: -8, width: 20, height: 20, borderRadius: 10, border: "none", background: "#111827", color: "#fff", cursor: "pointer", fontSize: 12 }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---- Attachment viewer on a message bubble ----
function Attachments({ items, mine }: { items: Attachment[]; mine: boolean }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
      {items.map((a, i) => a.type?.startsWith("image/")
        ? <a key={i} href={a.dataUrl} download={a.name} title={a.name}><img src={a.dataUrl} alt={a.name} style={{ maxWidth: 160, maxHeight: 160, borderRadius: 8, border: "1px solid rgba(0,0,0,.1)", display: "block" }} /></a>
        : <a key={i} href={a.dataUrl} download={a.name} style={{ fontSize: 12, color: mine ? "#fff" : "var(--ink)", textDecoration: "underline" }}>📎 {a.name}</a>)}
    </div>
  );
}

// ---- Reaction bar: existing reaction pills + a quick-add popover ----
function ReactionBar({ msg, onReact }: { msg: any; onReact: (id: string, emoji: string) => void }) {
  const [open, setOpen] = useState(false);
  const reactions: any[] = msg.reactions || [];
  return (
    <div style={{ display: "flex", gap: 4, marginTop: 3, justifyContent: msg.mine ? "flex-end" : "flex-start", position: "relative", flexWrap: "wrap" }}>
      {reactions.map((r) => (
        <button key={r.emoji} className={`dm-react${r.mine ? " mine" : ""}`} title={r.mine ? "You reacted" : `${r.count} reaction${r.count > 1 ? "s" : ""}`} onClick={() => onReact(msg.id, r.emoji)}>{r.emoji} {r.count}</button>
      ))}
      <button className="dm-react" title="Add reaction" onClick={() => setOpen((s) => !s)} style={{ opacity: 0.7 }}>＋</button>
      {open && (
        <div style={{ position: "absolute", top: "100%", zIndex: 20, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,.12)", display: "flex", gap: 2, [msg.mine ? "right" : "left"]: 0 as any }}>
          {REACTION_EMOJIS.map((e) => <button key={e} onClick={() => { onReact(msg.id, e); setOpen(false); }} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", padding: 2 }}>{e}</button>)}
        </div>
      )}
    </div>
  );
}

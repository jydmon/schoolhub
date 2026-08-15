"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { downscaleToDataUrl } from "@/components/image";
import { REACTION_EMOJIS, EMOJI_PALETTE, MAX_ATTACHMENTS, readersOf } from "@/lib/messaging-logic";

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");
const MAX_ATTACH_BYTES = 2_000_000;

type Attachment = { name: string; type: string; size?: number; dataUrl: string };
type Mention = { userId: string; name: string };
type ReplyTo = { id: string; senderName: string; snippet: string };

// Escape a string for use inside a RegExp.
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Render plain-text with @mentions highlighted (rich HTML bodies render as-is).
function withMentions(text: string, mentions: Mention[]): React.ReactNode {
  if (!mentions?.length || !text) return text;
  const names = mentions.map((m) => esc(m.name)).sort((a, b) => b.length - a.length);
  const re = new RegExp(`@(${names.join("|")})`, "g");
  const out: React.ReactNode[] = []; let last = 0; let m: RegExpExecArray | null; let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<span key={k++} className="dm-mention">{m[0]}</span>);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// Shared in-app messaging for every role (Teams-style). Rich text, emoji,
// attachments, reactions, read receipts, search, history — plus @mentions,
// threaded replies and group chats. Who you can message is restricted to your
// school community and role rules (enforced server-side).
export default function Messaging() {
  const [threads, setThreads] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [conv, setConv] = useState<any>(null);
  const [compose, setCompose] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [subject, setSubject] = useState("");
  const [cq, setCq] = useState("");
  const [search, setSearch] = useState("");
  const [pending, setPending] = useState<Attachment[]>([]);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [replyTo, setReplyTo] = useState<ReplyTo | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [manage, setManage] = useState(false);
  const [addSel, setAddSel] = useState<Record<string, boolean>>({});
  const editorRef = useRef<HTMLDivElement | null>(null);
  const composeEditorRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const loadList = useCallback(async (q = "") => {
    const url = q ? `/api/messages?q=${encodeURIComponent(q)}` : `/api/messages`;
    const d = await fetch(url).then((r) => r.json());
    setThreads(d.threads ?? []); setContacts(d.contacts ?? []);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { const t = setTimeout(() => loadList(search.trim()), 250); return () => clearTimeout(t); }, [search, loadList]);

  const loadConv = useCallback(async (id: string) => {
    const d = await fetch(`/api/messages/${id}`).then((r) => r.json());
    setConv(d); loadList(search.trim());
    setTimeout(() => { if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight; }, 30);
  }, [loadList, search]);
  useEffect(() => { if (active) { setReplyTo(null); setMentions([]); setManage(false); loadConv(active); } }, [active]); // eslint-disable-line react-hooks/exhaustive-deps

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
    const usedMentions = mentions.filter((m) => text.includes("@" + m.name)).map((m) => m.userId);
    const res = await fetch(`/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ threadId: active, bodyHtml: html, body: text, attachments: pending, mentions: usedMentions, parentId: replyTo?.id }) });
    const d = await res.json(); if (d.error) { alert(d.error); return; }
    clearEditor(editorRef); setPending([]); setMentions([]); setReplyTo(null); loadConv(active);
  }
  async function startNew() {
    const { html, text } = readEditor(composeEditorRef);
    const ids = Object.keys(selected).filter((k) => selected[k]);
    if (!ids.length || (!text && !pending.length)) return;
    const isGroup = ids.length > 1;
    const payload: any = { bodyHtml: html, body: text, attachments: pending };
    if (isGroup) { payload.toUserIds = ids; payload.subject = subject.trim() || undefined; } else { payload.toUserId = ids[0]; }
    const res = await fetch(`/api/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    const d = await res.json(); if (d.error) { alert(d.error); return; }
    clearEditor(composeEditorRef); setPending([]); setSelected({}); setSubject(""); setCompose(false); await loadList(); setActive(d.threadId);
  }
  async function react(messageId: string, emoji: string) {
    if (!active) return;
    const res = await fetch(`/api/messages/${active}/react`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messageId, emoji }) });
    const d = await res.json(); if (d.error) return;
    setConv((c: any) => ({ ...c, messages: (c.messages || []).map((m: any) => m.id === messageId ? { ...m, reactions: d.reactions } : m) }));
  }
  async function manageThread(action: string, extra: any = {}) {
    if (!active) return;
    const res = await fetch(`/api/messages/${active}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
    const d = await res.json(); if (d.error) { alert(d.error); return; }
    if (action === "leave") { setActive(null); setConv(null); setManage(false); loadList(); }
    else { setManage(false); setAddSel({}); loadConv(active); }
  }

  function addMention(m: Mention) {
    editorRef.current?.focus();
    document.execCommand("insertText", false, "@" + m.name + " ");
    setMentions((cur) => cur.some((x) => x.userId === m.userId) ? cur : [...cur, m]);
  }

  const filteredContacts = useMemo(() => contacts.filter((c) => !cq || c.name.toLowerCase().includes(cq.toLowerCase()) || (c.role || "").toLowerCase().includes(cq.toLowerCase())), [contacts, cq]);
  const selectedCount = Object.values(selected).filter(Boolean).length;
  const members = conv?.members || [];
  const mentionMembers: Mention[] = useMemo(() => members.filter((m: any) => !m.mine).map((m: any) => ({ userId: m.userId, name: m.name })), [members]);
  const lastMineIdx = useMemo(() => { const ms = conv?.messages || []; for (let i = ms.length - 1; i >= 0; i--) if (ms[i].mine) return i; return -1; }, [conv]);

  return (
    <div className="panel">
      <div className="flex-between"><div><h2 style={{ margin: 0 }}>Messages</h2><p className="sub" style={{ marginBottom: 0 }}>Message people in your school community. Start a group, reply to a message, or @mention someone.</p></div>
        <button onClick={() => { setCompose(true); setActive(null); setConv(null); setPending([]); setSelected({}); setSubject(""); }}>New message</button></div>

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
              <div className="flex-between"><label>To {selectedCount > 0 ? `(${selectedCount})` : ""}</label>{selectedCount > 1 && <span className="badge role">Group</span>}</div>
              <input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="Search people…" style={{ marginBottom: 8 }} />
              <div style={{ maxHeight: 180, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 6 }}>
                {filteredContacts.length === 0 && <p className="muted" style={{ fontSize: 13, margin: 6 }}>No contacts available.</p>}
                {filteredContacts.map((c) => (
                  <label key={c.id} className="consent" style={{ display: "flex", alignItems: "center", gap: 8, margin: "2px 0", cursor: "pointer" }}>
                    <input type="checkbox" checked={!!selected[c.id]} onChange={(e) => setSelected((s) => ({ ...s, [c.id]: e.target.checked }))} />
                    <span>{c.name} <span className="muted">— {c.role}{c.schoolName ? ` · ${c.schoolName}` : ""}</span></span>
                  </label>
                ))}
              </div>
              {selectedCount > 1 && <div style={{ marginTop: 8 }}><label>Group name (optional)</label><input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Year 6 trip team" /></div>}
              <label style={{ marginTop: 10 }}>Message</label>
              <RichComposer editorRef={composeEditorRef} onAddFiles={addFiles} pending={pending} onRemove={(i) => setPending((p) => p.filter((_, x) => x !== i))} />
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}><button onClick={startNew} disabled={selectedCount === 0}>Send</button><button className="secondary" onClick={() => { setCompose(false); setPending([]); setSelected({}); }}>Cancel</button></div>
            </div>
          ) : !active || !conv ? (
            <p className="muted">Select a conversation, or start a new message.</p>
          ) : (
            <>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div className="muted" style={{ fontSize: 13 }}>{conv.thread?.isGroup ? "👥 " : ""}{conv.thread?.subject || conv.thread?.participants?.join(", ")}</div>
                {conv.thread?.isGroup && <button className="secondary small" onClick={() => setManage((s) => !s)}>{manage ? "Close" : "Manage group"}</button>}
              </div>
              {manage && conv.thread?.isGroup && (
                <div className="panel" style={{ background: "#f8fafc", marginBottom: 10 }}>
                  <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>In this group: {conv.thread?.participants?.join(", ")}</div>
                  <div className="row">
                    <div style={{ flex: 3 }}><input defaultValue={conv.thread?.subject || ""} placeholder="Group name" id="dm-rename" /></div>
                    <div style={{ display: "flex", alignItems: "flex-end" }}><button className="secondary small" onClick={() => manageThread("rename", { subject: (document.getElementById("dm-rename") as HTMLInputElement)?.value })}>Rename</button></div>
                  </div>
                  <label style={{ marginTop: 8, fontSize: 12 }}>Add people</label>
                  <div style={{ maxHeight: 120, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 6, background: "#fff" }}>
                    {contacts.filter((c) => !members.some((m: any) => m.userId === c.id)).map((c) => (
                      <label key={c.id} style={{ display: "flex", gap: 8, alignItems: "center", margin: "2px 0", cursor: "pointer" }}>
                        <input type="checkbox" checked={!!addSel[c.id]} onChange={(e) => setAddSel((s) => ({ ...s, [c.id]: e.target.checked }))} /><span style={{ fontSize: 13 }}>{c.name} <span className="muted">— {c.role}</span></span>
                      </label>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                    <button className="secondary small" onClick={() => manageThread("add", { memberIds: Object.keys(addSel).filter((k) => addSel[k]) })} disabled={!Object.values(addSel).some(Boolean)}>Add selected</button>
                    <button className="danger small" onClick={() => manageThread("leave")}>Leave group</button>
                  </div>
                </div>
              )}
              <div ref={scrollRef} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 12, minHeight: 280, maxHeight: 460, overflowY: "auto", background: "#fafbfe" }}>
                {conv.hasMore && <div style={{ textAlign: "center", marginBottom: 8 }}><button className="secondary small" onClick={loadEarlier} disabled={loadingMore}>{loadingMore ? "Loading…" : "Load earlier messages"}</button></div>}
                {(conv.messages || []).length === 0 ? <p className="muted">No messages yet.</p> : conv.messages.map((m: any, idx: number) => {
                  const seen = m.mine && idx === lastMineIdx ? readersOf(m.createdAt, m.senderId, members) : [];
                  return (
                    <div key={m.id} className="dm-msg" style={{ textAlign: m.mine ? "right" : "left", margin: "8px 0" }}>
                      <div style={{ display: "inline-block", maxWidth: "82%", background: m.mine ? "#4f46e5" : "#fff", color: m.mine ? "#fff" : "var(--ink)", border: "1px solid var(--line)", borderRadius: 12, padding: "8px 12px", fontSize: 13, textAlign: "left" }}>
                        {(!m.mine && conv.thread?.isGroup) && <div style={{ fontSize: 11, opacity: 0.75, fontWeight: 700 }}>{m.senderName}</div>}
                        {m.replyTo && <div style={{ borderLeft: "3px solid rgba(127,127,127,.5)", paddingLeft: 6, margin: "2px 0 4px", fontSize: 11, opacity: 0.8 }}><strong>{m.replyTo.senderName}</strong>: {m.replyTo.snippet}</div>}
                        {m.bodyHtml
                          ? <div className="dm-rich" style={{ wordBreak: "break-word" }} dangerouslySetInnerHTML={{ __html: m.bodyHtml }} />
                          : <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{withMentions(m.body, m.mentions)}</div>}
                        {(m.attachments || []).length > 0 && <Attachments items={m.attachments} mine={m.mine} />}
                        <div style={{ fontSize: 10, opacity: 0.65, marginTop: 3 }}>{dt(m.createdAt)}{m.editedAt ? " · edited" : ""}</div>
                      </div>
                      <div className="dm-actions" style={{ display: "flex", gap: 6, marginTop: 3, justifyContent: m.mine ? "flex-end" : "flex-start", alignItems: "center", flexWrap: "wrap" }}>
                        <ReactionBar msg={m} onReact={react} />
                        <button className="dm-reply-btn" onClick={() => setReplyTo({ id: m.id, senderName: m.senderName, snippet: (m.body || "📎 attachment").slice(0, 80) })}>Reply</button>
                      </div>
                      {m.mine && idx === lastMineIdx && seen.length > 0 && (
                        <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>Seen{conv.thread?.isGroup ? ` by ${seen.map((s) => s.name).join(", ")}` : ""}</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {replyTo && (
                <div className="flex-between" style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 8, padding: "6px 10px", marginTop: 8, fontSize: 12 }}>
                  <span>↩ Replying to <strong>{replyTo.senderName}</strong>: {replyTo.snippet}</span>
                  <button className="secondary small" onClick={() => setReplyTo(null)}>✕</button>
                </div>
              )}
              <RichComposer editorRef={editorRef} onAddFiles={addFiles} pending={pending} onRemove={(i) => setPending((p) => p.filter((_, x) => x !== i))} onEnter={send} mentionMembers={mentionMembers} onMention={addMention} />
              <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}><button onClick={send}>Send</button></div>
            </>
          )}
        </div>
      </div>
      <style>{`
        .dm-rich a { color: inherit; text-decoration: underline; }
        .dm-rich ul, .dm-rich ol { margin: 4px 0 4px 18px; }
        .dm-rich p { margin: 4px 0; }
        .dm-mention { background: rgba(79,70,229,.14); color: inherit; border-radius: 4px; padding: 0 3px; font-weight: 600; }
        .dm-editor:empty:before { content: attr(data-placeholder); color: #9aa3b2; }
        .dm-editor:focus { outline: 2px solid #c7d2fe; }
        .dm-tool { border: 1px solid var(--line); background: #fff; border-radius: 6px; width: 30px; height: 28px; cursor: pointer; font-size: 13px; }
        .dm-emoji-pop, .dm-mention-pop { position: absolute; z-index: 20; background: #fff; border: 1px solid var(--line); border-radius: 10px; padding: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
        .dm-emoji-pop { display: grid; grid-template-columns: repeat(10, 1fr); gap: 2px; width: 320px; }
        .dm-emoji-pop button { border: none; background: transparent; font-size: 18px; cursor: pointer; padding: 3px; border-radius: 6px; }
        .dm-emoji-pop button:hover { background: #eef2ff; }
        .dm-mention-pop { width: 240px; max-height: 200px; overflow-y: auto; }
        .dm-mention-pop button { display: block; width: 100%; text-align: left; border: none; background: transparent; padding: 5px 8px; cursor: pointer; font-size: 13px; border-radius: 6px; }
        .dm-mention-pop button:hover { background: #eef2ff; }
        .dm-react { border: 1px solid var(--line); background: #fff; border-radius: 12px; padding: 1px 7px; font-size: 12px; cursor: pointer; }
        .dm-react.mine { background: #eef2ff; border-color: #c7d2fe; }
        .dm-reply-btn { border: none; background: transparent; color: #6b7280; font-size: 11px; cursor: pointer; padding: 1px 4px; }
        .dm-reply-btn:hover { color: #4f46e5; text-decoration: underline; }
        .dm-actions { opacity: 0; transition: opacity .12s; }
        .dm-msg:hover .dm-actions { opacity: 1; }
      `}</style>
    </div>
  );
}

// ---- Modern message composer: formatting toolbar, emoji, @mention, attachments.
// Uses contentEditable but pastes as PLAIN TEXT (rich paste from Word/web was the
// main source of "distorted" messages), normalises empties so the placeholder
// always returns, and keeps everything responsive. Bodies are still sanitised
// server-side on send. ----
function RichComposer({ editorRef, onAddFiles, pending, onRemove, onEnter, mentionMembers, onMention }: {
  editorRef: React.RefObject<HTMLDivElement>; onAddFiles: (f: FileList | null) => void;
  pending: Attachment[]; onRemove: (i: number) => void; onEnter?: () => void;
  mentionMembers?: Mention[]; onMention?: (m: Mention) => void;
}) {
  const [emoji, setEmoji] = useState(false);
  const [ment, setMent] = useState(false);
  const [mq, setMq] = useState("");
  const fileRef = useRef<HTMLInputElement | null>(null);
  // Reset a visually-empty editor (only <br>/whitespace) so the CSS placeholder
  // reappears — the classic contentEditable placeholder bug.
  function normalize() { const el = editorRef.current; if (el && !(el.innerText || "").trim()) el.innerHTML = ""; }
  const cmd = (c: string, v?: string) => { editorRef.current?.focus(); document.execCommand(c, false, v); normalize(); };
  function insertEmoji(e: string) { editorRef.current?.focus(); document.execCommand("insertText", false, e); setEmoji(false); normalize(); }
  function onPaste(e: React.ClipboardEvent) {
    // Strip formatting on paste — keeps messages clean and predictable.
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    normalize();
  }
  function addLink() {
    const sel = window.getSelection();
    const hasSelection = !!sel && sel.rangeCount > 0 && !sel.isCollapsed;
    const url = prompt("Link URL (https://…)"); if (!url) return;
    editorRef.current?.focus();
    if (hasSelection) { document.execCommand("createLink", false, url); }
    else {
      const label = prompt("Link text", url) || url;
      const safe = url.replace(/"/g, "&quot;");
      const txt = label.replace(/</g, "&lt;").replace(/>/g, "&gt;");
      document.execCommand("insertHTML", false, `<a href="${safe}">${txt}</a>&nbsp;`);
    }
    normalize();
  }
  const filteredMembers = (mentionMembers || []).filter((m) => !mq || m.name.toLowerCase().includes(mq.toLowerCase()));
  return (
    <div style={{ position: "relative" }}>
      <div className="dm-toolbar">
        <button type="button" className="dm-tool" title="Bold" onClick={() => cmd("bold")}><b>B</b></button>
        <button type="button" className="dm-tool" title="Italic" onClick={() => cmd("italic")}><i>I</i></button>
        <button type="button" className="dm-tool" title="Underline" onClick={() => cmd("underline")}><u>U</u></button>
        <button type="button" className="dm-tool" title="Bulleted list" onClick={() => cmd("insertUnorderedList")}>•</button>
        <button type="button" className="dm-tool" title="Numbered list" onClick={() => cmd("insertOrderedList")}>1.</button>
        <button type="button" className="dm-tool" title="Add link" onClick={addLink}>🔗</button>
        <button type="button" className="dm-tool" title="Clear formatting" onClick={() => cmd("removeFormat")}>⌫</button>
        <span className="dm-tool-sep" />
        <button type="button" className="dm-tool" title="Emoji" onClick={() => { setEmoji((s) => !s); setMent(false); }}>😊</button>
        {onMention && mentionMembers && mentionMembers.length > 0 && <button type="button" className="dm-tool" title="Mention someone" onClick={() => { setMent((s) => !s); setEmoji(false); }}>@</button>}
        <button type="button" className="dm-tool" title="Attach a file" onClick={() => fileRef.current?.click()}>📎</button>
        <input ref={fileRef} type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv" style={{ display: "none" }} onChange={(e) => { onAddFiles(e.target.files); if (fileRef.current) fileRef.current.value = ""; }} />
      </div>
      {emoji && (
        <div className="dm-emoji-pop" style={{ bottom: "100%", left: 0, marginBottom: 6 }}>
          {EMOJI_PALETTE.map((e) => <button key={e} type="button" onClick={() => insertEmoji(e)}>{e}</button>)}
        </div>
      )}
      {ment && onMention && (
        <div className="dm-mention-pop" style={{ bottom: "100%", left: 0, marginBottom: 6 }}>
          <input value={mq} onChange={(e) => setMq(e.target.value)} placeholder="Mention…" style={{ width: "100%", marginBottom: 6 }} autoFocus />
          {filteredMembers.length === 0 && <p className="muted" style={{ fontSize: 12, margin: 4 }}>No one to mention.</p>}
          {filteredMembers.map((m) => <button key={m.userId} type="button" onClick={() => { onMention(m); setMent(false); setMq(""); }}>@{m.name}</button>)}
        </div>
      )}
      <div
        ref={editorRef}
        className="dm-editor"
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        suppressContentEditableWarning
        data-placeholder="Write a message…"
        onPaste={onPaste}
        onInput={normalize}
        onKeyDown={(e) => { if (onEnter && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onEnter(); } }}
      />
      <div className="dm-hint">Enter to send · Shift+Enter for a new line · pasted text is cleaned automatically</div>
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
      <style>{`
        .dm-toolbar { display: flex; gap: 4px; margin-bottom: 6px; align-items: center; flex-wrap: wrap; }
        .dm-tool:hover { background: #eef2ff; border-color: #c7d2fe; }
        .dm-tool-sep { width: 1px; height: 20px; background: var(--line); margin: 0 3px; }
        .dm-editor { min-height: 46px; max-height: 180px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; padding: 9px 12px; font-size: 14px; line-height: 1.5; background: #fff; }
        .dm-editor a { color: #4f46e5; text-decoration: underline; }
        .dm-editor ul, .dm-editor ol { margin: 4px 0 4px 20px; }
        .dm-hint { font-size: 11px; color: #9aa3b2; margin-top: 4px; }
        @media (max-width: 640px) {
          .dm-editor { font-size: 16px; }
          .dm-tool { width: 34px; height: 32px; }
        }
      `}</style>
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
    <span style={{ display: "inline-flex", gap: 4, position: "relative", flexWrap: "wrap", alignItems: "center" }}>
      {reactions.map((r) => (
        <button key={r.emoji} className={`dm-react${r.mine ? " mine" : ""}`} title={r.mine ? "You reacted" : `${r.count} reaction${r.count > 1 ? "s" : ""}`} onClick={() => onReact(msg.id, r.emoji)}>{r.emoji} {r.count}</button>
      ))}
      <button className="dm-react" title="Add reaction" onClick={() => setOpen((s) => !s)} style={{ opacity: 0.7 }}>＋</button>
      {open && (
        <div style={{ position: "absolute", top: "100%", zIndex: 20, background: "#fff", border: "1px solid var(--line)", borderRadius: 10, padding: 4, boxShadow: "0 8px 24px rgba(0,0,0,.12)", display: "flex", gap: 2, left: 0 }}>
          {REACTION_EMOJIS.map((e) => <button key={e} onClick={() => { onReact(msg.id, e); setOpen(false); }} style={{ border: "none", background: "transparent", fontSize: 18, cursor: "pointer", padding: 2 }}>{e}</button>)}
        </div>
      )}
    </span>
  );
}

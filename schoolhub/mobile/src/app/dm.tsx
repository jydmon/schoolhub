import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, Pressable, Image, ScrollView } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Screen, Card, CardTitle, Sub, Badge, Button, LineItem, Field, Loading, Note, T, toast } from "@/ui/kit";
import { api } from "@/api/client";

// Teams-style direct messaging for mobile: conversation list, open a thread with
// full history, image attachments, emoji reactions, read receipts, threaded
// replies, @mentions, and group chats (create + manage). Backed by /api/messages.

type Attachment = { name: string; type: string; dataUrl: string };
type Mention = { userId: string; name: string };
const MAX_ATTACH = 4;
const MAX_ATTACH_CHARS = 2_000_000;
const REACTIONS = ["👍", "❤️", "😄", "🎉", "👏", "😮", "😢", "🙏", "✅", "👀"];
const dtl = (v: any) => (v ? new Date(v).toLocaleString() : "");

async function pickImage(): Promise<Attachment | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast("Photo access is needed to attach an image"); return null; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
    if (res.canceled || !res.assets?.length) return null;
    const a = res.assets[0];
    if (!a.base64) { toast("Couldn't read that image"); return null; }
    const type = a.mimeType || "image/jpeg";
    const dataUrl = `data:${type};base64,${a.base64}`;
    if (dataUrl.length > MAX_ATTACH_CHARS) { toast("That image is too large — pick a smaller one"); return null; }
    return { name: a.fileName || `photo-${Date.now()}.jpg`, type, dataUrl };
  } catch { toast("Couldn't open the photo library"); return null; }
}

function AttachStrip({ items, onRemove }: { items: Attachment[]; onRemove: (i: number) => void }) {
  if (!items.length) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
      {items.map((a, i) => (
        <View key={i} style={{ position: "relative" }}>
          <Image source={{ uri: a.dataUrl }} style={{ width: 56, height: 56, borderRadius: 8, borderWidth: 1, borderColor: T.line }} />
          <Pressable onPress={() => onRemove(i)} style={{ position: "absolute", top: -6, right: -6, backgroundColor: T.ink, width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: "#fff", fontSize: 12, lineHeight: 14 }}>×</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export function DirectMessages() {
  const [mode, setMode] = useState<"list" | "new">("list");
  const [threads, setThreads] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [replyAtt, setReplyAtt] = useState<Attachment[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: string; senderName: string; snippet: string } | null>(null);
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [showMention, setShowMention] = useState(false);
  const [manage, setManage] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [addSel, setAddSel] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  // New-message composer (multi-select => group)
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [cq, setCq] = useState("");
  const [subject, setSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newAtt, setNewAtt] = useState<Attachment[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.get<any>("/api/messages"); setThreads(d.threads || []); setContacts(d.contacts || []); }
    catch { setThreads([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const loadDetail = useCallback(async (id: string) => { try { setDetail(await api.get<any>(`/api/messages/${id}`)); } catch { toast("Couldn't load"); } }, []);
  useEffect(() => { if (openId) { setReplyTo(null); setMentions([]); setManage(false); loadDetail(openId); } }, [openId, loadDetail]);

  async function addReplyImg() { if (replyAtt.length >= MAX_ATTACH) { toast(`Up to ${MAX_ATTACH} photos`); return; } const a = await pickImage(); if (a) setReplyAtt((s) => [...s, a]); }
  async function addNewImg() { if (newAtt.length >= MAX_ATTACH) { toast(`Up to ${MAX_ATTACH} photos`); return; } const a = await pickImage(); if (a) setNewAtt((s) => [...s, a]); }

  async function send() {
    if ((!reply.trim() && !replyAtt.length) || !openId) return;
    setBusy(true);
    const used = mentions.filter((m) => reply.includes("@" + m.name)).map((m) => m.userId);
    try { await api.post(`/api/messages`, { threadId: openId, body: reply.trim(), attachments: replyAtt, mentions: used, parentId: replyTo?.id }); setReply(""); setReplyAtt([]); setReplyTo(null); setMentions([]); loadDetail(openId); }
    catch (e: any) { toast(e?.data?.error || "Couldn't send"); } finally { setBusy(false); }
  }
  async function startNew() {
    const ids = Object.keys(sel).filter((k) => sel[k]);
    if (!ids.length || (!newBody.trim() && !newAtt.length)) { toast("Pick someone and write a message"); return; }
    setBusy(true);
    const payload: any = { body: newBody.trim(), attachments: newAtt };
    if (ids.length > 1) { payload.toUserIds = ids; payload.subject = subject.trim() || undefined; } else { payload.toUserId = ids[0]; }
    try { const d = await api.post<any>(`/api/messages`, payload); setNewBody(""); setNewAtt([]); setSel({}); setSubject(""); setMode("list"); await load(); setOpenId(d.threadId); }
    catch (e: any) { toast(e?.data?.error || "Couldn't send"); } finally { setBusy(false); }
  }
  async function react(messageId: string, emoji: string) {
    if (!openId) return; setMenuFor(null);
    try { const d = await api.post<any>(`/api/messages/${openId}/react`, { messageId, emoji }); setDetail((c: any) => ({ ...c, messages: (c.messages || []).map((m: any) => m.id === messageId ? { ...m, reactions: d.reactions } : m) })); }
    catch { toast("Couldn't react"); }
  }
  async function loadEarlier() {
    if (!openId || !detail?.oldestId) return;
    try { const d = await api.get<any>(`/api/messages/${openId}?before=${detail.oldestId}`); setDetail((c: any) => ({ ...d, messages: [...(d.messages || []), ...(c.messages || [])], members: c.members, thread: c.thread })); }
    catch { toast("Couldn't load earlier"); }
  }
  async function manageThread(action: string, extra: any = {}) {
    if (!openId) return;
    try {
      const d = await api.patch<any>(`/api/messages/${openId}`, { action, ...extra });
      if (d?.error) { toast(d.error); return; }
      if (action === "leave") { setOpenId(null); setDetail(null); setManage(false); load(); }
      else { setManage(false); setAddSel({}); loadDetail(openId); }
    } catch (e: any) { toast(e?.data?.error || "Couldn't update group"); }
  }
  function addMention(m: Mention) { setReply((r) => (r ? r + " " : "") + "@" + m.name + " "); setMentions((cur) => cur.some((x) => x.userId === m.userId) ? cur : [...cur, m]); setShowMention(false); }

  const filteredContacts = useMemo(() => contacts.filter((c) => !cq || (c.name || "").toLowerCase().includes(cq.toLowerCase()) || (c.role || "").toLowerCase().includes(cq.toLowerCase())), [contacts, cq]);
  const selCount = Object.values(sel).filter(Boolean).length;
  const members: any[] = detail?.members || [];
  const mentionMembers: Mention[] = members.filter((m) => !m.mine).map((m) => ({ userId: m.userId, name: m.name }));
  const lastMineIdx = useMemo(() => { const ms = detail?.messages || []; for (let i = ms.length - 1; i >= 0; i--) if (ms[i].mine) return i; return -1; }, [detail]);
  const readersOf = (createdAt: string, senderId: string) => {
    const t = new Date(createdAt).getTime();
    return members.filter((m) => m.userId !== senderId && m.lastReadAt && new Date(m.lastReadAt).getTime() >= t).map((m) => m.name);
  };

  // ----- Open conversation -----
  if (openId && detail) {
    const th = detail.thread || {};
    return (
      <Screen>
        <Pressable onPress={() => { setOpenId(null); setDetail(null); }}><Text style={{ color: T.brand, fontWeight: "700", marginBottom: 8 }}>← Back to messages</Text></Pressable>
        <Card>
          <CardTitle right={th.isGroup ? <Pressable onPress={() => { setManage((s) => !s); setRenameVal(th.subject || ""); }}><Badge tone="info">{manage ? "close" : "manage"}</Badge></Pressable> : undefined}>
            {th.subject || (th.participants || []).join(", ") || "Conversation"}
          </CardTitle>
          {th.isGroup ? <Sub>{(th.participants || []).join(", ")}</Sub> : null}
          {manage && th.isGroup ? (
            <View style={{ marginTop: 8 }}>
              <Field label="Group name" value={renameVal} onChangeText={setRenameVal} />
              <Button sm tone="secondary" title="Rename" onPress={() => manageThread("rename", { subject: renameVal })} />
              <Text style={{ fontSize: 12, color: T.muted, marginTop: 8 }}>Add people</Text>
              <ScrollView style={{ maxHeight: 140 }}>
                {contacts.filter((c) => !members.some((m) => m.userId === c.id)).map((c, i) => (
                  <Pressable key={c.id} onPress={() => setAddSel((s) => ({ ...s, [c.id]: !s[c.id] }))}>
                    <LineItem first={i === 0} t={c.name} m={c.role} right={addSel[c.id] ? <Badge tone="ok">✓</Badge> : null} />
                  </Pressable>
                ))}
              </ScrollView>
              <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
                <Button sm tone="secondary" title="Add selected" onPress={() => manageThread("add", { memberIds: Object.keys(addSel).filter((k) => addSel[k]) })} />
                <Button sm tone="danger" title="Leave group" onPress={() => manageThread("leave")} />
              </View>
            </View>
          ) : null}
        </Card>
        {detail.hasMore ? <Button tone="secondary" sm title="Load earlier messages" onPress={loadEarlier} /> : null}
        {(detail.messages || []).map((m: any, idx: number) => {
          const seen = m.mine && idx === lastMineIdx ? readersOf(m.createdAt, m.senderId) : [];
          return (
            <View key={m.id} style={{ alignItems: m.mine ? "flex-end" : "flex-start", marginBottom: 8, marginTop: idx === 0 ? 8 : 0 }}>
              <Pressable onLongPress={() => setMenuFor(menuFor === m.id ? null : m.id)}>
                <View style={{ maxWidth: "86%", backgroundColor: m.mine ? T.brand : "#fff", borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 10 }}>
                  {(!m.mine && th.isGroup) ? <Text style={{ fontSize: 10, color: T.muted, fontWeight: "700" }}>{m.senderName}</Text> : null}
                  {m.replyTo ? (
                    <View style={{ borderLeftWidth: 3, borderLeftColor: m.mine ? "#c7d2fe" : T.line, paddingLeft: 6, marginBottom: 4 }}>
                      <Text style={{ fontSize: 10, color: m.mine ? "#E0E7FF" : T.muted }}><Text style={{ fontWeight: "700" }}>{m.replyTo.senderName}</Text>: {m.replyTo.snippet}</Text>
                    </View>
                  ) : null}
                  {m.body ? <Text style={{ fontSize: 13, color: m.mine ? "#fff" : T.ink }}>{m.body}</Text> : null}
                  {(m.attachments || []).length ? (
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: m.body ? 5 : 0 }}>
                      {m.attachments.map((att: any, ai: number) => att?.dataUrl && String(att.type || "").startsWith("image/")
                        ? <Image key={ai} source={{ uri: att.dataUrl }} style={{ width: 96, height: 96, borderRadius: 8, borderWidth: 1, borderColor: m.mine ? "#6366F1" : T.line }} />
                        : <Text key={ai} style={{ fontSize: 11, color: m.mine ? "#E0E7FF" : T.muted }}>📎 {att?.name || "attachment"}</Text>)}
                    </View>
                  ) : null}
                  <Text style={{ fontSize: 9, color: m.mine ? "#C7D2FE" : T.muted, marginTop: 3 }}>{dtl(m.createdAt)}</Text>
                </View>
              </Pressable>
              {(m.reactions || []).length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 3 }}>
                  {m.reactions.map((r: any) => (
                    <Pressable key={r.emoji} onPress={() => react(m.id, r.emoji)} style={{ borderWidth: 1, borderColor: r.mine ? "#c7d2fe" : T.line, backgroundColor: r.mine ? "#eef2ff" : "#fff", borderRadius: 12, paddingHorizontal: 7, paddingVertical: 1 }}>
                      <Text style={{ fontSize: 12 }}>{r.emoji} {r.count}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {menuFor === m.id ? (
                <View style={{ marginTop: 4, backgroundColor: "#fff", borderWidth: 1, borderColor: T.line, borderRadius: 10, padding: 4 }}>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
                    {REACTIONS.map((e) => <Pressable key={e} onPress={() => react(m.id, e)} style={{ padding: 3 }}><Text style={{ fontSize: 20 }}>{e}</Text></Pressable>)}
                  </View>
                  <Pressable onPress={() => { setReplyTo({ id: m.id, senderName: m.senderName, snippet: (m.body || "📎 attachment").slice(0, 60) }); setMenuFor(null); }} style={{ paddingVertical: 6, paddingHorizontal: 4 }}>
                    <Text style={{ color: T.brand, fontWeight: "700", fontSize: 13 }}>↩ Reply</Text>
                  </Pressable>
                </View>
              ) : null}
              {m.mine && idx === lastMineIdx && seen.length > 0 ? <Text style={{ fontSize: 9, color: T.muted, marginTop: 2 }}>Seen{th.isGroup ? ` by ${seen.join(", ")}` : ""}</Text> : null}
            </View>
          );
        })}
        {replyTo ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#eef2ff", borderWidth: 1, borderColor: "#c7d2fe", borderRadius: 8, padding: 8, marginTop: 6 }}>
            <Text style={{ fontSize: 12, color: T.ink, flex: 1 }}>↩ {replyTo.senderName}: {replyTo.snippet}</Text>
            <Pressable onPress={() => setReplyTo(null)}><Text style={{ color: T.brand, fontWeight: "700" }}>  ✕</Text></Pressable>
          </View>
        ) : null}
        {showMention && mentionMembers.length > 0 ? (
          <View style={{ backgroundColor: "#fff", borderWidth: 1, borderColor: T.line, borderRadius: 8, padding: 4, marginTop: 6 }}>
            {mentionMembers.map((m) => <Pressable key={m.userId} onPress={() => addMention(m)} style={{ paddingVertical: 6, paddingHorizontal: 6 }}><Text style={{ fontSize: 13, color: T.ink }}>@{m.name}</Text></Pressable>)}
          </View>
        ) : null}
        <Field placeholder="Write a message…" value={reply} onChangeText={setReply} multiline style={{ minHeight: 54, marginTop: 6 }} />
        <AttachStrip items={replyAtt} onRemove={(i) => setReplyAtt((s) => s.filter((_, x) => x !== i))} />
        <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
          <Button tone="secondary" title={`📷${replyAtt.length ? ` (${replyAtt.length})` : ""}`} onPress={addReplyImg} />
          {th.isGroup ? <Button tone="secondary" title="＠" onPress={() => setShowMention((s) => !s)} /> : null}
          <View style={{ flex: 1 }}><Button title={busy ? "Sending…" : "Send"} disabled={busy} onPress={send} /></View>
        </View>
        <Note>Long-press a message to react or reply. Messaging stays within your school.</Note>
      </Screen>
    );
  }

  // ----- New message / group -----
  if (mode === "new") {
    return (
      <Screen>
        <Pressable onPress={() => setMode("list")}><Text style={{ color: T.brand, fontWeight: "700", marginBottom: 8 }}>← Back</Text></Pressable>
        <Card>
          <CardTitle right={selCount > 1 ? <Badge tone="info">group</Badge> : undefined}>New message{selCount > 0 ? ` (${selCount})` : ""}</CardTitle>
          <Field placeholder="Search people…" value={cq} onChangeText={setCq} autoCapitalize="none" />
          <ScrollView style={{ maxHeight: 200, marginTop: 6 }}>
            {filteredContacts.length === 0 ? <Sub>No contacts available.</Sub> : filteredContacts.map((c, i) => (
              <Pressable key={c.id} onPress={() => setSel((s) => ({ ...s, [c.id]: !s[c.id] }))}>
                <LineItem first={i === 0} t={c.name} m={`${c.role || ""}${c.schoolName ? " · " + c.schoolName : ""}`} right={sel[c.id] ? <Badge tone="ok">✓</Badge> : null} />
              </Pressable>
            ))}
          </ScrollView>
          {selCount > 1 ? <Field label="Group name (optional)" value={subject} onChangeText={setSubject} placeholder="e.g. Year 6 trip team" /> : null}
          <Field label="Message" placeholder="Write a message…" value={newBody} onChangeText={setNewBody} multiline style={{ minHeight: 70 }} />
          <AttachStrip items={newAtt} onRemove={(i) => setNewAtt((s) => s.filter((_, x) => x !== i))} />
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Button tone="secondary" title={`📷${newAtt.length ? ` (${newAtt.length})` : ""}`} onPress={addNewImg} />
            <View style={{ flex: 1 }}><Button title={busy ? "Sending…" : "Send"} disabled={busy || selCount === 0} onPress={startNew} /></View>
          </View>
        </Card>
      </Screen>
    );
  }

  // ----- List -----
  return (
    <Screen>
      <Button title="＋ New message" onPress={() => setMode("new")} />
      {loading && !threads.length ? <Loading label="Loading messages…" /> : (
        <Card style={{ marginTop: 10 }}>
          <CardTitle>Messages</CardTitle>
          {threads.length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No conversations yet. Start one above or wait for your school to message you.</Text> :
            threads.map((th, i) => (
              <Pressable key={th.threadId} onPress={() => setOpenId(th.threadId)}>
                <LineItem first={i === 0} t={`${th.isGroup ? "👥 " : ""}${th.title}`} m={th.last ? `${th.last.mine ? "You: " : ""}${th.last.body}` : ""} right={th.unread ? <Badge tone="warn">{th.unread}</Badge> : null} />
              </Pressable>
            ))}
        </Card>
      )}
      <Note>Secure in-app messaging with your school community, same-tenant only.</Note>
    </Screen>
  );
}

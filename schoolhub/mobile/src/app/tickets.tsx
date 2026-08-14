import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable, Image } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { Card, CardTitle, Sub, Badge, Button, LineItem, Field, Seg, Note, Loading, T, toast } from "@/ui/kit";
import { api } from "@/api/client";

type Attachment = { name: string; type: string; dataUrl: string };
const MAX_ATTACH = 4;
const MAX_ATTACH_CHARS = 2_150_000; // keep just under the server's ~1.6MB cap

/** Pick an image from the library and return it as a base64 data URL the ticket
 *  API accepts ({ name, type, dataUrl }). Compresses via quality to stay under
 *  the server size cap; rejects anything still too large. */
async function pickAttachment(): Promise<Attachment | null> {
  try {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { toast("Photo access is needed to attach an image"); return null; }
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.5, base64: true });
    if (res.canceled || !res.assets?.length) return null;
    const a = res.assets[0];
    if (!a.base64) { toast("Couldn't read that image"); return null; }
    const type = a.mimeType || "image/jpeg";
    const dataUrl = `data:${type};base64,${a.base64}`;
    if (dataUrl.length > MAX_ATTACH_CHARS) { toast("That image is too large — please pick a smaller one"); return null; }
    const name = a.fileName || `photo-${Date.now()}.jpg`;
    return { name, type, dataUrl };
  } catch { toast("Couldn't open the photo library"); return null; }
}

/** Thumbnail strip with remove buttons for pending attachments. */
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

const STATUS_LABEL: Record<string, string> = {
  open: "Open", acknowledged: "Acknowledged", assigned: "Assigned", in_progress: "In Progress",
  pending_user: "Pending you", pending_third_party: "Pending third-party", waiting: "Pending you",
  resolved: "Resolved", closed: "Closed", reopened: "Reopened",
};
const STATUS_TONE: Record<string, any> = { open: "info", acknowledged: "info", assigned: "info", in_progress: "info", pending_user: "warn", pending_third_party: "warn", resolved: "ok", closed: "mut", reopened: "warn" };
const PRIORITY_TONE: Record<string, any> = { low: "mut", medium: "info", high: "warn", critical: "danger" };
const PRIORITIES: [string, string][] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]];
const SEVERITIES: [string, string][] = [["minor", "Minor"], ["normal", "Normal"], ["major", "Major"], ["critical", "Critical"]];
const CATEGORIES: [string, string][] = [["question", "Question"], ["issue", "Issue"], ["bug", "Bug"], ["account", "Account"], ["other", "Other"]];
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");

/** Full support-ticket flow for mobile: list, create, open, reply, close. */
export function SupportTickets() {
  const [mode, setMode] = useState<"list" | "new">("list");
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reply, setReply] = useState("");
  const [form, setForm] = useState<any>({ category: "question", priority: "medium", severity: "normal", subject: "", body: "" });
  const [newAtt, setNewAtt] = useState<Attachment[]>([]);
  const [replyAtt, setReplyAtt] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);

  async function addNewAtt() { if (newAtt.length >= MAX_ATTACH) { toast(`Up to ${MAX_ATTACH} photos`); return; } const a = await pickAttachment(); if (a) setNewAtt((s) => [...s, a]); }
  async function addReplyAtt() { if (replyAtt.length >= MAX_ATTACH) { toast(`Up to ${MAX_ATTACH} photos`); return; } const a = await pickAttachment(); if (a) setReplyAtt((s) => [...s, a]); }

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await api.get<any>("/api/support/tickets?scope=mine"); setTickets(d.tickets || []); } catch { setTickets([]); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const loadDetail = useCallback(async (id: string) => { try { setDetail(await api.get<any>(`/api/support/tickets/${id}`)); } catch { toast("Couldn't load"); } }, []);
  useEffect(() => { if (openId) loadDetail(openId); }, [openId, loadDetail]);

  async function create() {
    if (!form.subject.trim() || !form.body.trim()) { toast("Add a subject and description"); return; }
    setBusy(true);
    try { const d = await api.post<any>("/api/support/tickets", { ...form, attachments: newAtt }); toast(`Raised ${d.ticket?.reference || ""}`); setForm({ category: "question", priority: "medium", severity: "normal", subject: "", body: "" }); setNewAtt([]); setMode("list"); load(); }
    catch (e: any) { toast(e?.data?.error || "Couldn't submit"); } finally { setBusy(false); }
  }
  async function send() {
    if ((!reply.trim() && !replyAtt.length) || !openId) return;
    setBusy(true);
    try { await api.post(`/api/support/tickets/${openId}`, { body: reply.trim(), attachments: replyAtt }); setReply(""); setReplyAtt([]); loadDetail(openId); } catch { toast("Couldn't send"); } finally { setBusy(false); }
  }
  async function close() {
    if (!openId) return;
    try { await api.patch(`/api/support/tickets/${openId}`, { status: "closed" }); loadDetail(openId); load(); } catch { toast("Couldn't close"); }
  }

  // ----- Detail -----
  if (openId && detail) {
    const t = detail.ticket;
    return (
      <View style={{ marginTop: 6 }}>
        <Pressable onPress={() => { setOpenId(null); setDetail(null); }}><Text style={{ color: T.brand, fontWeight: "700", marginBottom: 8 }}>← Back to tickets</Text></Pressable>
        <Card>
          <CardTitle right={<Badge tone={STATUS_TONE[t.status] || "info"}>{STATUS_LABEL[t.status] || t.status}</Badge>}>{t.subject}</CardTitle>
          <Text style={{ fontSize: 11, color: T.muted }}>{t.reference} · {t.category}{t.subcategory ? ` / ${t.subcategory}` : ""}</Text>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
            <Badge tone={PRIORITY_TONE[t.priority] || "info"}>{t.priority}</Badge>
            {t.escalated ? <Badge tone="danger">escalated</Badge> : null}
          </View>
        </Card>
        {(detail.messages || []).map((m: any) => (
          <View key={m.id} style={{ alignItems: m.mine ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <View style={{ maxWidth: "86%", backgroundColor: m.mine ? T.brand : "#fff", borderWidth: 1, borderColor: T.line, borderRadius: 12, padding: 10 }}>
              <Text style={{ fontSize: 10, color: m.mine ? "#E0E7FF" : T.muted }}>{m.senderName}{m.senderRole === "support" ? " · support" : ""}</Text>
              <Text style={{ fontSize: 13, color: m.mine ? "#fff" : T.ink }}>{m.body}</Text>
              {(m.attachments || []).length ? (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 5 }}>
                  {m.attachments.map((att: any, ai: number) => (
                    att?.dataUrl ? <Image key={ai} source={{ uri: att.dataUrl }} style={{ width: 92, height: 92, borderRadius: 8, borderWidth: 1, borderColor: m.mine ? "#6366F1" : T.line }} />
                      : <Text key={ai} style={{ fontSize: 11, color: m.mine ? "#E0E7FF" : T.muted }}>📎 {att?.name || "attachment"}</Text>
                  ))}
                </View>
              ) : null}
              <Text style={{ fontSize: 9, color: m.mine ? "#C7D2FE" : T.muted, marginTop: 3 }}>{dt(m.createdAt)}</Text>
            </View>
          </View>
        ))}
        {t.status !== "closed" ? (
          <>
            <Field placeholder="Write a reply…" value={reply} onChangeText={setReply} multiline style={{ minHeight: 54 }} />
            <AttachStrip items={replyAtt} onRemove={(i) => setReplyAtt((s) => s.filter((_, x) => x !== i))} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              <Button tone="secondary" title={`📷 Photo${replyAtt.length ? ` (${replyAtt.length})` : ""}`} onPress={addReplyAtt} />
              <View style={{ flex: 1 }}><Button title={busy ? "Sending…" : "Send reply"} disabled={busy} onPress={send} /></View>
              <Button tone="secondary" title="Close" onPress={close} />
            </View>
          </>
        ) : <Note>This ticket is closed. Reply from the web portal to reopen it.</Note>}
      </View>
    );
  }

  // ----- New ticket -----
  if (mode === "new") {
    return (
      <View style={{ marginTop: 6 }}>
        <Pressable onPress={() => setMode("list")}><Text style={{ color: T.brand, fontWeight: "700", marginBottom: 8 }}>← Back</Text></Pressable>
        <Card>
          <CardTitle>New support request</CardTitle>
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 8, marginBottom: 4 }}>Category</Text>
          <Seg options={CATEGORIES.map(([k, l]) => ({ label: l, active: form.category === k, onPress: () => setForm({ ...form, category: k }) }))} />
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 8, marginBottom: 4 }}>Priority</Text>
          <Seg options={PRIORITIES.map(([k, l]) => ({ label: l, active: form.priority === k, onPress: () => setForm({ ...form, priority: k }) }))} />
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 8, marginBottom: 4 }}>Severity</Text>
          <Seg options={SEVERITIES.map(([k, l]) => ({ label: l, active: form.severity === k, onPress: () => setForm({ ...form, severity: k }) }))} />
          <Field label="Subject" value={form.subject} onChangeText={(v: string) => setForm({ ...form, subject: v })} placeholder="Brief summary" />
          <Field label="Description" value={form.body} onChangeText={(v: string) => setForm({ ...form, body: v })} multiline style={{ minHeight: 90 }} placeholder="What's happening…" />
          <Text style={{ fontSize: 12, color: T.muted, marginTop: 8, marginBottom: 4 }}>Photos (optional)</Text>
          <AttachStrip items={newAtt} onRemove={(i) => setNewAtt((s) => s.filter((_, x) => x !== i))} />
          <View style={{ marginTop: newAtt.length ? 8 : 0, marginBottom: 8 }}>
            <Button tone="secondary" title={`📷 Add photo${newAtt.length ? ` (${newAtt.length}/${MAX_ATTACH})` : ""}`} onPress={addNewAtt} />
          </View>
          <Button title={busy ? "Submitting…" : "Submit request"} disabled={busy} onPress={create} />
        </Card>
      </View>
    );
  }

  // ----- List -----
  return (
    <View style={{ marginTop: 6 }}>
      <Button title="＋ New support request" onPress={() => setMode("new")} />
      {loading ? <Loading label="Loading tickets…" /> : tickets.length === 0 ? (
        <Sub style={{ marginTop: 10 }}>No tickets yet. Raise one above and track it here.</Sub>
      ) : (
        <Card style={{ marginTop: 10 }}>
          <CardTitle>My tickets</CardTitle>
          {tickets.map((t, i) => (
            <Pressable key={t.id} onPress={() => setOpenId(t.id)}>
              <LineItem first={i === 0} t={`${t.subject}`} m={`${t.reference} · ${t.priority}${t.slaState === "breached" ? " · SLA breached" : ""}`} right={<Badge tone={STATUS_TONE[t.status] || "info"}>{STATUS_LABEL[t.status] || t.status}</Badge>} />
            </Pressable>
          ))}
        </Card>
      )}
    </View>
  );
}

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, Pressable } from "react-native";
import { Card, CardTitle, Sub, Badge, Button, LineItem, Field, Seg, Note, Loading, T, toast } from "@/ui/kit";
import { api } from "@/api/client";

const STATUS_LABEL: Record<string, string> = {
  open: "Open", acknowledged: "Acknowledged", assigned: "Assigned", in_progress: "In Progress",
  pending_user: "Pending you", pending_third_party: "Pending third-party", waiting: "Pending you",
  resolved: "Resolved", closed: "Closed", reopened: "Reopened",
};
const STATUS_TONE: Record<string, any> = { open: "info", acknowledged: "info", assigned: "info", in_progress: "info", pending_user: "warn", pending_third_party: "warn", resolved: "ok", closed: "mut", reopened: "warn" };
const PRIORITY_TONE: Record<string, any> = { low: "mut", medium: "info", high: "warn", critical: "danger" };
const PRIORITIES: [string, string][] = [["low", "Low"], ["medium", "Medium"], ["high", "High"], ["critical", "Critical"]];
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
  const [form, setForm] = useState<any>({ category: "question", priority: "medium", subject: "", body: "" });
  const [busy, setBusy] = useState(false);

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
    try { const d = await api.post<any>("/api/support/tickets", form); toast(`Raised ${d.ticket?.reference || ""}`); setForm({ category: "question", priority: "medium", subject: "", body: "" }); setMode("list"); load(); }
    catch (e: any) { toast(e?.data?.error || "Couldn't submit"); } finally { setBusy(false); }
  }
  async function send() {
    if (!reply.trim() || !openId) return;
    setBusy(true);
    try { await api.post(`/api/support/tickets/${openId}`, { body: reply.trim() }); setReply(""); loadDetail(openId); } catch { toast("Couldn't send"); } finally { setBusy(false); }
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
              {(m.attachments || []).length ? <Text style={{ fontSize: 11, color: m.mine ? "#E0E7FF" : T.muted, marginTop: 3 }}>📎 {m.attachments.length} attachment(s) — view on web</Text> : null}
              <Text style={{ fontSize: 9, color: m.mine ? "#C7D2FE" : T.muted, marginTop: 3 }}>{dt(m.createdAt)}</Text>
            </View>
          </View>
        ))}
        {t.status !== "closed" ? (
          <>
            <Field placeholder="Write a reply…" value={reply} onChangeText={setReply} multiline style={{ minHeight: 54 }} />
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
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
          <Field label="Subject" value={form.subject} onChangeText={(v: string) => setForm({ ...form, subject: v })} placeholder="Brief summary" />
          <Field label="Description" value={form.body} onChangeText={(v: string) => setForm({ ...form, body: v })} multiline style={{ minHeight: 90 }} placeholder="What's happening…" />
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

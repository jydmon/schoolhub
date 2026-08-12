import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Screen, Card, CardTitle, Sub, Badge, Button, Row, LineItem, Seg, Field, Note, Bubble, Toggle, Sheet, Loading, Empty, T, toast,
} from "@/ui/kit";
import { AI, POLICIES, TROUBLE, RoleKey } from "@/data/mock";
import { useApi } from "@/data/useApi";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthContext";

/* ---------------- Assistant (live: POST /api/ai/ask) ---------------- */
export function Assistant({ roleKey }: { roleKey: RoleKey }) {
  const { boot } = useAuth();
  const who = (boot?.user?.name || "there").split(" ")[0];
  const suggestions = (AI[roleKey] || AI.parent).map((q) => q[0]);
  const [msgs, setMsgs] = useState<["me" | "ai", string][]>([
    ["ai", `Hi ${who} — I'm your SIPlat assistant. I only use data you're allowed to see. Ask me anything about your school.`],
  ]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setQ("");
    setMsgs((m) => [...m, ["me", question]]);
    setBusy(true);
    try {
      const res = await api.post<any>("/api/ai/ask", { question });
      setMsgs((m) => [...m, ["ai", res?.answer || "I couldn't find an answer to that."]]);
    } catch (e: any) {
      setMsgs((m) => [...m, ["ai", "Sorry — I couldn't reach the assistant just now. Please try again."]]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      {roleKey === "parent" ? (
        <Card style={{ padding: 12 }}>
          <Row first>
            <Text style={{ fontWeight: "700", fontSize: 13, color: T.ink }}>Premium AI <Badge tone="warn">Premium</Badge></Text>
            <Badge tone="ok">active</Badge>
          </Row>
          <Text style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Answers across timetable, menu, attendance, reports, transport & trends — scoped to your children.</Text>
        </Card>
      ) : null}

      <View style={{ marginBottom: 6 }}>
        {msgs.map((mm, i) => <Bubble key={i} who={mm[0]}>{mm[1]}</Bubble>)}
        {busy ? <Bubble who="ai">…</Bubble> : null}
      </View>

      <Seg options={suggestions.map((sq) => ({ label: sq, onPress: () => ask(sq) }))} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}><Field placeholder="Ask a question…" value={q} onChangeText={setQ} onSubmitEditing={() => ask(q)} returnKeyType="send" /></View>
        <Button sm title="Ask" onPress={() => ask(q)} disabled={busy} />
      </View>
      <Note>Answers are scoped to your role & tenant; the assistant never reveals data you can't access.</Note>
    </Screen>
  );
}

/* ---------------- Alerts / notification inbox (live: /api/me/notifications) ---------------- */
export function Inbox() {
  const { refreshBadge } = useAuth();
  const { data, loading, error, reload } = useApi<any>("/api/me/notifications");
  const items: any[] = data?.items || data?.notifications || (Array.isArray(data) ? data : []);
  const unread = items.filter((n) => !n.read).length;

  async function mark(ids?: string[], all?: boolean) {
    try {
      await api.post("/api/me/notifications", all ? { all: true } : { ids });
      const next = all ? 0 : Math.max(0, unread - (ids?.length || 0));
      refreshBadge(next);
      reload();
    } catch { toast("Couldn't update"); }
  }

  if (loading && !data) return <Screen><Loading label="Loading notifications…" /></Screen>;

  return (
    <Screen>
      <Card>
        <CardTitle right={unread ? <Badge tone="warn">{unread} new</Badge> : <Badge tone="ok">all read</Badge>}>What's new</CardTitle>
        <Sub>Updates for you — also sent by push, email, SMS or WhatsApp.</Sub>
        {items.length === 0 ? (
          <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 8 }}>You're all caught up.</Text>
        ) : items.map((n, i) => (
          <LineItem key={n.id || i} first={i === 0} highlight={!n.read}
            t={n.title} m={n.body || n.message}
            right={
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                {n.kind ? <Badge tone="mut">{String(n.kind)}</Badge> : null}
                {!n.read ? <Button sm tone="secondary" title="Mark read" onPress={() => mark([n.id])} /> : null}
              </View>
            } />
        ))}
        {items.length > 0 ? <Button tone="secondary" title="Mark all read" onPress={() => mark(undefined, true)} /> : null}
      </Card>
      {error ? <Note>Showing saved notifications — couldn't refresh right now.</Note> : null}
    </Screen>
  );
}

/* ---------------- Account (live identity + settings sheets) ---------------- */
export function Account({ roleKey }: { roleKey: RoleKey }) {
  const { boot, logout } = useAuth();
  const [sheet, setSheet] = useState<null | "notif" | "help" | "policies">(null);
  const [ch, setCh] = useState({ push: true, email: true, sms: false });
  const roleLabel = roleKey.charAt(0).toUpperCase() + roleKey.slice(1);

  return (
    <Screen>
      <Card>
        <CardTitle>Account</CardTitle>
        <LineItem first t={boot?.user?.name} m={boot?.user?.email} right={<Badge tone="info">{roleLabel}</Badge>} />
        {boot?.children?.length ? <LineItem t="Children" m={boot.children.map((c) => c.name).join(", ")} /> : null}
        <Row><Text style={s.k}>Connected</Text><Badge tone="ok">dev.siplat.com</Badge></Row>
      </Card>

      <Card>
        <CardTitle>Support & settings</CardTitle>
        <Pressable onPress={() => setSheet("notif")}><LineItem first t="🔔  Notifications" right={<Badge tone="mut">manage</Badge>} /></Pressable>
        <Pressable onPress={() => setSheet("help")}><LineItem t="🛟  Help centre" right={<Badge tone="mut">open</Badge>} /></Pressable>
        <Pressable onPress={() => setSheet("policies")}><LineItem t="📜  Policies" right={<Badge tone="mut">read</Badge>} /></Pressable>
      </Card>

      <Button tone="secondary" title="Sign out" onPress={logout} />

      <Sheet visible={sheet === "notif"} title="Notifications" onClose={() => setSheet(null)}>
        <Card style={{ marginTop: 6 }}>
          <CardTitle>Delivery channels</CardTitle>
          {([["push", "Push"], ["email", "Email"], ["sms", "SMS"]] as const).map(([k, label], i) => (
            <Row key={k} first={i === 0}>
              <Text style={s.v}>{label}</Text>
              <Toggle on={(ch as any)[k]} onPress={() => setCh((c) => ({ ...c, [k]: !(c as any)[k] }))} />
            </Row>
          ))}
        </Card>
        <Note>Emergency safety alerts are always on. Everything else is your choice.</Note>
      </Sheet>

      <Sheet visible={sheet === "help"} title="Help Centre" onClose={() => setSheet(null)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Field placeholder="Search or ask a question…" /></View>
          <Button sm title="✨" onPress={() => toast("AI help (demo)")} />
        </View>
        <Card style={{ marginTop: 10 }}>
          <CardTitle>🩺 Troubleshooting</CardTitle>
          {TROUBLE.map(([t, m], i) => <LineItem key={t} first={i === 0} t={t} m={m} />)}
        </Card>
        <Card>
          <CardTitle>💬 Contact support</CardTitle>
          <Seg options={[
            { label: "Live chat", onPress: () => toast("Live chat (demo)") },
            { label: "Email", onPress: () => toast("Email (demo)") },
          ]} />
          <Button title="Raise a ticket" onPress={() => toast("Ticket raised (demo)")} />
        </Card>
      </Sheet>

      <Sheet visible={sheet === "policies"} title="Legal & Compliance" onClose={() => setSheet(null)}>
        <Sub style={{ marginTop: 6 }}>View and accept updated documents.</Sub>
        {POLICIES.map(([t], i) => (
          <LineItem key={t} first={i === 0} t={t} right={<Button sm tone="secondary" title="View" onPress={() => toast(t)} />} />
        ))}
      </Sheet>
    </Screen>
  );
}

const s = {
  k: { fontWeight: "600" as const, fontSize: 13, color: T.ink },
  v: { fontWeight: "600" as const, fontSize: 13, color: T.ink },
};

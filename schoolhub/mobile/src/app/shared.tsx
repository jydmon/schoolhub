import React, { useState } from "react";
import { View, Text, Pressable } from "react-native";
import {
  Screen, Card, CardTitle, Sub, Badge, Button, Row, LineItem, Seg, Field, Note, Bubble, Toggle, Sheet, T, toast,
} from "@/ui/kit";
import { AI, APPS, ACCOUNTS, POLICIES, TROUBLE, RoleKey } from "@/data/mock";
import { useRole } from "@/app/ctx";
import { useAuth } from "@/auth/AuthContext";

/* ---------------- Assistant ---------------- */
export function Assistant({ roleKey }: { roleKey: RoleKey }) {
  const qs = AI[roleKey] || AI.parent;
  const who = APPS[roleKey].who.split(" ")[0];
  const [msgs, setMsgs] = useState<["me" | "ai", string][]>([
    ["ai", `Hi ${who} — I'm your SIPlat assistant. I only use data you're allowed to see. Try a question below.`],
    ["me", qs[0][0]],
    ["ai", qs[0][1]],
  ]);
  const ask = (i: number) => setMsgs((m) => [...m, ["me", qs[i][0]], ["ai", qs[i][1]]]);

  return (
    <Screen>
      {roleKey === "parent" ? (
        <Card style={{ padding: 12 }}>
          <Row first>
            <Text style={{ fontWeight: "700", fontSize: 13, color: T.ink }}>Premium AI <Badge tone="warn">Premium</Badge></Text>
            <Badge tone="ok">active · £2.99/mo</Badge>
          </Row>
          <Text style={{ fontSize: 11, color: T.muted, marginTop: 4 }}>Answers across timetable, menu, attendance, reports, transport & multi-year trends.</Text>
        </Card>
      ) : null}

      <View style={{ marginBottom: 6 }}>
        {msgs.map((mm, i) => <Bubble key={i} who={mm[0]}>{mm[1]}</Bubble>)}
      </View>

      <Seg options={qs.map((q, i) => ({ label: q[0], onPress: () => ask(i) }))} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ flex: 1 }}><Field placeholder="Ask a question…" /></View>
        <Button sm title="Ask" onPress={() => toast("Answered above (demo)")} />
      </View>
      <Note>Answers are scoped to your role & tenant; the assistant never reveals data you can't access.</Note>
    </Screen>
  );
}

/* ---------------- Alerts / notification inbox ---------------- */
export function Inbox() {
  const { inbox, unread, mark, markAll } = useRole();
  return (
    <Screen>
      <Card>
        <CardTitle right={unread ? <Badge tone="warn">{unread} new</Badge> : <Badge tone="ok">all read</Badge>}>What's new</CardTitle>
        <Sub>New updates for you — also sent by push, email, SMS or WhatsApp. Tap “Mark read” to clear the badge.</Sub>
        {inbox.map((n, i) => (
          <LineItem key={n.id} first={i === 0} highlight={!n.read}
            t={n.t} m={n.m}
            right={
              <View style={{ alignItems: "flex-end", gap: 4 }}>
                <Badge tone={(["event", "trip", "reward"].includes(n.tag) ? "info" : n.tag === "transport" || n.tag === "policy" ? "warn" : "mut") as any}>{n.tag}</Badge>
                {!n.read ? <Button sm tone="secondary" title="Mark read" onPress={() => mark(n.id)} /> : null}
              </View>
            } />
        ))}
        <Button tone="secondary" title="Mark all read" onPress={markAll} />
      </Card>
    </Screen>
  );
}

/* ---------------- Account (+ sheets) ---------------- */
export function Account({ roleKey }: { roleKey: RoleKey }) {
  const a = ACCOUNTS[roleKey];
  const { logout } = useAuth();
  const [sheet, setSheet] = useState<null | "notif" | "help" | "policies">(null);
  const [ch, setCh] = useState({ push: true, email: true, sms: false });

  return (
    <Screen>
      <Card>
        <CardTitle>Account</CardTitle>
        <LineItem first t={a.name} m={a.email} right={<Badge tone="info">{a.role.split(" · ")[0]}</Badge>} />
        <Row><Text style={s.k}>Role</Text><Text style={s.v}>{a.role}</Text></Row>
        <Row><Text style={s.k}>Offline cache</Text><Badge tone="ok">synced</Badge></Row>
      </Card>

      <Card>
        <CardTitle>Support & settings</CardTitle>
        <Pressable onPress={() => setSheet("notif")}><LineItem first t="🔔  Notifications" right={<Badge tone="mut">manage</Badge>} /></Pressable>
        <Pressable onPress={() => setSheet("help")}><LineItem t="🛟  Help centre" right={<Badge tone="mut">open</Badge>} /></Pressable>
        <Pressable onPress={() => setSheet("policies")}><LineItem t="📜  Policies" right={<Badge tone="mut">read</Badge>} /></Pressable>
      </Card>

      <Button tone="secondary" title="Sign out" onPress={logout} />

      {/* Notifications sheet */}
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

      {/* Help sheet */}
      <Sheet visible={sheet === "help"} title="Help Centre" onClose={() => setSheet(null)}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <View style={{ flex: 1 }}><Field placeholder="Search or ask a question…" /></View>
          <Button sm title="✨" onPress={() => toast("AI help (demo)")} />
        </View>
        <Card style={{ marginTop: 10 }}>
          <CardTitle>Guides & FAQs</CardTitle>
          <LineItem first t="Getting started" right={<Button sm title="Open" onPress={() => toast("Guide (demo)")} />} />
          <LineItem t="Video tutorials" right={<Button sm title="Watch" onPress={() => toast("Videos (demo)")} />} />
        </Card>
        <Card>
          <CardTitle>🩺 Troubleshooting</CardTitle>
          {TROUBLE.map(([t, m], i) => <LineItem key={t} first={i === 0} t={t} m={m} />)}
        </Card>
        <Card>
          <CardTitle>💬 Contact support</CardTitle>
          <Seg options={[
            { label: "Live chat", onPress: () => toast("Live chat (demo)") },
            { label: "AI chatbot", onPress: () => toast("AI chatbot (demo)") },
            { label: "Email", onPress: () => toast("Email (demo)") },
          ]} />
          <LineItem first t="My case: Bus not showing" m="SIP-2043 · High" right={<Badge tone="info">in progress</Badge>} />
          <Button title="Raise a ticket" onPress={() => toast("Ticket raised (demo)")} />
        </Card>
        <Card>
          <CardTitle>🟢 System status</CardTitle>
          <LineItem first t="All systems" right={<Badge tone="ok">operational</Badge>} />
          <LineItem t="Release notes" right={<Button sm title="v3.4.0" onPress={() => toast("v3.4.0 (demo)")} />} />
        </Card>
      </Sheet>

      {/* Policies sheet */}
      <Sheet visible={sheet === "policies"} title="Legal & Compliance" onClose={() => setSheet(null)}>
        <Sub style={{ marginTop: 6 }}>View, download & accept updated documents. Re-acknowledge every 6 months.</Sub>
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

import React, { useEffect, useState, useCallback } from "react";
import { View, Text, FlatList } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { api } from "@/api/client";
import { cacheGet, cacheSet } from "@/offline/store";
import { writeOrQueue } from "@/offline/queue";
import { useOnline } from "@/net/useOnline";
import { useAuth } from "@/auth/AuthContext";
import { Screen, Card, Title, Sub, Muted, Row, Badge, Button, Field, Notice, Loading, T } from "@/ui/kit";

const Tab = createBottomTabNavigator();

/** Cache-first data hook: show last-synced data instantly, revalidate when online. */
function useData<T = any>(key: string, path: string) {
  const online = useOnline();
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const load = useCallback(async () => {
    const cached = await cacheGet<T>(key); if (cached) { setData(cached.value); setStale(true); }
    if (online) { try { const fresh = await api.get<T>(path); setData(fresh); setStale(false); await cacheSet(key, fresh); } catch {} }
  }, [key, path, online]);
  useEffect(() => { load(); }, [load]);
  return { data, stale, reload: load };
}

function OfflineBar({ stale }: { stale: boolean }) {
  const online = useOnline();
  if (online && !stale) return null;
  return <Notice tone="info">{online ? "Showing recent data…" : "Offline — showing last synced information"}</Notice>;
}

function Dashboard() {
  const { boot } = useAuth();
  const { data, stale } = useData<any>("parent:today", "/api/parent/overview?range=today");
  return (
    <Screen>
      <Title>Hi {boot?.user.name?.split(" ")[0]} 👋</Title>
      <OfflineBar stale={stale} />
      {(boot?.children || []).map((c: any) => (
        <Card key={c.id}><Row><Text style={{ fontWeight: "700", color: T.ink }}>{c.name}</Text><Badge>{c.yearGroup || "—"}</Badge></Row></Card>
      ))}
      <Card>
        <Title>Today</Title>
        {!data ? <Loading /> : (data.events || []).length === 0 ? <Muted>Nothing scheduled today.</Muted> :
          (data.events || []).map((e: any) => (
            <View key={e.id} style={{ paddingVertical: 6, borderTopWidth: 1, borderTopColor: T.line }}>
              <Text style={{ color: T.ink, fontWeight: "600" }}>{e.allDay ? "All day" : new Date(e.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {e.title}</Text>
              {e.location ? <Muted>{e.location}</Muted> : null}
            </View>
          ))}
      </Card>
      {data?.outstanding?.length > 0 && (
        <Card style={{ borderColor: T.warn }}>
          <Title>Outstanding actions</Title>
          {data.outstanding.map((o: any, i: number) => <Text key={i} style={{ color: T.ink, marginTop: 4 }}>• {o.title} — consent for {o.childName}</Text>)}
        </Card>
      )}
    </Screen>
  );
}

function TransportScreen() {
  const { data, stale } = useData<any>("parent:transport", "/api/parent/transport");
  return (
    <Screen>
      <Title>Transport</Title>
      <Sub>You only ever see your own child's journey.</Sub>
      <OfflineBar stale={stale} />
      {!data ? <Loading /> : (data.items || []).length === 0 ? <Card><Muted>No transport scheduled today.</Muted></Card> :
        data.items.map((it: any, i: number) => (
          <Card key={i}>
            <Row><Text style={{ fontWeight: "700", color: T.ink }}>{it.childName}</Text>
              <Badge tone={it.status === "completed" ? "ok" : "neutral"}>{it.childStatus || it.status}</Badge></Row>
            <Muted style={{ marginTop: 4 }}>{it.session === "am" ? "Morning" : "Afternoon"} · {it.routeName}</Muted>
            <Muted>{it.approxLocation}{it.eta ? ` · ETA ${new Date(it.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}{it.delayMinutes ? ` · +${it.delayMinutes} min` : ""}</Muted>
          </Card>
        ))}
    </Screen>
  );
}

function Alerts() {
  const { logout, boot } = useAuth();
  const { data, reload } = useData<any>("parent:alerts", "/api/parent/notifications");
  async function markRead() { await api.post("/api/parent/notifications", {}); reload(); }
  return (
    <Screen>
      <Row><Title>Notifications</Title>{data?.unread ? <Badge tone="danger">{data.unread}</Badge> : null}</Row>
      {data?.unread ? <Button title="Mark all read" tone="secondary" onPress={markRead} /> : null}
      {(data?.notifications || []).map((n: any) => (
        <Card key={n.id} style={{ opacity: n.read ? 0.6 : 1 }}>
          <Text style={{ fontWeight: "700", color: T.ink }}>{n.title}</Text>
          {n.body ? <Muted>{n.body}</Muted> : null}
          <Muted>{new Date(n.createdAt).toLocaleString()}</Muted>
        </Card>
      ))}
      <Card><Muted>Signed in as {boot?.user.email}</Muted><Button title="Sign out" tone="secondary" onPress={logout} /></Card>
    </Screen>
  );
}

function Assistant() {
  const online = useOnline();
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  async function ask() {
    if (!q.trim()) return; setBusy(true);
    try { const d = await api.post("/api/ai/ask", { question: q, lang: "en" }); setTurns([{ q, a: d.answer, cites: d.citations }, ...turns]); setQ(""); }
    catch { setTurns([{ q, a: "Couldn't reach the assistant.", cites: [] }, ...turns]); }
    setBusy(false);
  }
  return (
    <Screen>
      <Title>Assistant</Title>
      <Sub>Answers only from information you're allowed to see. Sources cited.</Sub>
      {!online && <Notice tone="info">The assistant needs a connection.</Notice>}
      <Field placeholder="e.g. What does my child need tomorrow?" value={q} onChangeText={setQ} />
      <Button title={busy ? "…" : "Ask"} onPress={ask} disabled={busy || !online} />
      {turns.map((t, i) => (
        <Card key={i}><Text style={{ fontWeight: "700", color: T.ink }}>{t.q}</Text>
          <Text style={{ color: T.ink, marginTop: 6 }}>{t.a}</Text>
          {t.cites?.length ? <Muted style={{ marginTop: 6 }}>Sources: {t.cites.map((c: any) => c.title).join(", ")}</Muted> : null}</Card>
      ))}
    </Screen>
  );
}

/** Messaging consent: parents opt in to WhatsApp (required) and manage SMS (opt-out). */
function Settings() {
  const online = useOnline();
  const [s, setS] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => { try { const d = await api.get("/api/parent/messaging"); setS(d); } catch {} }, []);
  useEffect(() => { load(); }, [load]);

  async function set(channel: string, optIn: boolean) {
    setBusy(true); setMsg(null);
    try {
      const body: any = { channel, optIn };
      if (!s?.hasPhone && phone.trim()) body.phone = phone.trim();
      const r = await api.post("/api/parent/messaging", body);
      if (r?.error) setMsg(r.error); else { setMsg(optIn ? "Enabled." : "Turned off."); await load(); }
    } catch (e: any) { setMsg(e?.message || "Could not update."); }
    setBusy(false);
  }

  return (
    <Screen>
      <Title>Messaging</Title>
      <Sub>Choose how the school reaches you. You can change this anytime.</Sub>
      {!online && <Notice tone="info">Connect to change your messaging preferences.</Notice>}
      <Card>
        <Row><Text style={{ fontWeight: "700", color: T.ink }}>Mobile number</Text>
          {s?.hasPhone ? <Badge tone="ok">{s.phone}</Badge> : <Badge tone="warn">not set</Badge>}</Row>
        {!s?.hasPhone && <Field label="Add mobile (e.g. +447700900123)" keyboardType="phone-pad" value={phone} onChangeText={setPhone} />}
      </Card>
      <Card>
        <Row><View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: T.ink }}>WhatsApp</Text>
          <Muted>Get updates on WhatsApp. Requires your opt-in.</Muted></View>
          <Badge tone={s?.whatsapp?.optedIn ? "ok" : "neutral"}>{s?.whatsapp?.optedIn ? "On" : "Off"}</Badge></Row>
        {s?.whatsapp?.optedIn
          ? <Button title="Turn off WhatsApp" tone="secondary" onPress={() => set("whatsapp", false)} disabled={busy || !online} />
          : <Button title="Enable WhatsApp" onPress={() => set("whatsapp", true)} disabled={busy || !online} />}
      </Card>
      <Card>
        <Row><View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: T.ink }}>Text messages (SMS)</Text>
          <Muted>On by default for school contact. Reply STOP anytime.</Muted></View>
          <Badge tone={s?.sms?.optedOut ? "neutral" : "ok"}>{s?.sms?.optedOut ? "Off" : "On"}</Badge></Row>
        {s?.sms?.optedOut
          ? <Button title="Turn SMS back on" onPress={() => set("sms", true)} disabled={busy || !online} />
          : <Button title="Turn off SMS" tone="secondary" onPress={() => set("sms", false)} disabled={busy || !online} />}
      </Card>
      <Notice tone="info">Emergency alerts are always delivered, regardless of these settings.</Notice>
      {msg ? <Notice tone="info">{msg}</Notice> : null}
    </Screen>
  );
}

const REPORT_TYPE_LABEL: Record<string, string> = {
  annual: "Annual report", termly: "Termly report", attendance_behaviour: "Attendance & behaviour", custom: "Report",
};

/** Released school reports for this parent's children, with a detail view. */
function ReportsScreen() {
  const online = useOnline();
  const [list, setList] = useState<any[]>([]);
  const [open, setOpen] = useState<any>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  const load = useCallback(async () => {
    const c = await cacheGet<any>("parent:reports"); if (c) setList(c.value.reports || []);
    if (online) { try { const d = await api.get("/api/parent/reports"); setList(d.reports || []); await cacheSet("parent:reports", d); } catch {} }
  }, [online]);
  useEffect(() => { load(); }, [load]);

  async function openReport(id: string) {
    setLoadingDetail(true);
    try { const d = await api.get(`/api/parent/reports/${id}`); setOpen(d.report); } catch {} finally { setLoadingDetail(false); }
  }

  if (loadingDetail) return <Screen><Loading /></Screen>;

  if (open) {
    const subjects: any[] = Array.isArray(open.body?.subjects) ? open.body.subjects : [];
    return (
      <Screen>
        <Button title="‹ Back to reports" tone="secondary" onPress={() => setOpen(null)} />
        <Title>{open.title}</Title>
        <Sub>{REPORT_TYPE_LABEL[open.type] || "Report"}{open.term ? ` · ${open.term}` : ""} · {open.student?.firstName} {open.student?.lastName}</Sub>
        {open.summary ? <Card><Text style={{ color: T.ink }}>{open.summary}</Text></Card> : null}
        {subjects.length > 0 && (
          <Card>
            <Text style={{ fontWeight: "700", color: T.ink, marginBottom: 6 }}>Subjects</Text>
            {subjects.map((sub: any, i: number) => (
              <Row key={i} style={{ paddingVertical: 4 }}>
                <Text style={{ color: T.ink }}>{sub.name}</Text>
                <Badge tone="ok">{sub.grade ?? sub.attainment ?? ""}</Badge>
              </Row>
            ))}
          </Card>
        )}
        {open.body?.comment ? <Card><Text style={{ fontWeight: "700", color: T.ink, marginBottom: 4 }}>Teacher comment</Text><Text style={{ color: T.ink }}>{open.body.comment}</Text></Card> : null}
        {open.body?.attendance ? <Card><Row><Text style={{ color: T.ink }}>Attendance</Text><Badge tone="ok">{open.body.attendance}</Badge></Row></Card> : null}
        {open.fileUrl ? <Card><Muted>A PDF copy is attached — open it from the school portal or the emailed link.</Muted></Card> : null}
        <Muted>Released {open.releasedAt ? new Date(open.releasedAt).toLocaleDateString() : ""}</Muted>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Reports</Title>
      <Sub>Your children&apos;s school reports appear here as soon as the school releases them.</Sub>
      {list.length === 0
        ? <Card><Muted>No reports yet. You&apos;ll get a notification when a new report is released.</Muted></Card>
        : list.map((r) => (
          <Card key={r.id}>
            <Row>
              <View style={{ flex: 1 }}>
                <Text style={{ fontWeight: "700", color: T.ink }}>{r.title}</Text>
                <Muted>{r.student?.firstName} · {REPORT_TYPE_LABEL[r.type] || "Report"}{r.term ? ` · ${r.term}` : ""}</Muted>
              </View>
              {!r.viewed ? <Badge tone="warn">new</Badge> : null}
            </Row>
            <Button title="View report" onPress={() => openReport(r.id)} />
          </Card>
        ))}
    </Screen>
  );
}

export default function ParentApp() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true, tabBarActiveTintColor: T.brand }}>
      <Tab.Screen name="Home" component={Dashboard} />
      <Tab.Screen name="Transport" component={TransportScreen} />
      <Tab.Screen name="Reports" component={ReportsScreen} />
      <Tab.Screen name="Assistant" component={Assistant} />
      <Tab.Screen name="Alerts" component={Alerts} />
      <Tab.Screen name="Messaging" component={Settings} />
    </Tab.Navigator>
  );
}

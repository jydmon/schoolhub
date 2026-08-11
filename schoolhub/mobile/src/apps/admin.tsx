import React, { useEffect, useState, useCallback } from "react";
import { View, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { api } from "@/api/client";
import { cacheGet, cacheSet } from "@/offline/store";
import { useOnline } from "@/net/useOnline";
import { useAuth } from "@/auth/AuthContext";
import { Screen, Card, Title, Sub, Muted, Row, Badge, Button, Field, Notice, Loading, T } from "@/ui/kit";

const Tab = createBottomTabNavigator();

/** Cache-first data hook shared by admin screens. */
function useData<T = any>(key: string, path: string | null) {
  const online = useOnline();
  const [data, setData] = useState<T | null>(null);
  const [stale, setStale] = useState(false);
  const load = useCallback(async () => {
    if (!path) return;
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
  const schoolId = boot?.schools?.[0];
  const { data, stale, reload } = useData<any>("admin:ops", schoolId ? `/api/schools/${schoolId}/ops/dashboard` : null);
  return (
    <Screen>
      <Title>Operations</Title>
      <Sub>Live snapshot across transport, trips, safeguarding and communications.</Sub>
      <OfflineBar stale={stale} />
      {!schoolId ? <Card><Muted>No school assigned to this account.</Muted></Card> :
        !data ? <Loading /> : (
          <>
            <Row style={{ flexWrap: "wrap" }}>
              {(data.tiles || []).map((t: any, i: number) => (
                <Card key={i} style={{ flexGrow: 1, minWidth: 150 }}>
                  <Muted>{t.label}</Muted>
                  <Text style={{ fontSize: 26, fontWeight: "800", color: t.tone === "warn" ? T.warn : t.tone === "danger" ? T.danger : T.ink }}>{t.value}</Text>
                  {t.hint ? <Muted>{t.hint}</Muted> : null}
                </Card>
              ))}
            </Row>
            {(data.attention || []).length > 0 && (
              <Card style={{ borderColor: T.warn }}>
                <Title>Needs attention</Title>
                {data.attention.map((a: any, i: number) => (
                  <Row key={i} style={{ paddingVertical: 4 }}>
                    <Text style={{ color: T.ink, flex: 1 }}>{a.title}</Text>
                    <Badge tone={a.severity === "high" ? "danger" : "warn"}>{a.severity || "review"}</Badge>
                  </Row>
                ))}
              </Card>
            )}
            <Button title="Refresh" tone="secondary" onPress={reload} />
          </>
        )}
    </Screen>
  );
}

function Emergency() {
  const { boot } = useAuth();
  const online = useOnline();
  const schoolId = boot?.schools?.[0];
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    if (!schoolId || !message.trim()) return;
    setBusy(true); setSent(null);
    try {
      const d = await api.post(`/api/schools/${schoolId}/emergency`, { title: title || "Emergency alert", message, channels: ["push", "sms", "email"] });
      setSent(`Alert dispatched to ${d.recipients ?? "all"} recipient(s) across ${(d.channels || []).join(", ") || "all channels"}.`);
      setTitle(""); setMessage(""); setConfirm(false);
    } catch (e: any) { setSent(e?.message || "Could not send alert."); }
    setBusy(false);
  }

  return (
    <Screen>
      <Title>Emergency broadcast</Title>
      <Sub>Overrides quiet hours and category preferences. Use only for genuine emergencies.</Sub>
      {!online && <Notice tone="err">You must be online to send an emergency alert.</Notice>}
      <Card>
        <Field label="Title" placeholder="e.g. School closure" value={title} onChangeText={setTitle} />
        <Field label="Message" placeholder="What families need to know and do" value={message} onChangeText={setMessage} multiline />
        {!confirm ? (
          <Button title="Prepare alert" tone="danger" onPress={() => setConfirm(true)} disabled={!message.trim() || !online} />
        ) : (
          <>
            <Notice tone="err">This sends immediately to every guardian and staff member, on all channels, bypassing quiet hours.</Notice>
            <Row>
              <Button title={busy ? "Sending…" : "Send now"} tone="danger" onPress={send} disabled={busy} />
              <Button title="Cancel" tone="secondary" onPress={() => setConfirm(false)} />
            </Row>
          </>
        )}
        {sent ? <Notice tone="info">{sent}</Notice> : null}
      </Card>
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
    try { const d = await api.post("/api/ai/ask", { question: q }); setTurns([{ q, a: d.answer, cites: d.citations }, ...turns]); setQ(""); }
    catch { setTurns([{ q, a: "Couldn't reach the assistant.", cites: [] }, ...turns]); }
    setBusy(false);
  }
  return (
    <Screen>
      <Title>Assistant</Title>
      <Sub>Operational questions grounded in your school's data. Sources cited.</Sub>
      {!online && <Notice tone="info">The assistant needs a connection.</Notice>}
      <Field placeholder="e.g. Which trips are missing consent this week?" value={q} onChangeText={setQ} />
      <Button title={busy ? "…" : "Ask"} onPress={ask} disabled={busy || !online} />
      {turns.map((t, i) => (
        <Card key={i}><Text style={{ fontWeight: "700", color: T.ink }}>{t.q}</Text>
          <Text style={{ color: T.ink, marginTop: 6 }}>{t.a}</Text>
          {t.cites?.length ? <Muted style={{ marginTop: 6 }}>Sources: {t.cites.map((c: any) => c.title).join(", ")}</Muted> : null}</Card>
      ))}
    </Screen>
  );
}

// Read-only Integration Hub status for admins on mobile. Full connector setup
// and field mapping stay in the web portal; here an admin can see health, view
// critical failures, and trigger a permitted manual retry.
function Integrations() {
  const { boot } = useAuth();
  const schoolId = boot?.schools?.[0];
  const online = useOnline();
  const [d, setD] = useState<any>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!schoolId) return;
    const c = await cacheGet<any>("admin:hub"); if (c) setD(c.value);
    if (online) { try { const r = await api.get(`/api/schools/${schoolId}/integration-hub/dashboard`); setD(r.dashboard); await cacheSet("admin:hub", r.dashboard); } catch {} }
  }, [schoolId, online]);
  useEffect(() => { load(); }, [load]);

  async function retry(integrationId: string) {
    if (!schoolId) return;
    setBusy(integrationId);
    try { await api.post(`/api/schools/${schoolId}/integrations/${integrationId}/sync`, {}); await load(); } catch {} finally { setBusy(null); }
  }

  if (!d) return <Screen><Loading /></Screen>;
  const t = d.totals, q = d.queues;
  return (
    <Screen>
      <Title>Integrations</Title>
      <Sub>Status only — full setup is in the web portal.</Sub>
      <Card>
        <Row><Text style={{ color: T.ink }}>Connected</Text><Badge tone="ok">{t.active}/{t.connected}</Badge></Row>
        <Row><Text style={{ color: T.ink }}>Failed / auth needed</Text><Badge tone={t.failed + t.authRequired ? "danger" : "neutral"}>{t.failed + t.authRequired}</Badge></Row>
        <Row><Text style={{ color: T.ink }}>Open errors</Text><Badge tone={q.openErrors ? "warn" : "neutral"}>{q.openErrors}</Badge></Row>
      </Card>
      {(d.connectors || []).filter((c: any) => c.status === "error" || c.errorStatus === "error").map((c: any) => (
        <Card key={c.id}>
          <Row><View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: T.ink }}>{c.name}</Text><Muted>{c.status} · {c.errorStatus}</Muted></View><Badge tone="danger">failed</Badge></Row>
          <Button title={busy === c.id ? "Retrying…" : "Retry sync"} onPress={() => retry(c.id)} disabled={!online || busy === c.id} />
        </Card>
      ))}
      {(d.connectors || []).every((c: any) => c.status !== "error") && <Notice tone="ok">All connectors healthy.</Notice>}
    </Screen>
  );
}

function Account() {
  const { logout, boot } = useAuth();
  return (
    <Screen>
      <Title>Account</Title>
      <Card>
        <Muted>Signed in as {boot?.user.email}</Muted>
        <Muted>Role: School Administrator</Muted>
        <Button title="Sign out" tone="secondary" onPress={logout} />
      </Card>
    </Screen>
  );
}

export default function AdminApp() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: T.brand }}>
      <Tab.Screen name="Operations" component={Dashboard} />
      <Tab.Screen name="Emergency" component={Emergency} />
      <Tab.Screen name="Integrations" component={Integrations} />
      <Tab.Screen name="Assistant" component={Assistant} />
      <Tab.Screen name="Account" component={Account} />
    </Tab.Navigator>
  );
}

import React, { useEffect, useState, useCallback } from "react";
import { View, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { api } from "@/api/client";
import { cacheGet, cacheSet } from "@/offline/store";
import { writeOrQueue, flushQueue, pendingCount } from "@/offline/queue";
import { useOnline } from "@/net/useOnline";
import { useAuth } from "@/auth/AuthContext";
import { Screen, Card, Title, Sub, Muted, Row, Badge, Button, Notice, Loading, T } from "@/ui/kit";

const Tab = createBottomTabNavigator();

function Journeys() {
  const online = useOnline();
  const [list, setList] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [pending, setPending] = useState(0);

  const loadList = useCallback(async () => {
    const c = await cacheGet<any>("driver:journeys"); if (c) setList(c.value.journeys || []);
    if (online) { try { const d = await api.get("/api/driver/journeys"); setList(d.journeys || []); await cacheSet("driver:journeys", d); } catch {} }
    setPending(await pendingCount());
  }, [online]);
  useEffect(() => { loadList(); }, [loadList]);

  // Auto-sync queued boardings when connectivity returns.
  useEffect(() => { if (online) flushQueue().then(() => { loadList(); }); }, [online]);

  const loadDetail = useCallback(async (id: string) => {
    const key = `driver:journey:${id}`;
    const c = await cacheGet<any>(key); if (c) setDetail(c.value);
    if (online) { try { const d = await api.get(`/api/driver/journeys/${id}`); setDetail(d); await cacheSet(key, d); } catch {} }
  }, [online]);

  async function open(id: string) { setOpenId(id); setDetail(null); loadDetail(id); }

  async function board(studentId: string, status: string) {
    // Optimistic local update, then online-or-queue.
    setDetail((d: any) => d ? { ...d, students: d.students.map((s: any) => s.id === studentId ? { ...s, status } : s) } : d);
    await writeOrQueue(online, { method: "POST", path: `/api/driver/journeys/${openId}/board`, body: { studentId, status } });
    setPending(await pendingCount());
  }
  async function act(path: string, body?: any) { await writeOrQueue(online, { method: "POST", path: `/api/driver/journeys/${openId}/${path}`, body }); if (openId) loadDetail(openId); }

  if (openId && detail) {
    const j = detail.journey;
    return (
      <Screen>
        <Button title="← All journeys" tone="secondary" onPress={() => { setOpenId(null); setDetail(null); loadList(); }} />
        {!online && <Notice tone="info">Offline — actions are queued and will sync automatically.{pending ? ` (${pending} pending)` : ""}</Notice>}
        <Card>
          <Row><Title>{detail.route.name}</Title><Badge>{j.status}</Badge></Row>
          <Muted>{j.session === "am" ? "Morning" : "Afternoon"}{j.delayMinutes ? ` · +${j.delayMinutes} min` : ""}</Muted>
          <Row style={{ marginTop: 8 }}>
            {j.status === "scheduled" ? <Button title="Start journey" onPress={() => act("start")} /> : <>
              <Button title="Approaching" tone="secondary" onPress={() => act("position", { advance: true })} />
              <Button title="Complete" onPress={() => act("complete")} /></>}
          </Row>
        </Card>
        <Card>
          <Title>Students ({detail.students.length})</Title>
          {detail.students.map((s: any) => (
            <View key={s.id} style={{ paddingVertical: 8, borderTopWidth: 1, borderTopColor: T.line }}>
              <Row><Text style={{ fontWeight: "700", color: T.ink }}>{s.name}{s.medicalAlert ? "  ⚕️" : ""}</Text>{s.status ? <Badge tone={s.status === "absent" ? "danger" : "ok"}>{s.status}</Badge> : null}</Row>
              <Row style={{ marginTop: 6, flexWrap: "wrap" }}>
                <Button title="Boarded" onPress={() => board(s.id, "boarded")} />
                <Button title="Dropped off" tone="secondary" onPress={() => board(s.id, "dropped_off")} />
                <Button title="Absent" tone="danger" onPress={() => board(s.id, "absent")} />
              </Row>
            </View>
          ))}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Today's journeys</Title>
      {pending > 0 && <Notice tone="info">{pending} update(s) queued for sync.</Notice>}
      {list.length === 0 ? <Card><Muted>No journeys assigned today.</Muted></Card> :
        list.map((j) => (
          <Card key={j.id}><Row><View><Text style={{ fontWeight: "700", color: T.ink }}>{j.routeName}</Text><Muted>{j.session === "am" ? "Morning" : "Afternoon"} · {j.vehicle || "no vehicle"}</Muted></View>
            <Button title="Open" onPress={() => open(j.id)} /></Row></Card>
        ))}
    </Screen>
  );
}

function DriverAlerts() {
  const { logout, boot } = useAuth();
  return <Screen><Title>Account</Title><Card><Muted>Signed in as {boot?.user.email}</Muted><Button title="Sign out" tone="secondary" onPress={logout} /></Card></Screen>;
}

export default function DriverApp() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: T.brand }}>
      <Tab.Screen name="Journeys" component={Journeys} />
      <Tab.Screen name="Account" component={DriverAlerts} />
    </Tab.Navigator>
  );
}

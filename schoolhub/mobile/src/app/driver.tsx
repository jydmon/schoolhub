import React, { useState } from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Badge, Button, Kpis, Kpi, Row, LineItem, Seg, Avatar, Note, T, toast } from "@/ui/kit";
import { DRIVER_ROUTES, DriverRoute } from "@/data/mock";

function clone(): DriverRoute[] { return DRIVER_ROUTES.map((r) => ({ ...r, pupils: r.pupils.map((p) => ({ ...p })) })); }

function Journeys() {
  const [routes, setRoutes] = useState<DriverRoute[]>(clone);
  const [sel, setSel] = useState(0);
  const r = routes[sel];
  const bump = () => setRoutes((rs) => rs.slice());

  const toggleJourney = () => { r.started = !r.started; toast(r.started ? "Journey started · parents notified & tracking live" : "Journey ended · families notified"); bump(); };
  const setMode = (m: "pickup" | "dropoff") => { r.mode = m; bump(); };
  const check = (i: number) => { const p = r.pupils[i]; p.in = !p.in; toast(`${p.n} ${p.in ? (r.mode === "pickup" ? "checked in — parent notified" : "dropped — parent notified") : "unchecked"}`); bump(); };

  const n = r.pupils.length, done = r.pupils.filter((p) => p.in).length;
  const modeWord = r.mode === "pickup" ? "picked up" : "dropped off";

  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="info">{routes.length}</Badge>}>Today's routes</CardTitle>
        <Seg options={routes.map((rt, i) => ({ label: `${rt.name.replace("Route ", "")}${rt.started ? " 🟢" : ""}`, active: i === sel, onPress: () => setSel(i) }))} />
      </Card>
      <Kpis>
        <Kpi k="Route" v={r.name} vSize={15} h={`${n} pupils`} />
        <Kpi warn={!r.started} k="Journey" v={r.started ? "Live" : "Ready"} vSize={18} vColor={r.started ? T.ok : undefined} h={r.started ? "tracking on" : "tap start"} />
      </Kpis>
      <Card>
        <CardTitle>Vehicle</CardTitle>
        <LineItem first t={r.veh} m="Minibus · MOT valid" right={<Badge tone="ok">GPS live</Badge>} />
        <Button tone={r.started ? "danger" : "brand"} title={r.started ? "End journey" : "Start journey"} onPress={toggleJourney} />
      </Card>
      <Card>
        <CardTitle right={<Badge tone="info">{r.mode}</Badge>}>Check-in</CardTitle>
        <Row first>
          <Text style={{ fontWeight: "600", fontSize: 13, color: T.ink }}>Pupils {modeWord}</Text>
          <Badge tone={done === n ? "ok" : "info"}>{done}/{n}</Badge>
        </Row>
        <Seg options={[
          { label: "Pickup", active: r.mode === "pickup", onPress: () => setMode("pickup") },
          { label: "Drop-off", active: r.mode === "dropoff", onPress: () => setMode("dropoff") },
        ]} />
        {r.pupils.map((p, i) => (
          <Row key={i} first={i === 0}>
            <View style={{ flexDirection: "row", gap: 9, alignItems: "center", flex: 1 }}>
              <Avatar name={p.n} size={32} />
              <View><Text style={{ fontWeight: "600", fontSize: 13, color: T.ink }}>{p.n}</Text><Text style={{ fontSize: 11, color: T.muted }}>{p.stop}</Text></View>
            </View>
            {p.in
              ? <Button sm tone="secondary" title={`✓ ${r.mode === "pickup" ? "aboard" : "dropped"}`} onPress={() => check(i)} />
              : <Button sm title={`Check ${r.mode === "pickup" ? "in" : "off"}`} onPress={() => check(i)} />}
          </Row>
        ))}
      </Card>
      <Note>A driver can run several routes a day. Photos help confirm each child; each check-in notifies that child's parent.</Note>
    </Screen>
  );
}

export const driverScreens: Record<string, React.FC> = { journeys: Journeys };

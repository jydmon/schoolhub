import React from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Badge, Button, Row, LineItem, Avatar, RouteMap, Note, T, toast } from "@/ui/kit";

function Home() {
  return (
    <Screen>
      <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" }}>
        <Kpi k="Ella — status" v="Present" h="registered 08:41" color={T.ok} />
        <Kpi k="On the bus" v="Route B" h="ETA home 15:42" />
      </View>
      <Card>
        <CardTitle right={<Badge tone="warn">1</Badge>}>Action needed</CardTitle>
        <LineItem first t="Ecomuseum trip" m="Consent + £8.50 · closes Thu 17:00"
          right={<Button sm title="Review" onPress={() => toast("Consent + payment (demo)")} />} />
      </Card>
      <Card>
        <CardTitle>My children</CardTitle>
        <LineItem first t="Ella Blake · 4B" m="+12 merits this week · 1 homework due" right={<Badge tone="ok">98%</Badge>} />
        <LineItem t="Max Blake · 2A" m="+6 merits this week" right={<Badge tone="ok">96%</Badge>} />
      </Card>
      <Card>
        <CardTitle>Today at school</CardTitle>
        <LineItem first t="Sports Day reminder" m="Fri 09:30 · field" right={<Badge tone="info">event</Badge>} />
        <LineItem t="Lunch menu — allergen notice" m="Week 2 · nut-free Friday" right={<Badge tone="mut">info</Badge>} />
      </Card>
    </Screen>
  );
}

function Transport() {
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="ok">en route</Badge>}>Route B — afternoon</CardTitle>
        <RouteMap />
        <LineItem t="ETA — Elm Street" m="15:42 · 3 stops away" right={<Badge tone="ok">on time</Badge>} />
      </Card>
      <Card>
        <CardTitle>Your driver & vehicle</CardTitle>
        <Row first>
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center", flex: 1 }}>
            <Avatar name="Dan Cole" size={40} />
            <View><Text style={{ fontWeight: "600", color: T.ink }}>Dan Cole</Text><Text style={{ fontSize: 11, color: T.muted }}>DBS valid · Route B</Text></View>
          </View>
          <Button sm tone="secondary" title="Contact" onPress={() => toast("Calling office (demo)")} />
        </Row>
        <LineItem t="Vehicle" m="Minibus · GPS live" right={<Badge tone="ok">NB07 SCH</Badge>} />
        <LineItem t="Ella checked in" m="15:06 · Oak Road" right={<Badge tone="ok">aboard</Badge>} />
      </Card>
      <Card>
        <CardTitle>Journey history</CardTitle>
        <LineItem first t="Tue 4 Aug · Route B" m="Dan Cole · NB07 · 38 min" right={<Badge tone="ok">on time</Badge>} />
        <LineItem t="Mon 3 Aug · Route B" m="Dan Cole · NB07 · 44 min" right={<Badge tone="warn">+6 min</Badge>} />
      </Card>
      <Note>Approximate location only; sharing stops when the journey ends. Past journeys are kept so you can see who collected your child.</Note>
    </Screen>
  );
}

function Reports() {
  return (
    <Screen>
      <Card>
        <CardTitle>Reports</CardTitle>
        <LineItem first t="Ella — Year 4 annual" m="Released 5 Aug · you viewed 5 Aug"
          right={<Button sm title="Open" onPress={() => toast("Opening PDF (demo)")} />} />
        <LineItem t="Ella — Autumn progress" m="Embargoed until Fri 09:00" right={<Badge tone="warn">scheduled</Badge>} />
        <LineItem t="Max — Year 2 annual" m="Released 5 Aug"
          right={<Button sm title="Open" onPress={() => toast("Opening PDF (demo)")} />} />
      </Card>
      <Note>You can't see a report until the school releases it; first-view is recorded.</Note>
    </Screen>
  );
}

function Messaging() {
  return (
    <Screen>
      <Card>
        <CardTitle>Messages</CardTitle>
        <LineItem first t="Northwind Office" m="“Thanks — consent received for Ella.”" right={<Badge tone="ok">2m</Badge>} />
        <LineItem t="Mr Reed (4B)" m="“Ella did brilliantly in science today.”" right={<Badge tone="mut">1h</Badge>} />
      </Card>
      <Card>
        <CardTitle>Channel preferences</CardTitle>
        <LineItem first t="Push" right={<Badge tone="ok">on</Badge>} />
        <LineItem t="SMS" right={<Badge tone="ok">on (opt-out)</Badge>} />
        <LineItem t="WhatsApp" right={<Badge tone="warn">opt-in</Badge>} />
        <LineItem t="Language" right={<Badge tone="info">English</Badge>} />
      </Card>
    </Screen>
  );
}

function Kpi({ k, v, h, color }: any) {
  return (
    <View style={{ width: "48.5%", backgroundColor: "#fff", borderColor: T.line, borderWidth: 1, borderRadius: 14, padding: 11, marginBottom: 11 }}>
      <Text style={{ fontSize: 11, color: T.muted }}>{k}</Text>
      <Text style={{ fontSize: 18, fontWeight: "800", color: color || T.ink, marginTop: 1 }}>{v}</Text>
      <Text style={{ fontSize: 10, color: T.muted }}>{h}</Text>
    </View>
  );
}

export const parentScreens: Record<string, React.FC> = { home: Home, transport: Transport, reports: Reports, messaging: Messaging };

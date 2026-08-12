import React, { useState } from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Sub, Badge, Button, Kpis, Kpi, LineItem, Seg, Note, T, toast } from "@/ui/kit";
import { TRIP_UPDATE_TEXT } from "@/data/mock";

function Trips() {
  const [feed, setFeed] = useState<[string, string][]>([["10:12", "Arrived at Ecomuseum — all 28 pupils accounted for"]]);
  const send = (kind: string) => { setFeed((f) => [["now", TRIP_UPDATE_TEXT[kind]], ...f]); toast("Update sent to 28 families"); };
  return (
    <Screen>
      <Kpis>
        <Kpi k="Trip" v="Ecomuseum" vSize={16} h="28 pupils · you lead" />
        <Kpi warn k="Consents out" v="4" h="£51 unpaid" />
      </Kpis>
      <Card>
        <CardTitle right={<Badge tone="info">to parents</Badge>}>Live trip updates</CardTitle>
        <Sub>Tap to broadcast to all trip families instantly.</Sub>
        <Seg options={[
          { label: "🚌 Started", onPress: () => send("start") },
          { label: "📍 Arrived", onPress: () => send("arrived") },
          { label: "🚧 Traffic", onPress: () => send("traffic") },
          { label: "⏱️ Delay", onPress: () => send("delay") },
          { label: "🕒 ETA", onPress: () => send("eta") },
          { label: "✅ Back", onPress: () => send("done") },
        ]} />
        {feed.map((u, i) => (
          <LineItem key={i} first={i === 0} t={u[1]} m={`${u[0]} · sent to 28 families`} right={<Badge tone="ok">sent</Badge>} />
        ))}
      </Card>
      <Card>
        <CardTitle>Register — 4B AM</CardTitle>
        <LineItem first t="Ella Blake" right={<Badge tone="ok">present</Badge>} />
        <LineItem t="Max Turner" m="parent reported: dentist" right={<Badge tone="warn">absent</Badge>} />
        <Button tone="secondary" title="Submit register" onPress={() => toast("Register submitted (demo)")} />
      </Card>
    </Screen>
  );
}

function Reports() {
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="warn">draft</Badge>}>Pupil reports</CardTitle>
        <LineItem first t="Year 4 annual — Ella Blake" m="2 of 5 sections complete"
          right={<Button sm title="Continue" onPress={() => toast("Report editor (demo)")} />} />
        <LineItem t="Attendance & behaviour" m="28 pupils · ready to submit"
          right={<Button sm tone="secondary" title="Submit" onPress={() => toast("Submitted for approval (demo)")} />} />
      </Card>
      <Note>You author; leadership approves and sets the release time; parents are notified when it's released.</Note>
    </Screen>
  );
}

export const teacherScreens: Record<string, React.FC> = { trips: Trips, reports: Reports };

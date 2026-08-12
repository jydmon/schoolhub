import React from "react";
import { View, Text, ScrollView } from "react-native";
import { Screen, Card, CardTitle, Badge, Button, Kpis, Kpi, LineItem, Note, T, toast } from "@/ui/kit";
import { S_TT, S_HW } from "@/data/mock";

function Day() {
  return (
    <Screen>
      <Kpis>
        <Kpi k="Next lesson" v="Maths" vSize={18} h="P1 · Room 4" />
        <Kpi k="Homework due" v="2" h="this week" />
        <Kpi k="Merits" v="+48" h="this term" vColor={T.ok} />
        <Kpi k="Club today" v="Choir" vSize={15} h="3:30pm" />
      </Kpis>
      <Card>
        <CardTitle>Homework</CardTitle>
        {S_HW.map((h, i) => (
          <LineItem key={i} first={i === 0} t={`${h[0]} — ${h[1]}`} m={h[2]}
            right={<Badge tone={h[3] === "set" ? "info" : "warn"}>{h[3]}</Badge>} />
        ))}
      </Card>
      <Note>Your pupil view shows your timetable, homework, released reports and rewards. A parent/guardian sees the full detail.</Note>
    </Screen>
  );
}

function Timetable() {
  const headers = ["", "M", "Tu", "W", "Th", "F"];
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="mut">from MIS</Badge>}>Weekly timetable</CardTitle>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View>
            <View style={{ flexDirection: "row" }}>
              {headers.map((h, i) => <Cell key={i} text={h} head first={i === 0} width={i === 0 ? 44 : 74} />)}
            </View>
            {S_TT.map((r, ri) => (
              <View key={ri} style={{ flexDirection: "row" }}>
                {r.map((x, ci) => <Cell key={ci} text={x} head={ci === 0} first={ci === 0} width={ci === 0 ? 44 : 74} />)}
              </View>
            ))}
          </View>
        </ScrollView>
      </Card>
    </Screen>
  );
}
function Cell({ text, head, width }: any) {
  return (
    <View style={{ width, borderWidth: 0.5, borderColor: T.line, backgroundColor: head ? "#F4F7FC" : "#fff", paddingVertical: 6, paddingHorizontal: 5 }}>
      <Text style={{ fontSize: 11, fontWeight: head ? "700" : "400", color: T.ink }}>{text}</Text>
    </View>
  );
}

function Homework() {
  return (
    <Screen>
      <Card>
        <CardTitle>Homework</CardTitle>
        {S_HW.map((h, i) => (
          <LineItem key={i} first={i === 0} t={h[0]} m={`${h[1]} · ${h[2]}`}
            right={<Badge tone={h[3] === "set" ? "info" : "warn"}>{h[3]}</Badge>} />
        ))}
      </Card>
    </Screen>
  );
}

function Reports() {
  return (
    <Screen>
      <Card>
        <CardTitle>My reports</CardTitle>
        <LineItem first t="Year 4 annual report" m="Summer 2026 · released 5 Aug"
          right={<Button sm title="Open" onPress={() => toast("Opening report (demo)")} />} />
        <Note>You see a report once your teacher releases it.</Note>
      </Card>
    </Screen>
  );
}

export const studentScreens: Record<string, React.FC> = { day: Day, timetable: Timetable, homework: Homework, reports: Reports };

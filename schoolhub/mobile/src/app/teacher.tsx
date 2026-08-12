import React from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Badge, Button, Kpis, Kpi, LineItem, Loading, Note, T, toast } from "@/ui/kit";
import { useApi } from "@/data/useApi";

function hhmm(t?: string) { return t || ""; }

function Trips() {
  const { data, loading, error } = useApi<any>("/api/teacher/dashboard");
  const d = data || {};
  const st = d.stats || {};
  if (loading && !data) return <Screen><Loading label="Loading your day…" /></Screen>;
  return (
    <Screen>
      <Kpis>
        <Kpi k="My pupils" v={String(st.students ?? "—")} h={d.scope?.schoolName || ""} />
        <Kpi k="Lessons today" v={String(st.lessonsToday ?? 0)} h={`${st.classes ?? 0} classes`} />
        <Kpi k="Reports to write" v={String(st.reportsOutstanding ?? 0)} h="draft / submitted" warn={(st.reportsOutstanding ?? 0) > 0} />
        <Kpi k="Positive points" v={`+${st.positivePoints ?? 0}`} h="last 30 days" vColor={T.ok} />
      </Kpis>

      <Card>
        <CardTitle right={<Badge tone="info">today</Badge>}>Today's lessons</CardTitle>
        {(d.lessons || []).length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No lessons scheduled today.</Text> :
          (d.lessons || []).map((l: any, i: number) => (
            <LineItem key={l.id || i} first={i === 0} t={`${l.subject}${l.className ? " · " + l.className : ""}`}
              m={`${hhmm(l.startTime)}${l.endTime ? "–" + hhmm(l.endTime) : ""}${l.room ? " · " + l.room : ""}`}
              right={l.period ? <Badge tone="mut">{l.period}</Badge> : null} />
          ))}
      </Card>

      {(d.trips || []).length > 0 ? (
        <Card>
          <CardTitle>Upcoming trips</CardTitle>
          {(d.trips || []).map((t: any, i: number) => (
            <LineItem key={t.id || i} first={i === 0} t={t.title} m={t.destination || ""}
              right={<Button sm title="Open" onPress={() => toast("Open in web portal")} />} />
          ))}
        </Card>
      ) : null}

      {error ? <Note>Showing saved data — couldn't refresh right now.</Note> : null}
    </Screen>
  );
}

function Reports() {
  const { data, loading } = useApi<any>("/api/teacher/dashboard");
  const reports: any[] = data?.reportsToWrite || [];
  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="warn">draft</Badge>}>Pupil reports</CardTitle>
        {reports.length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No reports in progress.</Text> :
          reports.map((r, i) => (
            <LineItem key={r.id || i} first={i === 0} t={`${r.student ? r.student + " — " : ""}${r.title}`} m={r.status}
              right={<Button sm title="Continue" onPress={() => toast("Open in web portal")} />} />
          ))}
      </Card>
      <Note>You author; leadership approves and sets the release time; parents are notified when it's released.</Note>
    </Screen>
  );
}

export const teacherScreens: Record<string, React.FC> = { trips: Trips, reports: Reports };

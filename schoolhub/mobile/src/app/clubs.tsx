import React, { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Badge, LineItem, Seg, Loading, Note, T } from "@/ui/kit";
import { useApi } from "@/data/useApi";

const CAT_ICON: Record<string, string> = { sport: "⚽", music: "🎵", arts: "🎨", drama: "🎭", academic: "📘", stem: "🔬", wellbeing: "🧘", general: "🏫" };
const gbp = (p: number) => (p ? `£${(p / 100).toFixed(2)}` : "Free");
const STATUS_TONE: Record<string, any> = { present: "ok", late: "warn", absent: "danger", excused: "mut" };
const schedule = (c: any) => `${c.cadence === "weekly" && c.dayOfWeek ? c.dayOfWeek : c.cadence}${c.startTime ? ` · ${c.startTime}${c.endTime ? "–" + c.endTime : ""}` : ""}`;

export default function ParentClubsScreen() {
  const { data, loading, error } = useApi<any>("/api/parent/clubs");
  const items: any[] = data?.items || [];
  const children: any[] = data?.children || [];
  const [child, setChild] = useState("all");
  const shown = useMemo(() => items.filter((i) => child === "all" || i.studentId === child), [items, child]);

  if (loading && !data) return <Screen><Loading label="Loading clubs…" /></Screen>;

  return (
    <Screen>
      {children.length > 1 ? (
        <Seg options={[{ label: "All", active: child === "all", onPress: () => setChild("all") },
          ...children.map((c) => ({ label: (c.name || "").split(" ")[0], active: child === c.id, onPress: () => setChild(c.id) }))]} />
      ) : null}

      {shown.length === 0 ? (
        <Card><Text style={{ color: T.muted, fontSize: 13, textAlign: "center", paddingVertical: 8 }}>
          {items.length ? "No clubs for this child." : "No clubs yet. Clubs your child joins will appear here with their attendance."}
        </Text></Card>
      ) : shown.map((it) => {
        const c = it.club;
        const rate = it.sessionsRecorded ? Math.round((it.sessionsAttended / it.sessionsRecorded) * 100) : null;
        return (
          <Card key={it.membershipId}>
            <CardTitle right={<Badge tone={it.status === "waitlist" ? "warn" : "ok"}>{it.status === "waitlist" ? "waitlist" : "enrolled"}</Badge>}>
              {CAT_ICON[c.category] || "🏫"} {c.name}
            </CardTitle>
            <Text style={{ fontSize: 12, color: T.muted }}>{it.childName} · {schedule(c)}{c.location ? ` · ${c.location}` : ""} · {gbp(c.cost)}</Text>
            {c.description ? <Text style={{ fontSize: 12, color: T.ink, marginTop: 6 }}>{c.description}</Text> : null}
            <View style={{ flexDirection: "row", gap: 16, marginTop: 10 }}>
              <Stat n={rate == null ? "—" : `${rate}%`} l="Attendance" />
              <Stat n={String(it.sessionsAttended)} l="Attended" />
              <Stat n={String(it.sessionsRecorded)} l="Sessions" />
            </View>
            {it.history?.length ? (
              <View style={{ marginTop: 10 }}>
                <Text style={{ fontSize: 11, color: T.muted, fontWeight: "700", marginBottom: 6 }}>Recent attendance</Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                  {it.history.slice(0, 8).map((h: any, i: number) => (
                    <Badge key={i} tone={STATUS_TONE[h.status] || "mut"}>
                      {new Date(h.date).toLocaleDateString(undefined, { day: "numeric", month: "short" })} · {h.status}
                    </Badge>
                  ))}
                </View>
              </View>
            ) : null}
          </Card>
        );
      })}
      <Note>Only clubs your own child belongs to are shown. Attendance is recorded by the club leader.</Note>
      {error ? <Note>Showing saved data — couldn&apos;t refresh clubs right now.</Note> : null}
    </Screen>
  );
}

function Stat({ n, l }: { n: string; l: string }) {
  return (
    <View>
      <Text style={{ fontSize: 18, fontWeight: "800", color: T.ink }}>{n}</Text>
      <Text style={{ fontSize: 10, color: T.muted }}>{l}</Text>
    </View>
  );
}

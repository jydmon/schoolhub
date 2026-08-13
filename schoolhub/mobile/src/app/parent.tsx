import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Badge, Button, Kpis, Kpi, LineItem, Loading, Empty, Note, Field, RouteMap, T, toast } from "@/ui/kit";
import { useApi } from "@/data/useApi";
import { api } from "@/api/client";

/* ---------------- Search across the parent's own children (live) ---------------- */
function HomeSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes(null); return; }
      setBusy(true);
      try { const d = await api.get<any>(`/api/parent/search?q=${encodeURIComponent(q.trim())}`); setRes(d); }
      catch { setRes(null); } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Card>
      <CardTitle>Search</CardTitle>
      <Field placeholder="Search events, homework, clubs, reports…" value={q} onChangeText={setQ} autoCapitalize="none" />
      {busy ? <Text style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>Searching…</Text> : null}
      {res && !busy && res.total === 0 ? <Text style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>No matches for “{res.q}”.</Text> : null}
      {res && !busy && res.total > 0 ? (
        <View style={{ marginTop: 6 }}>
          {res.groups.map((g: any, gi: number) => (
            <View key={g.type} style={{ borderTopWidth: gi === 0 ? 0 : 1, borderTopColor: T.line, paddingVertical: 8 }}>
              <Text style={{ fontSize: 11, color: T.muted, fontWeight: "700" }}>{g.label} ({g.items.length})</Text>
              {g.items.slice(0, 5).map((it: any, i: number) => (
                <View key={i} style={{ paddingVertical: 3 }}>
                  <Text style={{ fontSize: 13, color: T.ink, fontWeight: "600" }}>{it.title}</Text>
                  {it.subtitle ? <Text style={{ fontSize: 11, color: T.muted }}>{it.subtitle}</Text> : null}
                </View>
              ))}
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

function when(iso?: string) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) +
      (iso.length > 10 ? " · " + d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");
  } catch { return iso; }
}
const tone = (t?: string) => (t === "warn" ? "warn" : t === "good" ? "ok" : "info");

function Home() {
  const { data, loading, error } = useApi<any>("/api/parent/dashboard");
  const d = data || {};
  const children: any[] = d.children || [];
  const per = new Map((d.perChild || []).map((p: any) => [p.id, p]));
  if (loading && !data) return <Screen><Loading label="Loading your dashboard…" /></Screen>;

  return (
    <Screen>
      <HomeSearch />
      <Kpis>
        <Kpi k="Children" v={String(children.length)} h={children.map((c) => c.firstName || c.name).slice(0, 2).join(", ") || "—"} />
        <Kpi k="Homework due" v={String((d.homeworkDue || []).length)} h="next 7 days" warn={(d.homeworkDue || []).length > 0} />
      </Kpis>

      {(d.insights || []).length > 0 ? (
        <Card>
          <CardTitle>Insights</CardTitle>
          {(d.insights || []).map((i: any, idx: number) => (
            <LineItem key={idx} first={idx === 0} t={i.text} right={<Badge tone={tone(i.tone)}>{i.tone === "good" ? "good" : i.tone}</Badge>} />
          ))}
        </Card>
      ) : null}

      {(d.outstandingPolicies || []).length > 0 ? (
        <Card>
          <CardTitle right={<Badge tone="warn">{(d.outstandingPolicies || []).length}</Badge>}>Action needed</CardTitle>
          {(d.outstandingPolicies || []).map((p: any, idx: number) => (
            <LineItem key={p.id || idx} first={idx === 0} t={p.title} m={p.category ? `${p.category} · needs acknowledgement` : "needs acknowledgement"}
              right={<Button sm title="Review" onPress={() => toast("Open in web portal")} />} />
          ))}
        </Card>
      ) : null}

      <Card>
        <CardTitle>My children</CardTitle>
        {children.length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No children linked to your account.</Text> :
          children.map((c: any, idx: number) => {
            const p: any = per.get(c.id);
            const rate = p?.attendance?.rate;
            const pos = p?.behaviour?.positivePoints;
            return (
              <LineItem key={c.id || idx} first={idx === 0}
                t={`${c.name}${c.yearGroup ? " · " + c.yearGroup : ""}`}
                m={`${pos != null ? `+${pos} points` : "—"}${c.schoolName ? " · " + c.schoolName : ""}`}
                right={<Badge tone={rate == null ? "mut" : rate >= 95 ? "ok" : rate >= 90 ? "info" : "warn"}>{rate == null ? "—" : rate + "%"}</Badge>} />
            );
          })}
      </Card>

      {(d.upcomingEvents || []).length > 0 ? (
        <Card>
          <CardTitle>Coming up</CardTitle>
          {(d.upcomingEvents || []).slice(0, 5).map((e: any, idx: number) => (
            <LineItem key={e.id || idx} first={idx === 0} t={e.title} m={when(e.startsAt)} right={<Badge tone="info">{e.type || "event"}</Badge>} />
          ))}
        </Card>
      ) : null}

      {error ? <Note>Showing saved data — couldn't refresh from dev.siplat.com right now.</Note> : null}
    </Screen>
  );
}

function Transport() {
  const { data, loading, error } = useApi<any>("/api/parent/transport");
  const items: any[] = data?.items || [];
  if (loading && !data) return <Screen><Loading label="Loading transport…" /></Screen>;

  return (
    <Screen>
      {items.length === 0 ? (
        <Empty>No active school-bus journey right now. Tracking appears here while your child's bus is en route.</Empty>
      ) : items.map((j, idx) => {
        const st = j.status === "completed" ? "ended" : j.status === "scheduled" ? "not started" : "en route";
        const stTone = j.status === "in_progress" || j.status === "active" ? "ok" : j.status === "completed" ? "mut" : "info";
        return (
          <Card key={j.journeyId || idx}>
            <CardTitle right={<Badge tone={stTone as any}>{st}</Badge>}>{j.routeName || "Route"} — {j.session === "am" ? "morning" : "afternoon"}</CardTitle>
            {j.hasGps ? <RouteMap /> : null}
            <LineItem first t={j.childName} m={j.approxLocation || ""} right={j.childStatus ? <Badge tone="ok">{j.childStatus}</Badge> : null} />
            {j.nextStop ? <LineItem t="Next stop" m={`${j.nextStop}${j.stopsRemaining != null ? " · " + j.stopsRemaining + " stops away" : ""}`}
              right={<Badge tone={j.delayMinutes ? "warn" : "ok"}>{j.delayMinutes ? `+${j.delayMinutes} min` : "on time"}</Badge>} /> : null}
            {j.eta ? <LineItem t="ETA" m={when(j.eta)} /> : null}
          </Card>
        );
      })}
      <Note>Approximate location only; sharing stops when the journey ends.</Note>
      {error ? <Note>Couldn't refresh transport right now.</Note> : null}
    </Screen>
  );
}

function Reports() {
  const { data, loading } = useApi<any>("/api/parent/dashboard");
  const reports: any[] = data?.recentReports || [];
  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Card>
        <CardTitle>Reports</CardTitle>
        {reports.length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No released reports yet. You'll see them here once your school releases them.</Text> :
          reports.map((r, idx) => (
            <LineItem key={r.id || idx} first={idx === 0} t={`${r.childName ? r.childName + " — " : ""}${r.title}`} m={`${r.term || ""}${r.releasedAt ? " · " + when(r.releasedAt) : ""}`}
              right={<Button sm title="Open" onPress={() => toast("Open in web portal")} />} />
          ))}
      </Card>
      <Note>You can't see a report until the school releases it; first-view is recorded.</Note>
    </Screen>
  );
}

function Messaging() {
  const { data, loading } = useApi<any>("/api/messages");
  const threads: any[] = data?.threads || data?.items || (Array.isArray(data) ? data : []);
  if (loading && !data) return <Screen><Loading /></Screen>;
  return (
    <Screen>
      <Card>
        <CardTitle>Messages</CardTitle>
        {threads.length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No conversations yet. Your school can start a secure thread with you here.</Text> :
          threads.map((th, idx) => (
            <LineItem key={th.id || idx} first={idx === 0} t={th.title || th.name || th.withName || "Conversation"} m={th.lastMessage || th.preview || th.subject || ""}
              right={th.unread ? <Badge tone="warn">{th.unread}</Badge> : null} />
          ))}
      </Card>
      <Note>Secure in-app messaging with your school, same-tenant only.</Note>
    </Screen>
  );
}

export const parentScreens: Record<string, React.FC> = { home: Home, transport: Transport, reports: Reports, messaging: Messaging };

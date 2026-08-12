import React, { useState } from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Badge, Button, Kpis, Kpi, LineItem, Loading, Empty, Note, T, toast } from "@/ui/kit";
import { useApi } from "@/data/useApi";
import { api } from "@/api/client";

function statusTone(s?: string) {
  if (s === "in_progress" || s === "active") return "ok";
  if (s === "completed") return "mut";
  if (s === "cancelled") return "danger";
  return "info";
}

function Journeys() {
  const { data, loading, error, reload } = useApi<any>("/api/driver/home");
  const d = data || {};
  const journeys: any[] = d.journeys || [];
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, kind: "start" | "complete") {
    setBusy(id);
    try {
      await api.post(`/api/driver/journeys/${id}/${kind}`, {});
      toast(kind === "start" ? "Journey started · families notified" : "Journey ended · families notified");
      await reload();
    } catch (e: any) { toast(e?.data?.error || "Couldn't update"); }
    finally { setBusy(null); }
  }

  if (loading && !data) return <Screen><Loading label="Loading today's journeys…" /></Screen>;

  return (
    <Screen>
      <Kpis>
        <Kpi k="Journeys today" v={String(journeys.length)} h={d.schoolName || ""} />
        <Kpi k="Messages" v={String(d.unreadMessages ?? 0)} h="from office" warn={(d.unreadMessages ?? 0) > 0} />
      </Kpis>

      {journeys.length === 0 ? <Empty>No journeys assigned today.</Empty> :
        journeys.map((j, i) => {
          const running = j.status === "in_progress" || j.status === "active";
          const done = j.status === "completed";
          return (
            <Card key={j.id || i}>
              <CardTitle right={<Badge tone={statusTone(j.status) as any}>{j.status}</Badge>}>
                {j.routeName} · {j.session === "am" ? "AM" : "PM"}
              </CardTitle>
              <LineItem first t={j.vehicle || "Vehicle"} m={`${j.onboard}/${j.total} aboard`} right={<Badge tone="ok">GPS</Badge>} />
              {!done ? (
                <Button tone={running ? "danger" : "brand"} disabled={busy === j.id}
                  title={busy === j.id ? "Working…" : running ? "End journey" : "Start journey"}
                  onPress={() => act(j.id, running ? "complete" : "start")} />
              ) : null}
            </Card>
          );
        })}

      {(d.reminders || []).length > 0 ? (
        <Card>
          <CardTitle right={<Badge tone="warn">action</Badge>}>Reminders</CardTitle>
          {(d.reminders || []).map((r: any, i: number) => (
            <LineItem key={i} first={i === 0} t={r.key} m={r.date ? String(r.date) : ""}
              right={<Badge tone={r.tone === "warn" ? "warn" : "info"}>{r.label}</Badge>} />
          ))}
        </Card>
      ) : null}

      <Note>Each check-in and journey start/stop notifies the office and affected parents. Per-pupil boarding opens on the journey.</Note>
      {error ? <Note>Showing saved data — couldn't refresh right now.</Note> : null}
    </Screen>
  );
}

export const driverScreens: Record<string, React.FC> = { journeys: Journeys };

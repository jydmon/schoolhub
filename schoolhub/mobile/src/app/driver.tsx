import React, { useState, useEffect, useCallback } from "react";
import { View, Text, ScrollView } from "react-native";
import { Screen, Card, CardTitle, Sub, Badge, Button, Kpis, Kpi, LineItem, Loading, Empty, Note, Field, Seg, T, toast } from "@/ui/kit";
import { useApi } from "@/data/useApi";
import { api } from "@/api/client";
import { SupportTickets } from "@/app/tickets";

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

/* ------------------------------- Routes -------------------------------- */
function Routes() {
  const { data, loading } = useApi<any>("/api/driver/home");
  const assignments: any[] = data?.assignments || [];
  const journeys: any[] = data?.journeys || [];
  if (loading && !data) return <Screen><Loading label="Loading your routes…" /></Screen>;
  return (
    <Screen>
      <Card>
        <CardTitle>My routes</CardTitle>
        {assignments.length === 0 ? <Sub>No routes assigned to you.</Sub> :
          assignments.map((a, i) => (
            <LineItem key={i} first={i === 0} t={a.routeName} m={`${a.role || "driver"}${a.session ? " · " + String(a.session).toUpperCase() : ""}`} />
          ))}
      </Card>
      <Card>
        <CardTitle>Today's runs</CardTitle>
        {journeys.length === 0 ? <Sub>No journeys today.</Sub> :
          journeys.map((j, i) => (
            <LineItem key={j.id || i} first={i === 0} t={`${j.routeName} · ${j.session === "am" ? "AM" : "PM"}`} m={j.vehicle || "Vehicle"} right={<Badge tone={statusTone(j.status) as any}>{j.status}</Badge>} />
          ))}
      </Card>
    </Screen>
  );
}

/* ---------------------------- Incident report ---------------------------- */
const INC_TYPES: [string, string][] = [["breakdown", "Breakdown"], ["accident", "Accident"], ["vehicle_defect", "Defect"], ["road", "Road"], ["behaviour", "Behaviour"], ["medical", "Medical"], ["delay", "Delay"], ["other", "Other"]];
function IncidentReport() {
  const [type, setType] = useState("breakdown");
  const [severity, setSeverity] = useState("medium");
  const [notes, setNotes] = useState("");
  const [incidents, setIncidents] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { try { setIncidents((await api.get<any>("/api/driver/incident")).incidents || []); } catch { setIncidents([]); } }, []);
  useEffect(() => { load(); }, [load]);
  async function submit() {
    if (!notes.trim()) { toast("Describe what happened"); return; }
    setBusy(true);
    try { await api.post("/api/driver/incident", { type, severity, notes: notes.trim() }); toast("Incident reported · office notified"); setNotes(""); setSeverity("medium"); load(); }
    catch (e: any) { toast(e?.data?.error || "Couldn't report"); } finally { setBusy(false); }
  }
  const sev = (s: string) => (s === "high" ? "danger" : s === "medium" ? "warn" : "info");
  return (
    <Screen>
      <Card>
        <CardTitle>Report an incident</CardTitle>
        <Text style={{ fontSize: 12, color: T.muted, marginTop: 6, marginBottom: 4 }}>Type</Text>
        <Seg options={INC_TYPES.map(([k, l]) => ({ label: l, active: type === k, onPress: () => setType(k) }))} />
        <Text style={{ fontSize: 12, color: T.muted, marginTop: 8, marginBottom: 4 }}>Severity</Text>
        <Seg options={[["low", "Low"], ["medium", "Medium"], ["high", "High"]].map(([k, l]) => ({ label: l, active: severity === k, onPress: () => setSeverity(k) }))} />
        <Field label="What happened?" value={notes} onChangeText={setNotes} multiline style={{ minHeight: 80 }} placeholder="Describe the incident…" />
        <Button title={busy ? "Reporting…" : "Report incident"} tone={severity === "high" ? "danger" : "brand"} disabled={busy} onPress={submit} />
      </Card>
      <Card>
        <CardTitle>My reported incidents</CardTitle>
        {incidents.length === 0 ? <Sub>None reported.</Sub> :
          incidents.map((i, idx) => (
            <LineItem key={i.id || idx} first={idx === 0} t={(INC_TYPES.find(([k]) => k === i.type)?.[1]) || i.type} m={`${i.notes || ""}`} right={<Badge tone={i.status === "resolved" ? "ok" : sev(i.severity) as any}>{i.status}</Badge>} />
          ))}
      </Card>
    </Screen>
  );
}

/* ------------------------------ Journey log ------------------------------ */
function JourneyLog() {
  const { data, loading } = useApi<any>("/api/driver/history");
  const rows: any[] = data?.journeys || [];
  const completed = rows.filter((r) => r.status === "completed").length;
  if (loading && !data) return <Screen><Loading label="Loading your journey log…" /></Screen>;
  return (
    <Screen>
      <Kpis>
        <Kpi k="Journeys" v={String(rows.length)} />
        <Kpi k="Completed" v={String(completed)} />
      </Kpis>
      <Card>
        <CardTitle>My journey log</CardTitle>
        {rows.length === 0 ? <Sub>No past journeys yet.</Sub> :
          rows.map((j, i) => (
            <LineItem key={j.id || i} first={i === 0} t={`${j.routeName} · ${String(j.session ?? "").toUpperCase()}`} m={`${j.date}${j.vehicle ? " · " + j.vehicle : ""}${j.boarded != null ? " · " + j.boarded + (j.total ? "/" + j.total : "") + " aboard" : ""}`} right={<Badge tone={j.status === "completed" ? "ok" : "mut"}>{j.status}</Badge>} />
          ))}
      </Card>
    </Screen>
  );
}

/* -------------------------------- Search --------------------------------- */
function DriverSearch() {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes(null); return; }
      setBusy(true);
      try { setRes(await api.get<any>(`/api/driver/search?q=${encodeURIComponent(q.trim())}`)); } catch { setRes(null); } finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  return (
    <Screen>
      <Card>
        <CardTitle>Search</CardTitle>
        <Field placeholder="Search routes, passengers, journeys…" value={q} onChangeText={setQ} autoCapitalize="none" />
        {busy ? <Text style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>Searching…</Text> : null}
        {res && !busy && (res.total ?? 0) === 0 ? <Text style={{ color: T.muted, fontSize: 12, marginTop: 8 }}>No matches for “{res.q}”.</Text> : null}
        {res && !busy && (res.total ?? 0) > 0 ? (
          <View style={{ marginTop: 6 }}>
            {(res.groups || []).map((g: any, gi: number) => (
              <View key={g.type || gi} style={{ borderTopWidth: gi === 0 ? 0 : 1, borderTopColor: T.line, paddingVertical: 8 }}>
                <Text style={{ fontSize: 11, color: T.muted, fontWeight: "700" }}>{g.label} ({g.items.length})</Text>
                {g.items.slice(0, 6).map((it: any, i: number) => (
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
    </Screen>
  );
}

/* --------------------------------- Help ---------------------------------- */
function Help() {
  return <Screen><ScrollView><SupportTickets /></ScrollView></Screen>;
}

export const driverScreens: Record<string, React.FC> = { journeys: Journeys, routes: Routes, incident: IncidentReport, journeylog: JourneyLog, search: DriverSearch, help: Help };

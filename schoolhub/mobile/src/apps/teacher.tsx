import React, { useEffect, useState, useCallback } from "react";
import { View, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { api } from "@/api/client";
import { cacheGet, cacheSet } from "@/offline/store";
import { writeOrQueue, flushQueue, pendingCount } from "@/offline/queue";
import { useOnline } from "@/net/useOnline";
import { useAuth } from "@/auth/AuthContext";
import { Screen, Card, Title, Sub, Muted, Row, Badge, Button, Field, Notice, T } from "@/ui/kit";

const Tab = createBottomTabNavigator();

const UPDATES: [string, string][] = [["students_assembled", "Assembled"], ["all_accounted", "All accounted"], ["arrived_safely", "Arrived"], ["activity_completed", "Activity done"], ["running_late", "Running late"], ["returned", "Returned"]];
const RES_UPDATES: [string, string][] = [["arrival_accommodation", "At accommodation"], ["welfare_check", "Welfare check"], ["evening_update", "Evening update"]];

function Trips() {
  const { boot } = useAuth();
  const schoolId = boot?.schools?.[0];
  const online = useOnline();
  const [list, setList] = useState<any[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [hc, setHc] = useState({ present: "", expected: "" });
  const [pending, setPending] = useState(0);

  const loadList = useCallback(async () => {
    if (!schoolId) return;
    const c = await cacheGet<any>("teacher:trips"); if (c) setList(c.value.trips || []);
    if (online) { try { const d = await api.get(`/api/schools/${schoolId}/trips`); setList(d.trips || []); await cacheSet("teacher:trips", d); } catch {} }
    setPending(await pendingCount());
  }, [schoolId, online]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => { if (online) flushQueue().then(loadList); }, [online]);

  const loadDetail = useCallback(async (id: string) => {
    const key = `teacher:trip:${id}`;
    const c = await cacheGet<any>(key); if (c) setDetail(c.value);
    if (online && schoolId) { try { const d = await api.get(`/api/schools/${schoolId}/trips/${id}`); setDetail(d.trip); await cacheSet(key, d.trip); } catch {} }
  }, [schoolId, online]);

  async function update(type: string) { await writeOrQueue(online, { method: "POST", path: `/api/trips/${openId}/update`, body: { type } }); setPending(await pendingCount()); if (openId) loadDetail(openId); }
  async function headcount(kind: string) {
    await writeOrQueue(online, { method: "POST", path: `/api/schools/${schoolId}/trips/${openId}/headcount`, body: { kind, present: Number(hc.present || 0), expected: Number(hc.expected || 0) } });
    setPending(await pendingCount()); if (openId) loadDetail(openId);
  }

  if (openId && detail) {
    return (
      <Screen>
        <Button title="← All trips" tone="secondary" onPress={() => { setOpenId(null); setDetail(null); loadList(); }} />
        {!online && <Notice tone="info">Offline — updates queued and will sync automatically.{pending ? ` (${pending} pending)` : ""}</Notice>}
        <Card><Title>{detail.title}</Title><Muted>{detail.date}{detail.destination ? ` · ${detail.destination}` : ""}</Muted></Card>
        <Card><Title>One-tap updates</Title>
          <Row style={{ flexWrap: "wrap" }}>{UPDATES.map(([k, l]) => <Button key={k} title={l} tone="secondary" onPress={() => update(k)} />)}</Row>
          {detail.isResidential && <Row style={{ flexWrap: "wrap", marginTop: 6 }}>{RES_UPDATES.map(([k, l]) => <Button key={k} title={l} tone="secondary" onPress={() => update(k)} />)}</Row>}
        </Card>
        <Card><Title>Headcount / welfare</Title>
          <Row><Field label="Present" keyboardType="number-pad" value={hc.present} onChangeText={(v: string) => setHc({ ...hc, present: v })} />
            <Field label="Expected" keyboardType="number-pad" value={hc.expected} onChangeText={(v: string) => setHc({ ...hc, expected: v })} /></Row>
          <Row><Button title="Headcount" onPress={() => headcount("headcount")} /><Button title="Welfare check" tone="secondary" onPress={() => headcount("welfare")} /></Row>
        </Card>
        <Card><Title>Participants ({detail.students?.length || 0})</Title>
          {(detail.students || []).map((s: any) => <Row key={s.id} style={{ paddingVertical: 4 }}><Text style={{ color: T.ink }}>{s.student.firstName} {s.student.lastName}</Text><Badge tone={s.consent === "given" ? "ok" : "warn"}>{s.consent}</Badge></Row>)}
        </Card>
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>School trips</Title>
      {pending > 0 && <Notice tone="info">{pending} update(s) queued for sync.</Notice>}
      {list.length === 0 ? <Card><Muted>No trips.</Muted></Card> :
        list.map((t) => <Card key={t.id}><Row><View><Text style={{ fontWeight: "700", color: T.ink }}>{t.title}</Text><Muted>{t.date}{t.isResidential ? " · residential" : ""}</Muted></View><Button title="Open" onPress={() => { setOpenId(t.id); setDetail(null); loadDetail(t.id); }} /></Row></Card>)}
    </Screen>
  );
}

function Assistant() {
  const [q, setQ] = useState(""); const [turns, setTurns] = useState<any[]>([]); const online = useOnline();
  async function ask() { if (!q.trim()) return; try { const d = await api.post("/api/ai/ask", { question: q }); setTurns([{ q, a: d.answer }, ...turns]); setQ(""); } catch {} }
  return <Screen><Title>Assistant</Title><Sub>Ask about today's trips, policies, consent status…</Sub>
    <Field placeholder="Which policies are due for review?" value={q} onChangeText={setQ} /><Button title="Ask" onPress={ask} disabled={!online} />
    {turns.map((t, i) => <Card key={i}><Text style={{ fontWeight: "700", color: T.ink }}>{t.q}</Text><Text style={{ color: T.ink, marginTop: 6 }}>{t.a}</Text></Card>)}</Screen>;
}

const REPORT_STATUS_TONE: Record<string, "neutral" | "ok" | "warn" | "danger"> = {
  draft: "neutral", submitted: "warn", approved: "ok", scheduled: "ok", released: "ok", withdrawn: "danger",
};

/** Teacher report authoring: write pupil reports and submit them for SLT sign-off. */
function Reports() {
  const { boot } = useAuth();
  const schoolId = boot?.schools?.[0];
  const online = useOnline();
  const [releases, setReleases] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [form, setForm] = useState<{ studentId: string; name: string; summary: string; comment: string }>({ studentId: "", name: "", summary: "", comment: "" });
  const [notice, setNotice] = useState<string | null>(null);

  const loadReleases = useCallback(async () => {
    if (!schoolId) return;
    const c = await cacheGet<any>("teacher:reports"); if (c) setReleases(c.value.releases || []);
    if (online) { try { const d = await api.get(`/api/schools/${schoolId}/pupil-reports`); setReleases(d.releases || []); await cacheSet("teacher:reports", d); } catch {} }
  }, [schoolId, online]);
  useEffect(() => { loadReleases(); }, [loadReleases]);

  const openRelease = useCallback(async (id: string) => {
    if (!schoolId) return;
    try { const d = await api.get(`/api/schools/${schoolId}/pupil-reports/${id}`); setDetail(d.release); } catch {}
  }, [schoolId]);

  const searchStudents = useCallback(async (text: string) => {
    setQ(text);
    if (!schoolId || !online) return;
    try { const d = await api.get(`/api/schools/${schoolId}/students?q=${encodeURIComponent(text)}`); setStudents(d.students || []); } catch {}
  }, [schoolId, online]);

  async function saveReport() {
    if (!schoolId || !detail || !form.studentId) return;
    try {
      await api.post(`/api/schools/${schoolId}/pupil-reports/${detail.id}`, {
        reports: [{ studentId: form.studentId, summary: form.summary || undefined, body: { comment: form.comment } }],
      });
      setNotice(`Saved report for ${form.name}.`);
      setForm({ studentId: "", name: "", summary: "", comment: "" }); setQ(""); setStudents([]);
      openRelease(detail.id);
    } catch (e: any) { setNotice(e?.message || "Could not save"); }
  }

  async function submit() {
    if (!schoolId || !detail) return;
    try { await api.patch(`/api/schools/${schoolId}/pupil-reports/${detail.id}`, { action: "submit" }); setNotice("Submitted to school leadership for approval."); openRelease(detail.id); loadReleases(); }
    catch (e: any) { setNotice(e?.message || "Could not submit"); }
  }

  if (detail) {
    const editable = ["draft", "submitted"].includes(detail.status);
    return (
      <Screen>
        <Button title="‹ Back" tone="secondary" onPress={() => { setDetail(null); setNotice(null); }} />
        <Title>{detail.name}</Title>
        <Sub>Status: {detail.status} · {(detail.reports || []).length} report(s)</Sub>
        {notice ? <Notice tone="info">{notice}</Notice> : null}

        {editable && (
          <Card>
            <Text style={{ fontWeight: "700", color: T.ink, marginBottom: 6 }}>Write a report</Text>
            <Field placeholder="Search pupil…" value={q} onChangeText={searchStudents} />
            {form.studentId ? <Muted>Selected: {form.name}</Muted> : students.slice(0, 6).map((st) => (
              <Button key={st.id} title={`${st.firstName} ${st.lastName}${st.yearGroup ? " · " + st.yearGroup : ""}`} tone="secondary" onPress={() => setForm({ ...form, studentId: st.id, name: `${st.firstName} ${st.lastName}` })} />
            ))}
            <Field label="Summary (one line)" value={form.summary} onChangeText={(t: string) => setForm({ ...form, summary: t })} />
            <Field label="Comment" value={form.comment} onChangeText={(t: string) => setForm({ ...form, comment: t })} />
            <Button title="Save report" onPress={saveReport} disabled={!form.studentId || !online} />
          </Card>
        )}

        {(detail.reports || []).map((rep: any) => (
          <Card key={rep.id}>
            <Row>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: T.ink }}>{rep.student.firstName} {rep.student.lastName}</Text><Muted>{rep.summary || rep.title}</Muted></View>
              <Badge tone={REPORT_STATUS_TONE[rep.status] || "neutral"}>{rep.status}</Badge>
            </Row>
          </Card>
        ))}

        {["draft", "submitted"].includes(detail.status) && (detail.reports || []).length > 0 && (
          <Button title="Submit for approval" onPress={submit} disabled={!online} />
        )}
        {detail.status === "scheduled" ? <Notice tone="info">Approved — parents will see these on {detail.releaseAt ? new Date(detail.releaseAt).toLocaleString() : "the set date"}.</Notice> : null}
        {detail.status === "released" ? <Notice tone="ok">Released to parents.</Notice> : null}
      </Screen>
    );
  }

  return (
    <Screen>
      <Title>Reports</Title>
      <Sub>Write pupil reports; school leadership approves and releases them to parents.</Sub>
      {releases.length === 0 ? <Card><Muted>No report releases yet.</Muted></Card> :
        releases.map((r) => (
          <Card key={r.id}>
            <Row>
              <View style={{ flex: 1 }}><Text style={{ fontWeight: "700", color: T.ink }}>{r.name}</Text><Muted>{r.reportCount} report(s){r.term ? " · " + r.term : ""}</Muted></View>
              <Badge tone={REPORT_STATUS_TONE[r.status] || "neutral"}>{r.status}</Badge>
            </Row>
            <Button title="Open" onPress={() => openRelease(r.id)} />
          </Card>
        ))}
    </Screen>
  );
}

function Account() { const { logout, boot } = useAuth(); return <Screen><Title>Account</Title><Card><Muted>{boot?.user.email}</Muted><Button title="Sign out" tone="secondary" onPress={logout} /></Card></Screen>; }

export default function TeacherApp() {
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: T.brand }}>
      <Tab.Screen name="Trips" component={Trips} />
      <Tab.Screen name="Reports" component={Reports} />
      <Tab.Screen name="Assistant" component={Assistant} />
      <Tab.Screen name="Account" component={Account} />
    </Tab.Navigator>
  );
}

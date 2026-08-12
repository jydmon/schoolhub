import React, { useState } from "react";
import { View, Text } from "react-native";
import { Screen, Card, CardTitle, Sub, Badge, Button, Kpis, Kpi, LineItem, Field, Seg, Loading, Empty, Note, T, toast } from "@/ui/kit";
import { useApi } from "@/data/useApi";
import { useAuth } from "@/auth/AuthContext";

function useSchoolId() {
  const { boot } = useAuth();
  return boot?.schools?.[0] || null;
}

function Operations() {
  const sid = useSchoolId();
  const { data, loading, error } = useApi<any>(sid ? `/api/schools/${sid}/ops/dashboard` : null);
  if (!sid) return <Screen><Empty>No school linked to your account.</Empty></Screen>;
  if (loading && !data) return <Screen><Loading label="Loading operations…" /></Screen>;

  const d = data || {};
  // Render whatever numeric metrics the ops dashboard returns (shape-tolerant).
  const metrics = Object.entries(d).filter(([, v]) => typeof v === "number").slice(0, 6) as [string, number][];
  const lists = Object.entries(d).filter(([, v]) => Array.isArray(v)) as [string, any[]][];

  return (
    <Screen>
      {metrics.length > 0 ? (
        <Kpis>
          {metrics.map(([k, v]) => <Kpi key={k} k={k.replace(/([A-Z])/g, " $1")} v={String(v)} />)}
        </Kpis>
      ) : null}
      {lists.map(([k, arr]) => arr.length ? (
        <Card key={k}>
          <CardTitle>{k.replace(/([A-Z])/g, " $1")}</CardTitle>
          {arr.slice(0, 6).map((it: any, i: number) => (
            <LineItem key={i} first={i === 0} t={typeof it === "string" ? it : it.title || it.name || it.label || JSON.stringify(it).slice(0, 40)}
              m={typeof it === "object" ? (it.detail || it.subtitle || it.status || "") : ""} />
          ))}
        </Card>
      ) : null)}
      {metrics.length === 0 && lists.length === 0 ? <Empty>Operations dashboard is live but returned no metrics right now.</Empty> : null}
      {error ? <Note>Showing saved data — couldn't refresh right now.</Note> : null}
    </Screen>
  );
}

function Emergency() {
  const [msg, setMsg] = useState("");
  const [aud, setAud] = useState("Whole school");
  // Safety: this preview build does NOT actually broadcast to real guardians.
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="danger">critical</Badge>}>Emergency alert</CardTitle>
        <Sub>Sends immediately across in-app, push, SMS & WhatsApp to the selected audience.</Sub>
        <Seg options={["Whole school", "Year group", "Route"].map((l) => ({ label: l, active: aud === l, onPress: () => setAud(l) }))} />
        <Field multiline value={msg} onChangeText={setMsg} placeholder="e.g. Site closed — please collect children from the main hall." style={{ minHeight: 70 }} />
        <Button tone="danger" title="Send emergency alert" onPress={() => toast("Disabled in preview build — confirm go-live to enable")} />
      </Card>
      <Note>Broadcast sending is intentionally disabled in this build so testing can't reach real guardians. I'll enable the live POST once you confirm you're ready to go live.</Note>
    </Screen>
  );
}

function Integrations() {
  const sid = useSchoolId();
  const { data, loading, error } = useApi<any>(sid ? `/api/schools/${sid}/integrations` : null);
  const items: any[] = data?.integrations || data?.items || (Array.isArray(data) ? data : []);
  if (!sid) return <Screen><Empty>No school linked to your account.</Empty></Screen>;
  if (loading && !data) return <Screen><Loading label="Loading integrations…" /></Screen>;

  const st = (s?: string) => (s === "connected" || s === "ok" || s === "active" ? "ok" : s === "error" || s === "failed" ? "danger" : "warn");
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="info">read-only on mobile</Badge>}>Connector status</CardTitle>
        {items.length === 0 ? <Text style={{ color: T.muted, fontSize: 13, paddingVertical: 6 }}>No integrations configured.</Text> :
          items.map((it, i) => (
            <LineItem key={it.id || i} first={i === 0} t={it.name || it.provider || it.type || "Connector"}
              m={it.lastSuccessAt ? "last success " + String(it.lastSuccessAt).slice(0, 10) : it.detail || ""}
              right={<Badge tone={st(it.status) as any}>{it.status || "unknown"}</Badge>} />
          ))}
      </Card>
      <Note>Full setup & field mapping stay in the web portal; here you can view status.</Note>
      {error ? <Note>Couldn't refresh right now.</Note> : null}
    </Screen>
  );
}

export const adminScreens: Record<string, React.FC> = { operations: Operations, emergency: Emergency, integrations: Integrations };

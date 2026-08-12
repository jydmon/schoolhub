import React, { useState } from "react";
import { Screen, Card, CardTitle, Sub, Badge, Button, Kpis, Kpi, LineItem, Seg, Field, Note, toast } from "@/ui/kit";
import { useRole } from "@/app/ctx";

function Operations() {
  const { setTab } = useRole();
  return (
    <Screen>
      <Kpis>
        <Kpi k="Present" v="612" h="of 640 · 96%" vColor="#16A34A" />
        <Kpi k="Buses active" v="7" h="of 8 routes" />
        <Kpi warn k="Delayed" v="2" h="+8 min avg" />
        <Kpi warn k="MIS sync" v="2 skipped" vSize={16} h="SIMS · invalid DOB" />
      </Kpis>
      <Card>
        <CardTitle>Needs attention</CardTitle>
        <LineItem first t="Ecomuseum — 4 consents out" m="departs Friday" right={<Badge tone="warn">review</Badge>} />
        <LineItem t="Safeguarding note for DSL" m="restricted to senior staff" right={<Badge tone="danger">high</Badge>} />
        <LineItem t="MIS sync — 2 skipped" m="tap Integrations"
          right={<Button sm title="Fix" onPress={() => setTab("integrations")} />} />
      </Card>
    </Screen>
  );
}

function Emergency() {
  const [msg, setMsg] = useState("Site closed due to power outage — please collect children from the main hall.");
  const [aud, setAud] = useState("Whole school");
  return (
    <Screen>
      <Card>
        <CardTitle right={<Badge tone="danger">critical</Badge>}>Emergency alert</CardTitle>
        <Sub>Sends immediately across in-app, push, SMS & WhatsApp to the selected audience.</Sub>
        <Seg options={["Whole school", "Year group", "Route"].map((l) => ({ label: l, active: aud === l, onPress: () => setAud(l) }))} />
        <Field multiline value={msg} onChangeText={setMsg} style={{ minHeight: 70 }} />
        <Button tone="danger" title="Send emergency alert" onPress={() => toast("Emergency alert sent to 512 guardians (demo)")} />
      </Card>
      <Note>Every emergency alert is audited with sender, audience and timestamp.</Note>
    </Screen>
  );
}

function Integrations() {
  return (
    <Screen>
      <Kpis>
        <Kpi k="Connected" v="2/3" h="active" vColor="#16A34A" />
        <Kpi warn k="Failed / auth" v="1" h="Arbor" />
      </Kpis>
      <Card>
        <CardTitle right={<Badge tone="info">read-only on mobile</Badge>}>Connector status</CardTitle>
        <LineItem first t="SIMS (MIS)" m="last success today 03:00" right={<Badge tone="ok">connected</Badge>} />
        <LineItem t="Google Calendar" m="last success 08:15" right={<Badge tone="ok">connected</Badge>} />
        <LineItem t="Arbor (MIS)" m="token expired" right={<Badge tone="danger">auth required</Badge>} />
      </Card>
      <Card>
        <CardTitle>Critical failure</CardTitle>
        <LineItem first t="Arbor sync failed" m="authentication · 03:02"
          right={<Button sm title="Retry" onPress={() => toast("Retry queued (demo)")} />} />
        <Note>Full setup & field mapping stay in the web portal; here you can view status and trigger a permitted retry.</Note>
      </Card>
    </Screen>
  );
}

export const adminScreens: Record<string, React.FC> = { operations: Operations, emergency: Emergency, integrations: Integrations };

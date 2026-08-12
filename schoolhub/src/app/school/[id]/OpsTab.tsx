"use client";

import { useEffect, useState, useCallback } from "react";

const TILE_LABELS: [string, string][] = [
  ["studentsPresent", "Students present"], ["studentsAbsent", "Students absent"], ["activeBuses", "Active buses"],
  ["delayedRoutes", "Delayed routes"], ["studentsOnboard", "Students onboard"], ["activeTrips", "Active trips"],
  ["residentialTrips", "Residential trips"], ["eventsToday", "Events today"], ["outstandingConsent", "Outstanding consent"],
  ["messagesAttention", "Messages needing attention"], ["integrationFailures", "Integration failures"], ["transportIncidents", "Transport incidents"],
];
const REPORTS = ["overview", "transport", "trips", "engagement", "ai", "integrations"];

export default function OpsTab({ schoolId, subscription }: { schoolId: string; subscription?: any }) {
  const [sub, setSub] = useState<"dashboard" | "reports" | "compliance">("dashboard");
  return (
    <>
      <div className="tabs">
        {([["dashboard", "Dashboard"], ["reports", "Reports"], ["compliance", "Compliance"]] as [any, string][]).map(([k, l]) => (
          <button key={k} className={sub === k ? "active" : ""} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === "dashboard" && <Dashboard schoolId={schoolId} subscription={subscription} />}
      {sub === "reports" && <Reports schoolId={schoolId} />}
      {sub === "compliance" && <Compliance schoolId={schoolId} />}
    </>
  );
}

function SubscriptionBanner({ subscription }: { subscription?: any }) {
  if (!subscription) return null;
  const planName = subscription.plan?.name || subscription.plan?.key || "—";
  const status = subscription.status || "active";
  const renew = subscription.renewalDate ? new Date(subscription.renewalDate).toLocaleDateString() : null;
  const seats = subscription.studentLimit ? subscription.studentLimit.toLocaleString() : null;
  return (
    <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", background: "linear-gradient(120deg,#eef2ff,#e0f2fe)", border: "1px solid #c7d2fe" }}>
      <div>
        <strong style={{ fontSize: 16 }}>{planName} plan</strong>
        <div className="muted" style={{ fontSize: 13 }}>
          {renew ? `Renews ${renew}` : "No renewal date set"}{seats ? ` · up to ${seats} pupil seats` : ""}
        </div>
      </div>
      <span className={`badge ${status}`}>{status}</span>
    </div>
  );
}

function Dashboard({ schoolId, subscription }: { schoolId: string; subscription?: any }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(`/api/schools/${schoolId}/ops/dashboard`).then((r) => r.json()).then(setD); }, [schoolId]);
  if (!d) return <><SubscriptionBanner subscription={subscription} /><div className="panel">Loading…</div></>;
  return (
    <>
    <SubscriptionBanner subscription={subscription} />
    <div className="panel">
      <h2>Operations dashboard</h2><p className="sub">Live view · {d.date}</p>
      <div className="stat-grid">
        {TILE_LABELS.map(([k, l]) => (
          <div className="stat" key={k}><div className="n" style={{ color: (k === "delayedRoutes" || k === "integrationFailures" || k === "transportIncidents" || k === "studentsAbsent") && d.tiles[k] > 0 ? "var(--danger)" : undefined }}>{d.tiles[k]}</div><div className="l">{l}</div></div>
        ))}
      </div>
    </div>
    </>
  );
}

function ChildrenReport({ schoolId }: { schoolId: string }) {
  const [releases, setReleases] = useState<any[] | null>(null);
  useEffect(() => { fetch(`/api/schools/${schoolId}/pupil-reports`).then((r) => r.json()).then((d) => setReleases(d.releases ?? [])); }, [schoolId]);
  return (
    <div className="panel">
      <h2>Children&apos;s report</h2>
      <p className="sub">Pupil report releases — attainment, attendance &amp; behaviour reports prepared for pupils and released to parents. Manage authoring, sign-off and release in the <strong>Reports</strong> (Pupil reports) area; this is the read-only overview.</p>
      {releases === null ? <p className="muted">Loading…</p> : (
        <table>
          <thead><tr><th>Release</th><th>Type</th><th>Term</th><th>Status</th><th>Reports</th><th>Viewed</th></tr></thead>
          <tbody>
            {releases.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.name}</strong></td>
                <td className="muted">{r.type}</td>
                <td className="muted">{r.term || "—"}</td>
                <td><span className={`badge ${r.status === "released" ? "active" : r.status === "scheduled" ? "trial" : "archived"}`}>{r.status}</span></td>
                <td>{r.total ?? 0}</td>
                <td className="muted">{r.viewed ?? 0}{r.total ? ` / ${r.total}` : ""}</td>
              </tr>
            ))}
            {releases.length === 0 && <tr><td colSpan={6} className="muted">No pupil report releases yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Reports({ schoolId }: { schoolId: string }) {
  const [family, setFamily] = useState<"system" | "children">("system");
  const [type, setType] = useState("overview");
  const [report, setReport] = useState<any>(null);
  const [scheduled, setScheduled] = useState<any[]>([]);
  const [sf, setSf] = useState({ type: "transport", cadence: "weekly", format: "csv", recipients: "" });
  const loadReport = useCallback(async () => setReport((await fetch(`/api/schools/${schoolId}/reports/${type}`).then((r) => r.json())).report), [schoolId, type]);
  const loadSched = useCallback(async () => setScheduled((await fetch(`/api/schools/${schoolId}/scheduled-reports`).then((r) => r.json())).reports ?? []), [schoolId]);
  useEffect(() => { loadReport(); }, [loadReport]);
  useEffect(() => { loadSched(); }, [loadSched]);

  async function schedule() {
    await fetch(`/api/schools/${schoolId}/scheduled-reports`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(sf) });
    loadSched();
  }

  return (
    <>
      <div className="panel" style={{ paddingTop: 14, paddingBottom: 14 }}>
        <label style={{ marginBottom: 6 }}>Report type</label>
        <div className="tabs" style={{ marginBottom: 0 }}>
          <button className={family === "system" ? "active" : ""} onClick={() => setFamily("system")}>System report</button>
          <button className={family === "children" ? "active" : ""} onClick={() => setFamily("children")}>Children&apos;s report</button>
        </div>
      </div>
      {family === "children" ? <ChildrenReport schoolId={schoolId} /> : (
      <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>System report</h2><p className="sub" style={{ marginBottom: 0 }}>Operational reports (transport, trips, engagement, AI, integrations). Choose a report, then export.</p></div>
          <select value={type} onChange={(e) => setType(e.target.value)}>{REPORTS.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        {report && (
          <>
            <h2 style={{ fontSize: 16, marginTop: 12 }}>{report.title}</h2>
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))" }}>
              {report.metrics.map((m: any, i: number) => <div className="stat" key={i}><div className="n" style={{ fontSize: 20 }}>{m.value}</div><div className="l">{m.label}</div></div>)}
            </div>
            <table style={{ marginTop: 12 }}>
              <thead><tr>{report.table.headers.map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead>
              <tbody>{report.table.rows.map((row: any[], i: number) => <tr key={i}>{row.map((c, j) => <td key={j}>{c}</td>)}</tr>)}
                {report.table.rows.length === 0 && <tr><td className="muted" colSpan={report.table.headers.length}>No data.</td></tr>}</tbody>
            </table>
            <div style={{ marginTop: 12 }}>
              <a href={`/api/schools/${schoolId}/reports/${type}?format=csv`}><button className="secondary">Export CSV</button></a>{" "}
              <a href={`/api/schools/${schoolId}/reports/${type}?format=pdf`}><button className="secondary">Export PDF</button></a>{" "}
              <button className="secondary" onClick={() => window.print()}>Print</button>
            </div>
          </>
        )}
      </div>
      <div className="panel">
        <h2>Scheduled reports</h2>
        <table><thead><tr><th>Type</th><th>Cadence</th><th>Format</th><th>Scope</th><th>Recipients</th></tr></thead><tbody>
          {scheduled.map((s) => <tr key={s.id}><td>{s.type}</td><td>{s.cadence}</td><td>{s.format}</td><td>{s.scope}</td><td className="muted">{s.recipients || "—"}</td></tr>)}
          {scheduled.length === 0 && <tr><td colSpan={5} className="muted">None scheduled.</td></tr>}
        </tbody></table>
        <div className="row" style={{ marginTop: 10 }}>
          <div><label>Report</label><select value={sf.type} onChange={(e) => setSf({ ...sf, type: e.target.value })}>{REPORTS.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><label>Cadence</label><select value={sf.cadence} onChange={(e) => setSf({ ...sf, cadence: e.target.value })}><option>daily</option><option>weekly</option><option>monthly</option></select></div>
          <div><label>Format</label><select value={sf.format} onChange={(e) => setSf({ ...sf, format: e.target.value })}><option>csv</option><option>pdf</option></select></div>
          <div style={{ flex: 2 }}><label>Recipients (emails)</label><input value={sf.recipients} onChange={(e) => setSf({ ...sf, recipients: e.target.value })} /></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={schedule}>Schedule</button></div>
        </div>
        <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>Delivery runs from a background job (see DEPLOYMENT.md). School-leader and trust-level scopes roll up accordingly.</p>
      </div>
      </>
      )}
    </>
  );
}

function Compliance({ schoolId }: { schoolId: string }) {
  const [p, setP] = useState<any>(null);
  const [requests, setRequests] = useState<any[]>([]);
  const [dr, setDr] = useState({ subjectType: "student", subjectId: "", type: "export" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    setP((await fetch(`/api/schools/${schoolId}/privacy`).then((r) => r.json())).privacy);
    setRequests((await fetch(`/api/schools/${schoolId}/data-requests`).then((r) => r.json())).requests ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  if (!p) return <div className="panel">Loading…</div>;

  async function savePrivacy() { await fetch(`/api/schools/${schoolId}/privacy`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }); setMsg({ kind: "ok", text: "Privacy settings saved." }); }
  async function purge() { const r = await fetch(`/api/schools/${schoolId}/retention/purge`, { method: "POST" }).then((x) => x.json()); setMsg({ kind: "ok", text: `Retention purge: ${JSON.stringify(r.purged)}` }); }
  async function createDsr() { await fetch(`/api/schools/${schoolId}/data-requests`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dr) }); setDr({ ...dr, subjectId: "" }); load(); }
  async function fulfill(id: string) { const r = await fetch(`/api/schools/${schoolId}/data-requests/${id}/fulfill`, { method: "POST" }).then((x) => x.json()); setMsg({ kind: "ok", text: r.export ? "Export ready (see console/network)." : "Request fulfilled." }); if (r.export) console.log("DSR export", r.export); load(); }
  async function emergency() { const title = prompt("Emergency alert title?"); if (!title) return; const r = await fetch(`/api/schools/${schoolId}/emergency`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title }) }).then((x) => x.json()); setMsg({ kind: "ok", text: `Emergency alert sent to ${r.recipients} recipient(s) (overrode preferences & quiet hours).` }); }

  return (
    <>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <div className="panel">
        <h2>Compliance &amp; privacy</h2>
        <div className="row">
          <div><label>Regime</label><select value={p.complianceRegime} onChange={(e) => setP({ ...p, complianceRegime: e.target.value })}><option value="UK_GDPR">UK GDPR / DPA</option><option value="FERPA">FERPA (US)</option></select></div>
          <div><label>Data retention (days)</label><input type="number" value={p.dataRetentionDays} onChange={(e) => setP({ ...p, dataRetentionDays: Number(e.target.value) })} /></div>
        </div>
        <div className="chips" style={{ marginTop: 10 }}>
          {[["restrictMedical", "Restrict medical"], ["restrictSend", "Restrict SEND"], ["restrictLocation", "Restrict location"], ["childLocationPrivacy", "Child location privacy"]].map(([k, l]) => (
            <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!p[k]} onChange={(e) => setP({ ...p, [k]: e.target.checked })} /> {l}</label>
          ))}
        </div>
        <div style={{ marginTop: 12 }}><button onClick={savePrivacy}>Save</button> <button className="secondary" onClick={purge}>Run retention purge</button> <button className="danger" onClick={emergency}>Send emergency alert</button></div>
      </div>
      <div className="panel">
        <h2>Data subject requests</h2>
        <table><thead><tr><th>When</th><th>Subject</th><th>Type</th><th>Status</th><th className="right"></th></tr></thead><tbody>
          {requests.map((r) => <tr key={r.id}><td className="mono muted">{new Date(r.createdAt).toLocaleDateString()}</td><td>{r.subjectType} {r.subjectId.slice(0, 8)}…</td><td>{r.type}</td><td><span className={`badge ${r.status === "fulfilled" ? "active" : "trial"}`}>{r.status}</span></td><td className="right">{r.status === "open" && <button className="small" onClick={() => fulfill(r.id)}>Fulfil</button>}</td></tr>)}
          {requests.length === 0 && <tr><td colSpan={5} className="muted">No requests.</td></tr>}
        </tbody></table>
        <div className="row" style={{ marginTop: 10 }}>
          <div><label>Subject type</label><select value={dr.subjectType} onChange={(e) => setDr({ ...dr, subjectType: e.target.value })}><option value="student">Student</option><option value="user">User</option></select></div>
          <div style={{ flex: 2 }}><label>Subject id</label><input value={dr.subjectId} onChange={(e) => setDr({ ...dr, subjectId: e.target.value })} placeholder="student/user id" /></div>
          <div><label>Type</label><select value={dr.type} onChange={(e) => setDr({ ...dr, type: e.target.value })}><option value="export">Export (SAR)</option><option value="deletion">Erasure</option></select></div>
          <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={createDsr}>Log request</button></div>
        </div>
      </div>
    </>
  );
}

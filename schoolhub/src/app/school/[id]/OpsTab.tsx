"use client";

import { useEffect, useState, useCallback } from "react";
import AssistantChat from "@/components/AssistantChat";

const TILE_LABELS: [string, string][] = [
  ["studentsPresent", "Students present"], ["studentsAbsent", "Students absent"], ["activeBuses", "Active buses"],
  ["delayedRoutes", "Delayed routes"], ["studentsOnboard", "Students onboard"], ["activeTrips", "Active trips"],
  ["residentialTrips", "Residential trips"], ["eventsToday", "Events today"], ["outstandingConsent", "Outstanding consent"],
  ["messagesAttention", "Messages needing attention"], ["integrationFailures", "Integration failures"], ["transportIncidents", "Transport incidents"],
];
const REPORTS = ["overview", "students", "attendance", "transport", "trips", "engagement", "ai", "integrations"];

export default function OpsTab({ schoolId, subscription }: { schoolId: string; subscription?: any }) {
  const [sub, setSub] = useState<"dashboard" | "reports" | "compliance">("dashboard");
  return (
    <>
      <AssistantChat schoolId={schoolId} examples={["How many students are enrolled?", "List the pupils in Year 4", "How do I invite a parent?", "Where do I generate a PDF report?", "How do I record behaviour?", "Which pupils have allergies?"]} />
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

// ---- lightweight, dependency-free charts (accessible, theme-consistent) ----
const CHART_COLORS = ["#4f46e5", "#0ea5e9", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#14b8a6", "#64748b"];
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (!data.length) return <p className="muted">No data yet.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map((d, i) => (
        <div key={d.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr 42px", alignItems: "center", gap: 10 }}>
          <span className="muted" style={{ fontSize: 12.5, textAlign: "right", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.label}</span>
          <span style={{ background: "#eef2f7", borderRadius: 6, height: 16, overflow: "hidden" }}><span style={{ display: "block", height: "100%", width: `${(d.value / max) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length], borderRadius: 6, transition: "width .3s" }} /></span>
          <strong style={{ fontSize: 13 }}>{d.value}</strong>
        </div>
      ))}
    </div>
  );
}
function Donut({ segments, centerLabel }: { segments: { label: string; value: number; color: string }[]; centerLabel?: string }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
      <svg width="130" height="130" viewBox="0 0 130 130" role="img" aria-label="chart">
        <circle cx="65" cy="65" r={R} fill="none" stroke="#eef2f7" strokeWidth="16" />
        {total > 0 && segments.map((s, i) => {
          const len = (s.value / total) * C;
          const el = <circle key={i} cx="65" cy="65" r={R} fill="none" stroke={s.color} strokeWidth="16" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-offset} transform="rotate(-90 65 65)" />;
          offset += len; return el;
        })}
        <text x="65" y="62" textAnchor="middle" fontSize="20" fontWeight="700" fill="#1e293b">{total}</text>
        <text x="65" y="80" textAnchor="middle" fontSize="10" fill="#64748b">{centerLabel || "total"}</text>
      </svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {segments.map((s) => <span key={s.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><span style={{ width: 11, height: 11, borderRadius: 3, background: s.color }} /> {s.label} <strong>{s.value}</strong></span>)}
      </div>
    </div>
  );
}

const DASH_SECTIONS: [string, string][] = [["live", "Live operations"], ["data", "School data"], ["charts", "Charts"], ["upcoming", "Upcoming activities"]];
function Dashboard({ schoolId, subscription }: { schoolId: string; subscription?: any }) {
  const [d, setD] = useState<any>(null);
  const [show, setShow] = useState<Record<string, boolean>>({ live: true, data: true, charts: true, upcoming: true });
  const [customize, setCustomize] = useState(false);
  useEffect(() => { fetch(`/api/schools/${schoolId}/ops/dashboard`).then((r) => r.json()).then(setD); }, [schoolId]);
  useEffect(() => {
    try { const raw = window.localStorage.getItem(`siplat-dash-${schoolId}`); if (raw) setShow((p) => ({ ...p, ...JSON.parse(raw) })); } catch { /* ignore */ }
  }, [schoolId]);
  function toggle(k: string) { setShow((p) => { const next = { ...p, [k]: !p[k] }; try { window.localStorage.setItem(`siplat-dash-${schoolId}`, JSON.stringify(next)); } catch { /* ignore */ } return next; }); }
  if (!d) return <><SubscriptionBanner subscription={subscription} /><div className="panel">Loading…</div></>;

  const ins = d.insights || {};
  const c = ins.counts || {};
  const dataCards: [string, number][] = [
    ["Pupils", c.students ?? 0], ["Enrolled", c.enrolled ?? 0], ["Staff", c.staff ?? 0], ["Parents", c.guardians ?? 0],
    ["Classes", c.classes ?? 0], ["Vehicles", c.vehicles ?? 0], ["Routes", c.routes ?? 0], ["Menu items", c.menuItems ?? 0],
    ["Trips", c.trips ?? 0], ["Reports", c.reports ?? 0],
  ];
  const src = ins.studentsBySource || {};
  const statusColors: Record<string, string> = { enrolled: "#22c55e", applicant: "#f59e0b", leaver: "#64748b", archived: "#94a3b8" };
  const statusSegs = Object.entries(ins.studentsByStatus || {}).map(([k, v]: any) => ({ label: k, value: v, color: statusColors[k] || "#4f46e5" }));
  const attSegs = [
    { label: "Present", value: ins.attendance?.present ?? 0, color: "#22c55e" },
    { label: "Absent", value: ins.attendance?.absent ?? 0, color: "#ef4444" },
  ];

  return (
    <>
      <SubscriptionBanner subscription={subscription} />
      <div className="panel" style={{ paddingTop: 12, paddingBottom: 12 }}>
        <div className="flex-between">
          <div><h2 style={{ marginBottom: 2 }}>Dashboard</h2><p className="sub" style={{ marginBottom: 0 }}>Live operations and your school data · {d.date}</p></div>
          <button className="secondary small" onClick={() => setCustomize((v) => !v)}>{customize ? "Done" : "Customise ⚙"}</button>
        </div>
        {customize && (
          <div className="chips" style={{ marginTop: 10 }}>
            {DASH_SECTIONS.map(([k, l]) => <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!show[k]} onChange={() => toggle(k)} /> {l}</label>)}
          </div>
        )}
      </div>

      {show.live && (
        <div className="panel">
          <h2 style={{ fontSize: 15 }}>Live operations</h2>
          <div className="stat-grid">
            {TILE_LABELS.map(([k, l]) => (
              <div className="stat" key={k}><div className="n" style={{ color: (k === "delayedRoutes" || k === "integrationFailures" || k === "transportIncidents" || k === "studentsAbsent") && d.tiles[k] > 0 ? "var(--danger)" : undefined }}>{d.tiles[k]}</div><div className="l">{l}</div></div>
            ))}
          </div>
        </div>
      )}

      {show.data && (
        <div className="panel">
          <div className="flex-between"><h2 style={{ fontSize: 15 }}>School data</h2><span className="muted" style={{ fontSize: 12 }}>manual {src.manual ?? 0} · imported {src.import ?? 0} · API {src.api ?? 0}</span></div>
          <p className="sub">Everything in your school — however it got here: added manually, bulk-imported, or fed from an integration.</p>
          <div className="stat-grid">
            {dataCards.map(([l, v]) => <div className="stat" key={l}><div className="n">{v}</div><div className="l">{l}</div></div>)}
          </div>
        </div>
      )}

      {show.charts && (
        <div className="panel">
          <h2 style={{ fontSize: 15 }}>Insights</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: 24, marginTop: 8 }}>
            <div><h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>Pupils by year group</h3><BarChart data={ins.studentsByYear || []} /></div>
            <div><h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>Attendance today</h3><Donut segments={attSegs} centerLabel="pupils" /></div>
            <div><h3 style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--muted)" }}>Pupils by status</h3><Donut segments={statusSegs.length ? statusSegs : [{ label: "none", value: 0, color: "#e2e8f0" }]} centerLabel="pupils" /></div>
          </div>
        </div>
      )}

      {show.upcoming && (
        <div className="panel">
          <h2 style={{ fontSize: 15 }}>Upcoming activities</h2>
          <table>
            <thead><tr><th>When</th><th>Activity</th><th>Type</th></tr></thead>
            <tbody>
              {(ins.upcoming || []).map((u: any) => (
                <tr key={u.kind + u.id}><td className="mono muted">{new Date(u.when).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</td><td><strong>{u.title}</strong></td><td>{u.kind === "trip" ? <span className="badge trial">trip</span> : <span className="badge role">{u.meta}</span>}</td></tr>
              ))}
              {(!ins.upcoming || ins.upcoming.length === 0) && <tr><td colSpan={3} className="muted">Nothing scheduled — add events in the Calendar or plan a trip.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
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

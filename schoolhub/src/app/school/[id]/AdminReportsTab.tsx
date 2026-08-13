"use client";

import { useCallback, useEffect, useState } from "react";

const REPORT_TYPES: [string, string][] = [
  ["overview", "Operations overview"],
  ["students", "Pupil roll (counts by year & status)"],
  ["attendance", "Attendance metrics (last 30 days)"],
  ["transport", "Transport punctuality"],
  ["trips", "Trips & consent"],
  ["clubs", "Clubs & activities (participation & attendance)"],
  ["engagement", "Parent engagement"],
  ["ai", "AI assistant usage"],
  ["integrations", "Integrations health"],
];

export default function AdminReportsTab({ schoolId, onNavigate }: { schoolId: string; onNavigate?: (tab: string) => void }) {
  const [sub, setSub] = useState<"reports" | "search">("reports");
  return (
    <>
      <div className="tabs">
        {([["reports", "Reports & downloads"], ["search", "Global search"]] as [any, string][]).map(([k, l]) => (
          <button key={k} className={sub === k ? "active" : ""} onClick={() => setSub(k)}>{l}</button>
        ))}
      </div>
      {sub === "reports" && <ReportGen schoolId={schoolId} />}
      {sub === "search" && <GlobalSearch schoolId={schoolId} onNavigate={onNavigate} />}
    </>
  );
}

function ReportGen({ schoolId }: { schoolId: string }) {
  const [type, setType] = useState("students");
  const [report, setReport] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setBusy(true);
    try { const d = await fetch(`/api/schools/${schoolId}/reports/${type}`).then((r) => r.json()); setReport(d.report ?? null); }
    finally { setBusy(false); }
  }, [schoolId, type]);
  useEffect(() => { load(); }, [load]);
  const label = REPORT_TYPES.find(([k]) => k === type)?.[1] || type;

  return (
    <div className="panel">
      <div className="flex-between">
        <div><h2>Reports</h2><p className="sub" style={{ marginBottom: 0 }}>Generate a report and download it as a PDF or CSV. Data is live from your school records.</p></div>
      </div>
      <div className="row" style={{ marginTop: 12, alignItems: "flex-end" }}>
        <div style={{ flex: 2 }}><label>Report</label><select value={type} onChange={(e) => setType(e.target.value)}>{REPORT_TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div style={{ display: "flex", gap: 8 }}>
          <a href={`/api/schools/${schoolId}/reports/${type}?format=pdf`}><button type="button">Download PDF</button></a>
          <a href={`/api/schools/${schoolId}/reports/${type}?format=xlsx`}><button type="button" className="secondary">Download Excel</button></a>
          <a href={`/api/schools/${schoolId}/reports/${type}?format=csv`}><button type="button" className="secondary">Download CSV</button></a>
        </div>
      </div>

      {busy && <p className="muted" style={{ marginTop: 12 }}>Building {label}…</p>}
      {report && !busy && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: "0 0 4px" }}>{report.title}</h3>
          <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>Generated {new Date(report.generatedAt).toLocaleString()}</p>
          <div className="stat-grid" style={{ marginTop: 8 }}>
            {(report.metrics || []).map((m: any, i: number) => <div className="stat" key={i}><div className="n">{m.value}</div><div className="l">{m.label}</div></div>)}
          </div>
          <table style={{ marginTop: 14 }}>
            <thead><tr>{(report.table?.headers || []).map((h: string, i: number) => <th key={i}>{h}</th>)}</tr></thead>
            <tbody>
              {(report.table?.rows || []).map((row: any[], i: number) => <tr key={i}>{row.map((c, j) => <td key={j}>{String(c)}</td>)}</tr>)}
              {(report.table?.rows || []).length === 0 && <tr><td className="muted" colSpan={(report.table?.headers || []).length || 1}>No rows.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GlobalSearch({ schoolId, onNavigate }: { schoolId: string; onNavigate?: (tab: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes(null); return; }
      setBusy(true);
      try { const d = await fetch(`/api/schools/${schoolId}/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()); setRes(d); }
      finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, schoolId]);

  return (
    <div className="panel">
      <h2>Global search</h2>
      <p className="sub">Search across your whole portal — pupils, parents, staff, users, calendar, timetable, trips, meals, clubs, documents, policies, announcements, FAQs, messages, reports and trust documents.</p>
      <input autoFocus placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} />
      {busy && <p className="muted" style={{ marginTop: 12 }}>Searching…</p>}
      {res && !busy && res.total === 0 && <p className="muted" style={{ marginTop: 12 }}>No matches for “{res.q}”.</p>}
      {res && !busy && res.total > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="flex-between" style={{ alignItems: "center" }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{res.total} match(es) across {res.groups.length} section(s).</p>
            <a href={`/api/schools/${schoolId}/search?q=${encodeURIComponent(q.trim())}&format=csv`}><button type="button" className="secondary small">Download results (CSV)</button></a>
          </div>
          {res.groups.map((g: any) => (
            <div key={g.type} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div className="flex-between"><strong>{g.label} <span className="muted" style={{ fontWeight: 400 }}>({g.items.length})</span></strong>
                {onNavigate && <button className="linklike" style={{ fontSize: 12 }} onClick={() => onNavigate(g.tab)}>Open {g.label} ↗</button>}</div>
              {g.items.map((it: any, i: number) => (
                <div key={i} style={{ padding: "5px 0" }}>
                  <button className="linklike" style={{ textAlign: "left" }} onClick={() => onNavigate?.(g.tab)}>{it.title}</button>
                  {it.subtitle ? <span className="muted" style={{ fontSize: 12 }}> · {it.subtitle}</span> : null}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

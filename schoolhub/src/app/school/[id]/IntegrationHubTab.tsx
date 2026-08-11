"use client";

import { useEffect, useState, useCallback } from "react";

// Integration Hub — unified administration area. Sub-sections cover the MVP:
// Dashboard, Connector Marketplace, Import (end-to-end with AI mapping),
// Errors, and Source of Truth. Connected-systems management + field mappings +
// sync history reuse the existing Integrations tab.

type Section = "dashboard" | "marketplace" | "import" | "errors" | "sot";
const SECTIONS: [Section, string][] = [
  ["dashboard", "Dashboard"], ["marketplace", "Marketplace"], ["import", "Import (AI mapping)"], ["errors", "Errors"], ["sot", "Source of Truth"],
];

const api = (schoolId: string, path: string) => `/api/schools/${schoolId}/integration-hub${path}`;

export default function IntegrationHubTab({ schoolId }: { schoolId: string }) {
  const [section, setSection] = useState<Section>("dashboard");
  return (
    <>
      <div className="panel">
        <h2>Integration Hub</h2>
        <p className="sub">Connect SchoolHub to your MIS, calendars, document repositories, GPS, payments and more — without replacing your current systems. All data is restricted to this school.</p>
        <div className="chips">
          {SECTIONS.map(([s, label]) => (
            <button key={s} className={`chip ${section === s ? "active" : ""}`} style={{ margin: 3 }} onClick={() => setSection(s)}>{label}</button>
          ))}
        </div>
      </div>
      {section === "dashboard" && <Dashboard schoolId={schoolId} />}
      {section === "marketplace" && <Marketplace schoolId={schoolId} />}
      {section === "import" && <ImportRunner schoolId={schoolId} />}
      {section === "errors" && <Errors schoolId={schoolId} />}
      {section === "sot" && <SourceOfTruth schoolId={schoolId} />}
    </>
  );
}

function Dashboard({ schoolId }: { schoolId: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(api(schoolId, "/dashboard")).then((r) => r.json()).then((x) => setD(x.dashboard)); }, [schoolId]);
  if (!d) return <div className="panel"><p className="muted">Loading…</p></div>;
  const t = d.totals, q = d.queues, p = d.processing;
  return (
    <div className="panel">
      <div className="tiles">
        <div className="tile"><div className="k">Connected systems</div><div className="v">{t.connected}</div><div className="h">{t.active} active</div></div>
        <div className={`tile ${t.failed ? "warn" : ""}`}><div className="k">Failed / auth</div><div className="v">{t.failed + t.authRequired}</div><div className="h">{t.authRequired} need auth</div></div>
        <div className="tile"><div className="k">Records processed</div><div className="v">{p.recordsProcessed}</div><div className="h">{p.recordsFailed} failed</div></div>
        <div className={`tile ${q.openErrors ? "warn" : ""}`}><div className="k">Open queues</div><div className="v">{q.openErrors + q.openConflicts + q.openDuplicates}</div><div className="h">{q.openErrors} err · {q.openConflicts} conflict · {q.openDuplicates} dup</div></div>
      </div>
      <div className="notice" style={{ marginTop: 12 }}>
        Credential encryption key: <b>{d.encryptionKey === "env" ? "configured (secure)" : "dev fallback — set INTEGRATION_ENC_KEY in production"}</b> · {t.credentials} stored credential(s) · {t.recordLinks} external record link(s).
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Connector</th><th>Status</th><th>Health</th><th>Last success</th></tr></thead>
        <tbody>
          {d.connectors.map((c: any) => (
            <tr key={c.id}>
              <td>{c.name}<div className="muted" style={{ fontSize: 11 }}>{c.key}</div></td>
              <td><span className={`badge ${c.status === "connected" ? "active" : c.status === "error" ? "suspended" : "trial"}`}>{c.status}</span></td>
              <td className="muted">{c.errorStatus}</td>
              <td className="muted" style={{ fontSize: 12 }}>{c.lastSuccessAt ? new Date(c.lastSuccessAt).toLocaleString() : "—"}</td>
            </tr>
          ))}
          {d.connectors.length === 0 && <tr><td colSpan={4} className="muted">No connectors yet — add one from the Marketplace.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = { available: "active", beta: "trial", coming_soon: "trial", custom: "trial", unavailable: "suspended" };

function Marketplace({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");
  const load = useCallback(async () => {
    const url = api(schoolId, `/catalog?q=${encodeURIComponent(q)}${cat ? `&category=${cat}` : ""}`);
    setData(await fetch(url).then((r) => r.json()));
  }, [schoolId, q, cat]);
  useEffect(() => { load(); }, [load]);
  if (!data) return <div className="panel"><p className="muted">Loading…</p></div>;
  return (
    <div className="panel">
      <div className="row">
        <div style={{ flex: 1 }}><input placeholder="Search connectors…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">All categories</option>{Object.entries(data.categoryLabels).map(([k, v]: any) => <option key={k} value={k}>{v}</option>)}</select></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 10, marginTop: 12 }}>
        {data.connectors.map((c: any) => (
          <div key={c.key} className="card" style={{ margin: 0 }}>
            <div className="row"><div><span style={{ fontSize: 20 }}>{c.icon}</span> <b>{c.name}</b></div><span className={`badge ${STATUS_BADGE[c.status]}`}>{data.statusLabels[c.status]}</span></div>
            <div className="muted" style={{ fontSize: 12, margin: "4px 0" }}>{data.categoryLabels[c.category]} · {c.provider}</div>
            <div style={{ fontSize: 13 }}>{c.description}</div>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>Auth: {c.authMethod} · {c.supportedOperations.join(", ")} · setup: {c.setupComplexity}</div>
            {c.requiresProviderCredentials && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>🔑 requires provider credentials</div>}
          </div>
        ))}
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Provider-specific systems marked “Custom Configuration Required” are configurable shells — supply your authorised API credentials and field mapping to activate. We never connect to a provider you haven’t authorised.</p>
    </div>
  );
}

// End-to-end: paste CSV/JSON → get AI mapping suggestions → import with provenance.
function ImportRunner({ schoolId }: { schoolId: string }) {
  const [raw, setRaw] = useState("reference,first,last,dob\nS-1001,Ella,Blake,12/04/2016\nS-1002,Max,Blake,03/09/2018");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [recs, setRecs] = useState<any[]>([]);
  const [result, setResult] = useState<any>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function headers(): string[] {
    if (format === "csv") return (raw.split(/\r?\n/)[0] || "").split(",").map((h) => h.trim()).filter(Boolean);
    try { const a = JSON.parse(raw); return a[0] ? Object.keys(a[0]) : []; } catch { return []; }
  }
  function samples(h: string): string[] {
    if (format === "csv") { const lines = raw.split(/\r?\n/).slice(1, 6); const idx = headers().indexOf(h); return lines.map((l) => l.split(",")[idx] || "").filter(Boolean); }
    try { return (JSON.parse(raw) as any[]).slice(0, 5).map((o) => String(o[h] ?? "")); } catch { return []; }
  }

  async function suggest() {
    setMsg(null);
    const fields = headers().map((h) => ({ name: h, samples: samples(h) }));
    const d = await fetch(api(schoolId, "/mappings/suggest"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ objectFilter: "student", fields }) }).then((r) => r.json());
    setRecs((d.recommendations || []).map((r: any) => ({ externalField: r.externalField, internalField: r.suggestion?.internalField || "", confidence: r.suggestion?.confidence ?? 0, uncertain: r.uncertain })));
  }
  async function runImport() {
    setMsg(null); setResult(null);
    const mapping = recs.filter((r) => r.internalField).map((r) => ({ externalField: r.externalField, internalField: r.internalField, transforms: r.internalField === "student.dateOfBirth" ? [{ type: "date" }] : undefined }));
    const body = { connectorKey: "csv-import", sourceSystem: "Manual import", format, raw, targetObject: "student", mapping };
    const res = await fetch(api(schoolId, "/import"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg(d.error || "Import failed"); return; }
    setResult(d);
  }

  return (
    <div className="panel">
      <h2 style={{ fontSize: 15 }}>Manual import — preview, AI-map, validate, import</h2>
      <div className="row"><div><label>Format</label><select value={format} onChange={(e) => setFormat(e.target.value as any)}><option value="csv">CSV</option><option value="json">JSON</option></select></div></div>
      <textarea rows={6} value={raw} onChange={(e) => setRaw(e.target.value)} style={{ width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }} />
      <div style={{ marginTop: 8 }}><button className="secondary" onClick={suggest}>Suggest mappings (AI)</button>{" "}<button onClick={runImport} disabled={recs.length === 0}>Validate &amp; import</button></div>
      {msg && <div className="notice err" style={{ marginTop: 10 }}>{msg}</div>}
      {recs.length > 0 && (
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>External field</th><th>→ SchoolHub field</th><th>Confidence</th></tr></thead>
          <tbody>
            {recs.map((r, i) => (
              <tr key={i}>
                <td>{r.externalField}</td>
                <td><input value={r.internalField} onChange={(e) => setRecs(recs.map((x, j) => j === i ? { ...x, internalField: e.target.value } : x))} /></td>
                <td>{r.internalField ? <span className={`badge ${r.uncertain ? "trial" : "active"}`}>{Math.round((r.confidence || 0) * 100)}%{r.uncertain ? " · review" : ""}</span> : <span className="badge suspended">unmapped</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {result && (
        <div className={`notice ${result.status === "success" ? "ok" : result.status === "failed" ? "err" : "info"}`} style={{ marginTop: 12 }}>
          Import {result.status}: {result.created} created, {result.updated} updated, {result.failed} errored (of {result.total}). Validation: {result.validation.passed} passed / {result.validation.warnings} warning / {result.validation.failed} failed. Failed rows are in the Errors queue with provenance recorded.
        </div>
      )}
    </div>
  );
}

function Errors({ schoolId }: { schoolId: string }) {
  const [errors, setErrors] = useState<any[]>([]);
  const load = useCallback(async () => setErrors((await fetch(api(schoolId, "/errors")).then((r) => r.json())).errors || []), [schoolId]);
  useEffect(() => { load(); }, [load]);
  async function act(errorId: string, action: string) {
    await fetch(api(schoolId, "/errors"), { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ errorId, action }) });
    load();
  }
  return (
    <div className="panel">
      <h2 style={{ fontSize: 15 }}>Integration errors</h2>
      <table>
        <thead><tr><th>When</th><th>Category</th><th>Message</th><th>Record</th><th>Status</th><th></th></tr></thead>
        <tbody>
          {errors.map((e) => (
            <tr key={e.id}>
              <td className="mono muted" style={{ fontSize: 11 }}>{new Date(e.createdAt).toLocaleString()}</td>
              <td><span className="badge trial">{e.category}</span></td>
              <td style={{ fontSize: 12 }}>{e.message}<div className="muted">{e.suggestedAction}</div></td>
              <td className="muted">{e.externalRecordId || "—"}</td>
              <td><span className={`badge ${e.status === "resolved" ? "active" : e.status === "ignored" ? "trial" : "suspended"}`}>{e.status}</span></td>
              <td className="right">{["open", "assigned"].includes(e.status) && <><button className="small secondary" onClick={() => act(e.id, "ignore")}>Ignore</button>{" "}<button className="small" onClick={() => act(e.id, "resolve")}>Resolve</button></>}</td>
            </tr>
          ))}
          {errors.length === 0 && <tr><td colSpan={6} className="muted">No integration errors.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SourceOfTruth({ schoolId }: { schoolId: string }) {
  const [d, setD] = useState<any>(null);
  useEffect(() => { fetch(api(schoolId, "/source-of-truth")).then((r) => r.json()).then(setD); }, [schoolId]);
  if (!d) return <div className="panel"><p className="muted">Loading…</p></div>;
  return (
    <div className="panel">
      <h2 style={{ fontSize: 15 }}>Source of truth</h2>
      <p className="sub">Which system owns each domain. SchoolHub never overwrites externally-owned data unless write-back is enabled, supported, permitted, approved and logged.</p>
      <table>
        <thead><tr><th>Domain</th><th>Owner</th><th>Write-back</th></tr></thead>
        <tbody>
          {d.ownership.map((o: any) => (
            <tr key={o.domain}>
              <td>{o.domain}</td>
              <td><span className="badge active">{o.owner}</span>{o.overridden ? <span className="muted" style={{ fontSize: 11 }}> (override)</span> : null}</td>
              <td>{o.writeBack ? <span className="badge trial">enabled</span> : <span className="muted">off</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12, marginTop: 10 }}>Mapped SchoolHub objects: {d.dataObjects.length}. Edit ownership + write-back in the Integrations tab’s source-of-truth registry.</p>
    </div>
  );
}

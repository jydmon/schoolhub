"use client";

import { useEffect, useState, useCallback } from "react";

const STATUS_BADGE: Record<string, string> = {
  connected: "active", pending: "trial", error: "suspended", disabled: "archived",
};

function Msg({ m }: { m: { kind: string; text: string } | null }) {
  if (!m) return null;
  return <div className={`notice ${m.kind}`}>{m.text}</div>;
}

export default function IntegrationsTab({ schoolId }: { schoolId: string }) {
  const [catalog, setCatalog] = useState<any[]>([]);
  const [methodLabels, setMethodLabels] = useState<Record<string, string>>({});
  const [integrations, setIntegrations] = useState<any[]>([]);
  const [sources, setSources] = useState<any[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showCatalog, setShowCatalog] = useState(false);

  const load = useCallback(async () => {
    const [c, i, s] = await Promise.all([
      fetch(`/api/connectors`).then((r) => r.json()),
      fetch(`/api/schools/${schoolId}/integrations`).then((r) => r.json()),
      fetch(`/api/schools/${schoolId}/sources`).then((r) => r.json()),
    ]);
    setCatalog(c.connectors ?? []);
    setMethodLabels(c.methodLabels ?? {});
    setIntegrations(i.integrations ?? []);
    setSources(s.sources ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const connectedKeys = new Set(integrations.map((i) => i.connectorKey));

  async function connect(key: string) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/integrations`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ connectorKey: key }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Connector added — configure it below." });
    setShowCatalog(false); await load(); setSelected(data.integration.id);
  }
  async function patch(intId: string, body: any) {
    await fetch(`/api/schools/${schoolId}/integrations/${intId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    load();
  }
  async function remove(intId: string) {
    await fetch(`/api/schools/${schoolId}/integrations/${intId}`, { method: "DELETE" });
    if (selected === intId) setSelected(null);
    load();
  }
  async function sync(intId: string, body: any) {
    const res = await fetch(`/api/schools/${schoolId}/integrations/${intId}/sync`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const data = await res.json();
    setMsg(res.ok && !data.error
      ? { kind: data.status === "failed" ? "err" : "ok", text: `Sync ${data.status}: ${data.recordsIn} in, ${data.recordsUpdated} updated, ${data.recordsFailed} failed.${data.message ? " " + data.message : ""}` }
      : { kind: "err", text: data.error || "Sync failed" });
    load();
    return data;
  }

  async function saveSources() {
    await fetch(`/api/schools/${schoolId}/sources`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sources: sources.map((s) => ({ domain: s.domain, sourceLabel: s.sourceLabel, integrationId: s.integration?.id ?? null, writeBack: s.writeBack })) }),
    });
    setMsg({ kind: "ok", text: "Source-of-truth registry saved." });
    load();
  }

  return (
    <>
      <Msg m={msg} />

      {/* Source of truth */}
      <div className="panel">
        <h2>Source of truth</h2>
        <p className="sub">Which system owns each data domain. SchoolHub does not overwrite an integrated domain unless write-back is enabled.</p>
        <table>
          <thead><tr><th>Domain</th><th>Source system</th><th>Via integration</th><th>Write-back</th></tr></thead>
          <tbody>
            {sources.map((s, idx) => (
              <tr key={s.domain}>
                <td><strong>{s.label}</strong></td>
                <td>{s.native ? <span className="muted">SchoolHub (native)</span> : <span className="badge role">{s.sourceLabel}</span>}</td>
                <td>{s.integration?.name || <span className="muted">—</span>}</td>
                <td>
                  <label className="chip" style={{ margin: 0 }}>
                    <input type="checkbox" style={{ width: "auto" }} checked={!!s.writeBack} disabled={s.native}
                      onChange={(e) => { const c = [...sources]; c[idx] = { ...s, writeBack: e.target.checked }; setSources(c); }} />
                    {s.native ? "n/a" : s.writeBack ? "enabled" : "read-only"}
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="secondary" style={{ marginTop: 12 }} onClick={saveSources}>Save registry</button>
      </div>

      {/* Connected integrations */}
      <div className="panel">
        <div className="flex-between">
          <div><h2>Integrations</h2><p className="sub" style={{ marginBottom: 0 }}>{integrations.length} connected</p></div>
          <button onClick={() => setShowCatalog((v) => !v)}>{showCatalog ? "Close catalog" : "Connect a system"}</button>
        </div>

        {showCatalog && (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))" }}>
              {catalog.map((c) => (
                <div className="stat" key={c.key}>
                  <div style={{ fontWeight: 700 }}>{c.name}</div>
                  <div className="muted" style={{ fontSize: 12, minHeight: 32 }}>{c.description}</div>
                  <div className="muted" style={{ fontSize: 11, margin: "6px 0" }}>{c.category} · {c.methods.map((m: string) => methodLabels[m] || m).join(", ")}</div>
                  <button className="small" disabled={connectedKeys.has(c.key)} onClick={() => connect(c.key)}>{connectedKeys.has(c.key) ? "Connected" : "Connect"}</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <table style={{ marginTop: 14 }}>
          <thead><tr><th>System</th><th>Method</th><th>Status</th><th>Last sync</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {integrations.map((i) => (
              <tr key={i.id}>
                <td><strong>{i.name}</strong><div className="muted" style={{ fontSize: 12 }}>{i.category} · {i.domains.map((d: string) => d).join(", ") || "—"}</div>
                  {i.lastError && <div className="muted" style={{ fontSize: 11, color: "var(--danger)" }}>{i.lastError}</div>}</td>
                <td>{methodLabels[i.method] || i.method}</td>
                <td><span className={`badge ${STATUS_BADGE[i.status] || "trial"}`}>{i.status}</span></td>
                <td className="mono muted" style={{ fontSize: 12 }}>{i.lastSyncAt ? new Date(i.lastSyncAt).toLocaleString() : "never"}</td>
                <td className="right">
                  <button className="small secondary" onClick={() => setSelected(selected === i.id ? null : i.id)}>{selected === i.id ? "Hide" : "Open"}</button>{" "}
                  {i.status === "error"
                    ? <button className="small" onClick={() => sync(i.id, {})}>Retry</button>
                    : <button className="small" onClick={() => sync(i.id, {})}>Sync now</button>}{" "}
                  {i.enabled
                    ? <button className="small secondary" onClick={() => patch(i.id, { enabled: false })}>Disable</button>
                    : <button className="small secondary" onClick={() => patch(i.id, { enabled: true })}>Enable</button>}
                </td>
              </tr>
            ))}
            {integrations.length === 0 && <tr><td colSpan={5} className="muted">Nothing connected yet — use “Connect a system”.</td></tr>}
          </tbody>
        </table>
      </div>

      {selected && <IntegrationDetail schoolId={schoolId} intId={selected} onSync={sync} onChange={load} />}
    </>
  );
}

function IntegrationDetail({ schoolId, intId, onSync, onChange }: { schoolId: string; intId: string; onSync: (id: string, body: any) => Promise<any>; onChange: () => void }) {
  const [d, setD] = useState<any>(null);
  const [connector, setConnector] = useState<any>(null);
  const [cfg, setCfg] = useState<any>({});
  const [mappings, setMappings] = useState<any[]>([]);
  const [csvText, setCsvText] = useState("");
  const [importType, setImportType] = useState("students");
  const [note, setNote] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/schools/${schoolId}/integrations/${intId}`).then((r) => r.json());
    setD(res.integration); setConnector(res.connector);
    setCfg(res.integration?.config ?? {});
    setMappings(res.integration?.mappings ?? []);
  }, [schoolId, intId]);
  useEffect(() => { load(); }, [load]);

  if (!d) return <div className="panel">Loading…</div>;
  const isFile = d.method === "csv" || d.method === "manual";

  async function saveConfig() {
    await fetch(`/api/schools/${schoolId}/integrations/${intId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method: d.method, writeBackEnabled: d.writeBackEnabled, config: cfg }),
    });
    setNote({ kind: "ok", text: "Configuration saved." }); load(); onChange();
  }
  async function saveMappings() {
    await fetch(`/api/schools/${schoolId}/integrations/${intId}/mappings`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mappings: mappings.map((m) => ({ domain: m.domain, externalField: m.externalField, internalField: m.internalField, direction: m.direction || "in" })) }),
    });
    setNote({ kind: "ok", text: "Field mappings saved." }); load();
  }
  function setMap(i: number, k: string, v: string) { const c = [...mappings]; c[i] = { ...c[i], [k]: v }; setMappings(c); }
  function addMap() { setMappings([...mappings, { domain: connector?.domains?.[0] || "identity", externalField: "", internalField: "", direction: "in" }]); }
  function rmMap(i: number) { setMappings(mappings.filter((_, idx) => idx !== i)); }

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="panel" style={{ borderColor: "var(--brand)" }}>
      <div className="flex-between">
        <div><h2 style={{ marginBottom: 2 }}>{d.name}</h2><div className="muted">{connector?.description}</div></div>
        <button className="danger small" onClick={() => { if (confirm("Remove this integration?")) { fetch(`/api/schools/${schoolId}/integrations/${intId}`, { method: "DELETE" }).then(onChange); } }}>Remove</button>
      </div>
      <Msg m={note} />

      {/* Connection config */}
      <div className="row" style={{ marginTop: 12 }}>
        <div>
          <label>Method</label>
          <select value={d.method} onChange={(e) => setD({ ...d, method: e.target.value })}>
            {(connector?.methods || [d.method]).map((m: string) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label>Base URL (REST / scheduled)</label>
          <input value={cfg.baseUrl || ""} onChange={(e) => setCfg({ ...cfg, baseUrl: e.target.value })} placeholder="https://api.vendor.example/v1" />
        </div>
        <div>
          <label>Schedule (cron, for scheduled sync)</label>
          <input value={cfg.scheduleCron || ""} onChange={(e) => setCfg({ ...cfg, scheduleCron: e.target.value })} placeholder="0 2 * * *" />
        </div>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!d.writeBackEnabled} onChange={(e) => setD({ ...d, writeBackEnabled: e.target.checked })} /> Write-back enabled</label>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!cfg.simulateError} onChange={(e) => setCfg({ ...cfg, simulateError: e.target.checked })} /> Simulate upstream error (to test retry)</label>
        <button className="small" onClick={saveConfig}>Save configuration</button>
      </div>
      {d.webhookToken && (
        <div className="notice info" style={{ marginTop: 10 }}>
          Webhook endpoint: <span className="mono">{origin}/api/webhooks/{d.webhookToken}</span>
        </div>
      )}

      {/* Field mapping */}
      <h2 style={{ fontSize: 15, marginTop: 20 }}>Field mapping</h2>
      <p className="sub">Map external fields to SchoolHub fields.</p>
      <table>
        <thead><tr><th>Domain</th><th>External field</th><th></th><th>SchoolHub field</th><th>Direction</th><th></th></tr></thead>
        <tbody>
          {mappings.map((m, i) => (
            <tr key={i}>
              <td><input value={m.domain} onChange={(e) => setMap(i, "domain", e.target.value)} /></td>
              <td><input className="mono" value={m.externalField} onChange={(e) => setMap(i, "externalField", e.target.value)} /></td>
              <td className="muted">→</td>
              <td><input className="mono" value={m.internalField} onChange={(e) => setMap(i, "internalField", e.target.value)} /></td>
              <td><select value={m.direction || "in"} onChange={(e) => setMap(i, "direction", e.target.value)}><option>in</option><option>out</option><option>both</option></select></td>
              <td className="right"><button className="danger small" onClick={() => rmMap(i)}>×</button></td>
            </tr>
          ))}
          {mappings.length === 0 && <tr><td colSpan={6} className="muted">No mappings.</td></tr>}
        </tbody>
      </table>
      <div style={{ marginTop: 10 }}>
        <button className="secondary small" onClick={addMap}>Add row</button>{" "}
        <button className="small" onClick={saveMappings}>Save mappings</button>
      </div>

      {/* Run / CSV fallback */}
      <h2 style={{ fontSize: 15, marginTop: 20 }}>Run synchronisation</h2>
      {isFile ? (
        <>
          <div className="row">
            <div><label>Import as</label><select value={importType} onChange={(e) => setImportType(e.target.value)}><option value="students">Students</option><option value="parents">Parents</option><option value="staff">Staff</option><option value="messaging_consent">Messaging consent (SMS/WhatsApp opt-in)</option></select></div>
          </div>
          <label>Paste CSV (CSV fallback integration)</label>
          <textarea rows={5} value={csvText} onChange={(e) => setCsvText(e.target.value)} style={{ width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }} placeholder="reference,firstName,lastName,..." />
          <button style={{ marginTop: 10 }} onClick={async () => { await onSync(intId, { csvText, importType }); load(); }}>Run CSV sync</button>
        </>
      ) : (
        <button onClick={async () => { await onSync(intId, {}); load(); }}>{d.status === "error" ? "Retry sync" : "Sync now"}</button>
      )}

      {/* Sync history / logs */}
      <h2 style={{ fontSize: 15, marginTop: 20 }}>Sync history &amp; logs</h2>
      {(d.runs || []).length === 0 && <p className="muted">No runs yet.</p>}
      {(d.runs || []).map((r: any) => (
        <details key={r.id} style={{ marginBottom: 8 }}>
          <summary>
            <span className={`badge ${r.status === "success" ? "active" : r.status === "failed" ? "suspended" : "trial"}`}>{r.status}</span>{" "}
            <span className="mono muted">{new Date(r.startedAt).toLocaleString()}</span> · {r.trigger} · {r.recordsIn} in / {r.recordsUpdated} updated / {r.recordsFailed} failed
            {r.message ? ` · ${r.message}` : ""}
          </summary>
          <pre className="mono" style={{ background: "#0f172a", color: "#cbd5e1", padding: 12, borderRadius: 8, overflow: "auto", fontSize: 11 }}>{(r.log || []).join("\n")}</pre>
        </details>
      ))}
    </div>
  );
}

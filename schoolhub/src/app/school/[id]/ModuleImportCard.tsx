"use client";

import { useState } from "react";

/**
 * Compact, embeddable CSV importer for a single module type. Drop into any
 * school tab for schools that have no upstream system to integrate — it offers
 * a downloadable template, file upload or paste, validation, and a per-row
 * error report. Reuses the shared /api/schools/[id]/import engine.
 */
export default function ModuleImportCard({
  schoolId, type, title, hint, defaultOpen = false,
}: { schoolId: string; type: string; title?: string; hint?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [csvText, setCsvText] = useState("");
  const [filename, setFilename] = useState("");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFilename(f.name);
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(f);
  }
  async function run() {
    setBusy(true); setResult(null);
    const res = await fetch(`/api/schools/${schoolId}/import`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, csvText, filename: filename || undefined }),
    });
    setResult(await res.json().catch(() => ({ error: "Import failed" }))); setBusy(false);
  }

  return (
    <div className="panel">
      <div className="flex-between" style={{ alignItems: "center" }}>
        <div>
          <h2 style={{ marginBottom: 2 }}>{title || "Import from spreadsheet"}</h2>
          <p className="sub" style={{ marginBottom: 0 }}>{hint || "No existing system? Bulk-add records from a CSV. Rows are validated and duplicates are detected."}</p>
        </div>
        <button type="button" className="secondary small" onClick={() => setOpen((o) => !o)}>{open ? "Hide" : "Import CSV"}</button>
      </div>
      {open && (
        <div style={{ marginTop: 12 }}>
          <div className="row">
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <a href={`/api/schools/${schoolId}/import/template?type=${type}`}><button type="button" className="secondary">Download template</button></a>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <input type="file" accept=".csv,text/csv" onChange={onFile} />
            </div>
          </div>
          <label style={{ marginTop: 12 }}>…or paste CSV content</label>
          <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={6}
            style={{ width: "100%", fontFamily: "ui-monospace,Menlo,monospace", fontSize: 12, padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}
            placeholder="Paste rows matching the template header…" />
          <button style={{ marginTop: 12 }} disabled={!csvText || busy} onClick={run}>{busy ? "Importing…" : "Run import"}</button>
          {result && (
            <div style={{ marginTop: 14 }}>
              <div className={`notice ${result.status === "completed" ? "ok" : result.status === "failed" ? "err" : "info"}`}>
                {result.error ? result.error : `Import ${result.status}: ${result.createdRows} created, ${result.updatedRows} updated, ${result.skippedRows} skipped, ${result.errorRows} errored (of ${result.totalRows} rows).`}
              </div>
              {result.errors?.length > 0 && (
                <table>
                  <thead><tr><th>Row</th><th>Field</th><th>Message</th><th>Type</th></tr></thead>
                  <tbody>
                    {result.errors.map((e: any, i: number) => (
                      <tr key={i}><td>{e.row}</td><td>{e.field || "—"}</td><td>{e.message}</td><td>{e.fatal ? <span className="badge suspended">error</span> : <span className="badge trial">warning</span>}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

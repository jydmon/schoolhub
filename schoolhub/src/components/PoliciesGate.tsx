"use client";

import { useCallback, useEffect, useState } from "react";

// Global policy gate shown in every web portal (item A4/A5/A10). Surfaces
// published policies/documents that the signed-in user must read and accept
// (and flags ones that changed since they last accepted), with a modal to read
// and acknowledge. Fails silent.
export default function PoliciesGate() {
  const [items, setItems] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState<any | null>(null);

  const load = useCallback(async () => {
    try { const d = await fetch("/api/me/trust-acks").then((r) => r.json()); setItems(d.items || []); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function accept(d: any) {
    try { await fetch("/api/me/trust-acks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: d.id }) }); } catch { /* ignore */ }
    setReading(null); load();
  }

  const outstanding = items.filter((d) => d.requireAck && (!d.acknowledged || d.updatedSinceAck));
  if (outstanding.length === 0) return null;

  return (
    <>
      <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "10px 14px", margin: "0 0 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13 }}>📋 You have <strong>{outstanding.length}</strong> {outstanding.length === 1 ? "policy" : "policies"} to review and accept.</span>
        <button onClick={() => setOpen(true)} style={{ marginLeft: "auto", background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>Review now</button>
      </div>

      {open && (
        <div className="modal-overlay" onClick={() => { setOpen(false); setReading(null); }}>
          <div className="modal" style={{ maxWidth: 640, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}>
              <h2 style={{ margin: 0 }}>Policies to accept</h2>
              <button className="secondary small" onClick={() => { setOpen(false); setReading(null); }}>Close</button>
            </div>
            {reading ? (
              <div style={{ marginTop: 10 }}>
                <button className="linklike" onClick={() => setReading(null)}>← Back to list</button>
                <h3 style={{ margin: "8px 0 2px" }}>{reading.title}</h3>
                <div className="muted" style={{ fontSize: 12 }}>v{reading.version}{reading.updatedSinceAck ? " · updated since you last accepted" : ""}</div>
                {reading.linkUrl ? <p><a href={reading.linkUrl} target="_blank" rel="noreferrer" className="linklike">Open the full document ↗</a></p> : null}
                {reading.bodyHtml ? <div style={{ maxHeight: "50vh", overflow: "auto", fontSize: 14, lineHeight: 1.6, margin: "8px 0" }} dangerouslySetInnerHTML={{ __html: reading.bodyHtml }} /> : <p className="muted">{reading.summary || "Please confirm you have read this policy."}</p>}
                <button onClick={() => accept(reading)}>I have read &amp; understood</button>
              </div>
            ) : (
              <div style={{ marginTop: 8 }}>
                {outstanding.map((d) => (
                  <div key={d.id} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "10px 0", gap: 12 }}>
                    <div><strong>{d.title}</strong>{d.updatedSinceAck ? <span className="badge suspended" style={{ marginLeft: 6 }}>updated</span> : null}<div className="muted" style={{ fontSize: 12 }}>{d.summary || d.category}</div></div>
                    <button className="secondary small" onClick={() => setReading(d)}>Read &amp; accept</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

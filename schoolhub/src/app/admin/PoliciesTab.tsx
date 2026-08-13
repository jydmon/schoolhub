"use client";

import { useEffect, useState, useCallback } from "react";

// Item A1/A2/A3 — the Policies section is now driven by the DMS (Documents &
// Trust). Authoring/creation lives there; this tab is a read view of published
// policy documents with a 3-dot menu (no Create form). Legacy `Policy` data is
// left untouched in the database.

const STATUS_BADGE: Record<string, string> = { draft: "trial", review: "role", approved: "active", published: "active", archived: "archived" };

async function api(url: string, method = "GET", body?: any) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

function Kebab({ items }: { items: ({ label: string; onClick: () => void; danger?: boolean } | null)[] }) {
  const [open, setOpen] = useState(false);
  const list = items.filter(Boolean) as { label: string; onClick: () => void; danger?: boolean }[];
  return (
    <span className="kebab-wrap">
      <button className="kebab-btn" aria-label="Actions" onClick={() => setOpen((o) => !o)}>⋯</button>
      {open && (<>
        <div className="kebab-backdrop" onClick={() => setOpen(false)} />
        <div className="kebab-menu">{list.map((it, i) => <button key={i} className={it.danger ? "danger" : ""} onClick={() => { setOpen(false); it.onClick(); }}>{it.label}</button>)}</div>
      </>)}
    </span>
  );
}

export default function PoliciesTab({ onOpenDms }: { onOpenDms?: () => void }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [msg, setMsg] = useState<string>("");
  const [acks, setAcks] = useState<{ title: string; rows: any[] } | null>(null);

  const load = useCallback(async () => {
    try { const d = await api(`/api/platform/trust`); setDocs((d.documents || []).filter((x: any) => x.category === "policy")); }
    catch (e: any) { setMsg(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function viewAcks(doc: any) {
    try { const d = await api(`/api/platform/trust/acks?documentId=${doc.id}`); setAcks({ title: doc.title, rows: d.acks || [] }); }
    catch (e: any) { setMsg(e.message); }
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>Policies</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Policies are authored in <strong>Documents &amp; Trust</strong>. Publish a document with the category <em>Policy</em> and it appears here and in every user&apos;s Policies section, with read-and-accept tracking.</p></div>
          {onOpenDms && <button onClick={onOpenDms}>Open Documents &amp; Trust</button>}
        </div>
        {msg && <div className="notice err" style={{ marginTop: 10 }}>{msg}</div>}
        <table style={{ marginTop: 12 }}>
          <thead><tr><th>Policy</th><th>Status</th><th>Destinations</th><th>Ver.</th><th>Accepted</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {docs.map((d) => (
              <tr key={d.id}>
                <td><strong>{d.title}</strong>{d.reviewDue ? <span className="badge suspended" style={{ marginLeft: 6 }}>review due</span> : null}{d.summary ? <div className="muted" style={{ fontSize: 11 }}>{d.summary}</div> : null}</td>
                <td><span className={`badge ${STATUS_BADGE[d.status] || "role"}`}>{d.status}</span></td>
                <td style={{ fontSize: 11 }}>{[d.publicTrust && "Public", d.toAll && "All users", d.toParents && "Parents", d.toMobile && "Mobile", d.requireAck && "Ack"].filter(Boolean).join(" · ") || <span className="muted">—</span>}</td>
                <td>{d.version}</td>
                <td>{d.ackCount || 0}</td>
                <td className="right"><Kebab items={[
                  onOpenDms ? { label: "Open in Documents & Trust", onClick: onOpenDms } : null,
                  { label: "View acceptances", onClick: () => viewAcks(d) },
                  d.publicTrust && d.status === "published" ? { label: "View public page", onClick: () => window.open(`/trust`, "_blank") } : null,
                ]} /></td>
              </tr>
            ))}
            {docs.length === 0 && <tr><td colSpan={6} className="muted">No policy documents yet — create one in Documents &amp; Trust (category “Policy”).</td></tr>}
          </tbody>
        </table>
      </div>

      {acks && (
        <div className="modal-overlay" onClick={() => setAcks(null)}>
          <div className="modal" style={{ maxWidth: 640, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between"><h2 style={{ margin: 0 }}>Acceptances — {acks.title}</h2><button className="secondary small" onClick={() => setAcks(null)}>Close</button></div>
            <p className="sub">{acks.rows.length} acceptance(s).</p>
            <table><thead><tr><th>When</th><th>User</th><th>Ver.</th></tr></thead>
              <tbody>
                {acks.rows.map((a) => <tr key={a.id}><td className="mono muted" style={{ fontSize: 12 }}>{new Date(a.ackedAt).toLocaleString()}</td><td>{a.userName || a.userEmail}<div className="muted" style={{ fontSize: 11 }}>{a.userEmail}</div></td><td>{a.version}</td></tr>)}
                {acks.rows.length === 0 && <tr><td colSpan={3} className="muted">No acceptances recorded yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

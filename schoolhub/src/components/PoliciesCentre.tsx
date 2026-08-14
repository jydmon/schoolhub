"use client";

import { useCallback, useEffect, useState } from "react";

// Policies page available to every signed-in user. Lists the policies/documents
// published to them with full tracking: Read / Unread and Accepted / Unaccepted,
// version and date metadata, New / Updated flags, a read-and-accept flow, and a
// PDF download. Backed by /api/me/trust-acks (+ /pdf).

const d = (v: any) => (v ? new Date(v).toLocaleDateString("en-GB") : "—");
const RECENT_DAYS = 14;
function isRecent(v: any) { if (!v) return false; const t = new Date(v).getTime(); return Number.isFinite(t) && (Date.now() - t) < RECENT_DAYS * 86400000; }

type Filter = "all" | "unread" | "read" | "unaccepted" | "accepted";
const FILTERS: [Filter, string][] = [["all", "All"], ["unread", "Unread"], ["read", "Read"], ["unaccepted", "To accept"], ["accepted", "Accepted"]];

export default function PoliciesCentre() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [reading, setReading] = useState<any | null>(null);
  const [msg, setMsg] = useState<string>("");

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch("/api/me/trust-acks").then((x) => x.json()); setItems(r.items || []); }
    catch { setItems([]); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function open(p: any) {
    setReading(p);
    // Record a read receipt (fire-and-forget) then refresh status.
    try { await fetch("/api/me/trust-acks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: p.id, action: "read" }) }); load(); } catch { /* ignore */ }
  }
  async function accept(p: any) {
    try { await fetch("/api/me/trust-acks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: p.id }) }); setMsg(`You accepted “${p.title}”.`); } catch { /* ignore */ }
    setReading(null); load();
  }

  const flag = (p: any): { label: string; tone: string } | null =>
    p.updatedSinceAck ? { label: "Updated", tone: "suspended" }
    : (!p.read && isRecent(p.publishedAt)) ? { label: "New", tone: "trial" }
    : null;

  const rows = items.filter((p) => {
    if (filter === "unread" && p.read) return false;
    if (filter === "read" && !p.read) return false;
    if (filter === "unaccepted" && !(p.requireAck && !p.acknowledged)) return false;
    if (filter === "accepted" && !p.acknowledged) return false;
    const s = q.trim().toLowerCase();
    if (s && ![p.title, p.category, p.summary].some((v) => String(v ?? "").toLowerCase().includes(s))) return false;
    return true;
  });
  const counts = {
    unread: items.filter((p) => !p.read).length,
    unaccepted: items.filter((p) => p.requireAck && !p.acknowledged).length,
  };

  // ---- Reader ----
  if (reading) {
    const p = reading;
    return (
      <div className="panel">
        <button className="secondary small" onClick={() => setReading(null)}>← Back to policies</button>
        <div className="flex-between" style={{ alignItems: "flex-start", marginTop: 10 }}>
          <div><h2 style={{ margin: 0 }}>{p.title}</h2>
            <div className="muted" style={{ fontSize: 12 }}>{p.category} · v{p.version} · published {d(p.publishedAt)} · updated {d(p.updatedAt)}{p.effectiveDate ? ` · effective ${d(p.effectiveDate)}` : ""}</div>
          </div>
          <a href={`/api/me/trust-acks/${p.id}/pdf`}><button className="secondary small">Download PDF</button></a>
        </div>
        {p.updatedSinceAck ? <div className="notice info" style={{ marginTop: 10 }}>This policy has changed since you last accepted it. Please review and accept the current version.</div> : null}
        {p.linkUrl ? <p style={{ marginTop: 10 }}><a href={p.linkUrl} target="_blank" rel="noreferrer" className="linklike">Open the full document ↗</a></p> : null}
        {p.bodyHtml ? <div style={{ marginTop: 10, fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: p.bodyHtml }} /> : <p className="muted" style={{ marginTop: 10 }}>{p.summary || "Please confirm you have read this policy."}</p>}
        {p.requireAck ? (
          p.acknowledged
            ? <div className="notice ok" style={{ marginTop: 12 }}>You accepted this version on {d(p.ackedAt)}.</div>
            : <button style={{ marginTop: 12 }} onClick={() => accept(p)}>I have read &amp; understood</button>
        ) : <div className="muted" style={{ marginTop: 12, fontSize: 12 }}>Acknowledgement isn&apos;t required for this policy.</div>}
      </div>
    );
  }

  return (
    <div className="panel">
      <div className="flex-between" style={{ alignItems: "flex-start" }}>
        <div><h2 style={{ margin: 0 }}>Policies</h2>
          <p className="sub" style={{ marginBottom: 0 }}>Every policy published to you, with your read and acceptance status. Newly published or updated policies are flagged. Download any policy as a PDF.</p></div>
      </div>
      {msg && <div className="notice ok" style={{ marginTop: 10 }}>{msg}</div>}
      {(counts.unaccepted > 0 || counts.unread > 0) && (
        <div className="notice info" style={{ marginTop: 10 }}>
          {counts.unaccepted > 0 ? <><strong>{counts.unaccepted}</strong> to accept. </> : null}
          {counts.unread > 0 ? <><strong>{counts.unread}</strong> unread.</> : null}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", margin: "12px 0" }}>
        <div className="tabs">
          {FILTERS.map(([k, l]) => <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{l}{k === "unaccepted" && counts.unaccepted ? ` (${counts.unaccepted})` : ""}</button>)}
        </div>
        <input placeholder="Search policies…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220, marginLeft: "auto" }} />
      </div>
      <table>
        <thead><tr><th>Policy</th><th>Version</th><th>Published</th><th>Updated</th><th>Status</th><th className="right">Actions</th></tr></thead>
        <tbody>
          {rows.map((p) => { const fl = flag(p); return (
            <tr key={p.id}>
              <td><button className="linklike" onClick={() => open(p)} style={{ textAlign: "left" }}><strong>{p.title}</strong></button>{fl ? <span className={`badge ${fl.tone}`} style={{ marginLeft: 6 }}>{fl.label}</span> : null}<div className="muted" style={{ fontSize: 11 }}>{p.category}{p.summary ? ` · ${p.summary}` : ""}</div></td>
              <td>v{p.version}</td>
              <td className="mono muted" style={{ fontSize: 12 }}>{d(p.publishedAt)}</td>
              <td className="mono muted" style={{ fontSize: 12 }}>{d(p.updatedAt)}</td>
              <td>
                {p.acknowledged ? <span className="badge active">Accepted</span>
                  : p.requireAck ? <span className="badge suspended">To accept</span>
                  : p.read ? <span className="badge role">Read</span>
                  : <span className="badge trial">Unread</span>}
              </td>
              <td className="right" style={{ whiteSpace: "nowrap" }}>
                <button className="secondary small" onClick={() => open(p)}>{p.requireAck && !p.acknowledged ? "Read & accept" : "Read"}</button>{" "}
                <a href={`/api/me/trust-acks/${p.id}/pdf`}><button className="secondary small">PDF</button></a>
              </td>
            </tr>
          ); })}
          {rows.length === 0 && <tr><td colSpan={6} className="muted">{loading ? "Loading…" : items.length ? "No policies match this filter." : "No policies published to you yet."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

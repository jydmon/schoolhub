"use client";

import { useEffect, useState, useCallback } from "react";

// Parent-facing Trust & policies — platform documents published to parents,
// with a required-acknowledgement flow where the school/SaaS demands it.

const CAT_ICON: Record<string, string> = { policy: "📋", security: "🔒", privacy: "🕵️", compliance: "✅", terms: "📜", certification: "🏅", subprocessor: "🔗", other: "📄" };

export default function ParentTrust() {
  const [items, setItems] = useState<any[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    try { const d = await fetch(`/api/me/trust-acks`).then((r) => r.json()); setItems(d.items || []); }
    catch { setItems([]); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function ack(d: any) {
    setMsg(null);
    const res = await fetch(`/api/me/trust-acks`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId: d.id }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || j.error) { setMsg({ kind: "err", text: j.error || "Couldn't record acknowledgement" }); return; }
    setMsg({ kind: "ok", text: `Thanks — “${d.title}” acknowledged.` }); load();
  }

  if (items === null) return <div className="panel">Loading…</div>;
  const outstanding = items.filter((d) => d.requireAck && !d.acknowledged);

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Trust &amp; policies</h2>
        <p className="sub">Important documents from your school platform — privacy, security, terms and policies. Where an acknowledgement is required, please review and confirm.</p>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 8 }}>{msg.text}</div>}
        {outstanding.length > 0 && <div className="notice info" style={{ marginTop: 8 }}>{outstanding.length} document{outstanding.length === 1 ? "" : "s"} need{outstanding.length === 1 ? "s" : ""} your acknowledgement.</div>}
      </div>

      {items.length === 0 ? (
        <div className="panel"><p className="muted">No documents to show right now.</p></div>
      ) : items.map((d) => {
        const isOpen = open === d.id;
        return (
          <div className="panel" key={d.id}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}>
              <div>
                <button className="linklike" onClick={() => setOpen(isOpen ? null : d.id)}><strong style={{ fontSize: 15 }}>{CAT_ICON[d.category] || "📄"} {d.title}</strong></button>
                {d.summary ? <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{d.summary}</div> : null}
                <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>v{d.version}{d.effectiveDate ? ` · effective ${new Date(d.effectiveDate).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}` : ""}</div>
              </div>
              <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                {d.requireAck ? (d.acknowledged ? <span className="badge active">acknowledged</span> : <span className="badge suspended">action needed</span>) : <span className="badge role">info</span>}
                {d.acknowledged && d.ackedAt ? <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Accepted {new Date(d.ackedAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}</div> : null}
              </div>
            </div>
            {isOpen && (
              <div style={{ marginTop: 10, borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                {d.linkUrl ? <p><a href={d.linkUrl} target="_blank" rel="noreferrer" className="linklike">Open the full document ↗</a></p> : null}
                {d.bodyHtml ? <div style={{ fontSize: 14, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: d.bodyHtml }} /> : (!d.linkUrl ? <p className="muted">No further detail published.</p> : null)}
              </div>
            )}
            {d.requireAck && !d.acknowledged && (
              <div style={{ marginTop: 10 }}><button onClick={() => ack(d)}>I have read &amp; understood</button></div>
            )}
          </div>
        );
      })}
    </>
  );
}

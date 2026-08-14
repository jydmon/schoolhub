"use client";

import { useEffect, useState } from "react";

// Reusable role-scoped search box. The server endpoint enforces the scope
// (teacher → assigned classes/pupils; driver → assigned routes/passengers), so
// this component is purely presentational and works for any /search endpoint
// that returns { groups: [{ type, label, tab, items:[{title,subtitle,id}] }], total, q }.
export default function ScopedSearch({
  endpoint,
  title = "Search",
  blurb,
  onNavigate,
}: {
  endpoint: string;
  title?: string;
  blurb?: string;
  onNavigate?: (k: string) => void;
}) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes(null); return; }
      setBusy(true);
      try {
        const sep = endpoint.includes("?") ? "&" : "?";
        const d = await fetch(`${endpoint}${sep}q=${encodeURIComponent(q.trim())}`).then((r) => r.json());
        setRes(d);
      } catch { setRes({ groups: [], total: 0, q }); }
      finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q, endpoint]);

  const sep = endpoint.includes("?") ? "&" : "?";
  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>{title}</h2>
      {blurb ? <p className="sub">{blurb}</p> : null}
      <input autoFocus placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 6 }} />
      {busy && <p className="muted" style={{ marginTop: 12 }}>Searching…</p>}
      {res && !busy && res.total === 0 && <p className="muted" style={{ marginTop: 12 }}>No matches for &ldquo;{res.q}&rdquo;.</p>}
      {res && !busy && res.total > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="flex-between" style={{ alignItems: "center" }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{res.total} match(es) across {res.groups.length} section(s).</p>
            <a href={`${endpoint}${sep}q=${encodeURIComponent(q.trim())}&format=csv`}><button type="button" className="secondary small">Download results (CSV)</button></a>
          </div>
          {res.groups.map((g: any) => (
            <div key={g.type} style={{ borderTop: "1px solid var(--line)", paddingTop: 10, marginTop: 10 }}>
              <div className="flex-between"><strong>{g.label} <span className="muted" style={{ fontWeight: 400 }}>({g.items.length})</span></strong>
                {onNavigate && g.tab ? <button className="linklike" style={{ fontSize: 12 }} onClick={() => onNavigate(g.tab)}>Open {g.label} ↗</button> : null}</div>
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

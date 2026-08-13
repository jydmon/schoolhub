"use client";

import { useEffect, useState } from "react";

// Parent search — one box across everything about the parent's own children:
// events, homework, clubs, reports, documents and trust/policies. Results are
// scoped server-side to linked children only, and can be downloaded as CSV.

export default function ParentSearch({ onNavigate }: { onNavigate?: (k: string) => void }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setRes(null); return; }
      setBusy(true);
      try { const d = await fetch(`/api/parent/search?q=${encodeURIComponent(q.trim())}`).then((r) => r.json()); setRes(d); }
      finally { setBusy(false); }
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="panel">
      <h2 style={{ margin: 0 }}>Search</h2>
      <p className="sub">Find anything for your {`children`} — events, homework, clubs, reports, documents and policies. Only your own children&apos;s information is searched.</p>
      <input autoFocus placeholder="Search everything…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginTop: 6 }} />
      {busy && <p className="muted" style={{ marginTop: 12 }}>Searching…</p>}
      {res && !busy && res.total === 0 && <p className="muted" style={{ marginTop: 12 }}>No matches for “{res.q}”.</p>}
      {res && !busy && res.total > 0 && (
        <div style={{ marginTop: 12 }}>
          <div className="flex-between" style={{ alignItems: "center" }}>
            <p className="muted" style={{ fontSize: 12, margin: 0 }}>{res.total} match(es) across {res.groups.length} section(s).</p>
            <a href={`/api/parent/search?q=${encodeURIComponent(q.trim())}&format=csv`}><button type="button" className="secondary small">Download results (CSV)</button></a>
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

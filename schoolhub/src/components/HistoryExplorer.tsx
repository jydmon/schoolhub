"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

// Shared activity-history explorer. Drives both the tenant School-Administrator
// history tab and the platform super-admin audit trail — same search UX, the
// only difference is the endpoint (baseUrl) and whether a Tenant column shows.

type Entry = {
  id: string; action: string; actorEmail: string | null; targetType: string | null; targetId: string | null;
  ip: string | null; metadata: string; createdAt: string; school?: { name: string } | null; schoolId?: string | null;
  impersonatedBy?: string | null; impersonatedByEmail?: string | null;
};

const dt = (v: string) => new Date(v).toLocaleString();

function prettyMeta(raw: string): [string, string][] {
  try {
    const o = JSON.parse(raw || "{}");
    if (!o || typeof o !== "object") return [];
    return Object.entries(o).map(([k, v]) => [k, typeof v === "object" ? JSON.stringify(v) : String(v)]);
  } catch { return raw ? [["", raw]] : []; }
}

export default function HistoryExplorer({ baseUrl, platform, title, subtitle }: { baseUrl: string; platform?: boolean; title?: string; subtitle?: string }) {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [facets, setFacets] = useState<{ actions: string[]; actors: string[] }>({ actions: [], actors: [] });
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const [q, setQ] = useState("");
  const [action, setAction] = useState("");
  const [actor, setActor] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const gotFacets = useRef(false);

  const run = useCallback(async () => {
    setLoading(true);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (action) sp.set("action", action);
    if (actor) sp.set("actor", actor);
    if (from) sp.set("from", from);
    if (to) sp.set("to", to);
    if (gotFacets.current) sp.set("facets", "0");
    const d = await fetch(`${baseUrl}${sp.toString() ? `?${sp.toString()}` : ""}`).then((r) => r.json()).catch(() => ({}));
    setEntries(d.entries ?? []);
    setTruncated(!!d.truncated);
    if (d.facets && !gotFacets.current) { setFacets(d.facets); gotFacets.current = true; }
    setLoading(false);
  }, [baseUrl, q, action, actor, from, to]);

  // debounce free-text; react immediately to structured filters
  useEffect(() => { const t = setTimeout(run, q ? 300 : 0); return () => clearTimeout(t); }, [run, q]);

  const clear = () => { setQ(""); setAction(""); setActor(""); setFrom(""); setTo(""); };
  const hasFilters = q || action || actor || from || to;

  function exportCsv() {
    const cols = ["time", "action", "actor", "target", ...(platform ? ["tenant"] : []), "ip", "metadata"];
    const rows = entries.map((e) => [
      dt(e.createdAt), e.action, e.actorEmail || "system",
      [e.targetType, e.targetId].filter(Boolean).join(" "),
      ...(platform ? [e.school?.name || "platform"] : []),
      e.ip || "", (e.metadata || "").replace(/\s+/g, " "),
    ]);
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [cols, ...rows].map((r) => r.map(esc).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url; a.download = "history.csv"; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className="panel">
      <div className="flex-between">
        <div><h2>{title || "Activity history"}</h2><p className="sub" style={{ marginBottom: 0 }}>{subtitle || "Every recorded action — searchable across module, person, record and details."}</p></div>
        {entries.length > 0 && <button className="secondary small" onClick={exportCsv}>Export CSV</button>}
      </div>

      <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 200 }}><input placeholder="Search action, person, record or details…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <div><select value={action} onChange={(e) => setAction(e.target.value)}><option value="">All actions</option>{facets.actions.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        <div><select value={actor} onChange={(e) => setActor(e.target.value)}><option value="">All people</option>{facets.actors.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
        <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        {hasFilters ? <button className="secondary small" onClick={clear}>Clear</button> : null}
      </div>

      {truncated && <div className="notice info" style={{ marginTop: 12 }}>Showing the most recent {entries.length} matches. Narrow your search with the filters above to see older entries.</div>}

      <table style={{ marginTop: 12 }}>
        <thead><tr><th style={{ width: 150 }}>Time</th><th>Action</th><th>Person</th><th>Record</th>{platform && <th>Tenant</th>}<th className="right"></th></tr></thead>
        <tbody>
          {entries.map((e) => {
            const meta = prettyMeta(e.metadata);
            const isOpen = !!open[e.id];
            return (
              <Fragment key={e.id}>
                <tr>
                  <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{dt(e.createdAt)}</td>
                  <td><span className="badge role">{e.action}</span></td>
                  <td>{e.actorEmail || <span className="muted">system</span>}{e.impersonatedByEmail ? <span className="badge" title={`Performed via support access by ${e.impersonatedByEmail}`} style={{ marginLeft: 6, background: "#fff4e5", color: "#9a5b00", fontSize: 10.5 }}>via support</span> : null}</td>
                  <td>{e.targetType ? <span>{e.targetType}{e.targetId ? <span className="muted mono" style={{ fontSize: 11 }}> · {e.targetId.slice(0, 10)}</span> : null}</span> : <span className="muted">—</span>}</td>
                  {platform && <td>{e.school?.name || <span className="muted">platform</span>}</td>}
                  <td className="right">{(meta.length > 0 || e.ip || e.impersonatedByEmail) && <button className="linklike" style={{ fontSize: 12 }} onClick={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}>{isOpen ? "Hide" : "Details"}</button>}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={platform ? 6 : 5} style={{ background: "#fafbfe" }}>
                      <div style={{ fontSize: 12.5, padding: "2px 2px 6px" }}>
                        {e.impersonatedByEmail && <div><strong>Support access</strong> · <span>performed while impersonating <span className="mono">{e.actorEmail || "user"}</span> by admin <span className="mono">{e.impersonatedByEmail}</span></span></div>}
                        {e.ip && <div><strong>IP</strong> · <span className="mono">{e.ip}</span></div>}
                        {meta.length === 0 ? (!e.ip && !e.impersonatedByEmail ? <div className="muted">No further detail recorded.</div> : null) : meta.map(([k, v], i) => <div key={i}><strong>{k || "detail"}</strong> · <span className="mono" style={{ wordBreak: "break-word" }}>{v}</span></div>)}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {entries.length === 0 && <tr><td colSpan={platform ? 6 : 5} className="muted">{loading ? "Searching…" : "No matching activity."}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

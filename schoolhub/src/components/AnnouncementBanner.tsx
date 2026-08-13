"use client";

import { useCallback, useEffect, useState } from "react";

const PRI: Record<string, { bg: string; fg: string; label: string }> = {
  critical: { bg: "#fdeaea", fg: "#b91c1c", label: "Critical" },
  high: { bg: "#fef3c7", fg: "#b45309", label: "High" },
  normal: { bg: "#e0e7ff", fg: "#4338ca", label: "Normal" },
  low: { bg: "#eef2f7", fg: "#64748b", label: "Low" },
};
const fmt = (d?: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export default function AnnouncementBanner() {
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => { fetch("/api/me/notices").then((r) => r.json()).then(setData).catch(() => {}); }, []);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (action: string, id?: string) => {
    await fetch("/api/me/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) });
    load();
  }, [load]);

  if (!data) return null;
  const banner = data.banner && !data.banner.dismissed ? data.banner : null;
  const p = banner ? PRI[banner.priority] || PRI.normal : PRI.normal;

  return (
    <>
      {banner && (
        <div style={{ background: p.bg, border: `1px solid ${p.fg}22`, borderRadius: 12, padding: "12px 14px", marginBottom: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
          <span style={{ background: p.fg, color: "#fff", fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, whiteSpace: "nowrap" }}>{p.label}</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, color: "#0f172a" }}>{banner.title}</div>
            <div style={{ fontSize: 13, color: "#334155", marginTop: 2 }}>{banner.body}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>
              {banner.scope === "global" ? "Platform announcement" : "School announcement"}
              {banner.authorName ? ` · ${banner.authorName}` : ""} · {fmt(banner.publishedAt)}
              {data.unread > 1 ? ` · ${data.unread} unread in centre` : ""}
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
              {!banner.read && <button className="linklike" onClick={() => act("read", banner.id)} style={linkBtn(p.fg)}>Mark read</button>}
              <button className="linklike" onClick={() => setOpen(true)} style={linkBtn(p.fg)}>View all</button>
            </div>
          </div>
          <button onClick={() => act("dismiss", banner.id)} aria-label="Dismiss" title="Dismiss (stays unread in centre)" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: p.fg, lineHeight: 1 }}>×</button>
        </div>
      )}

      {!banner && data.unread > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button className="linklike" onClick={() => setOpen(true)} style={linkBtn("#4F46E5")}>📣 {data.unread} unread announcement{data.unread === 1 ? "" : "s"} — open centre</button>
        </div>
      )}

      {open && <Centre data={data} onClose={() => setOpen(false)} act={act} reload={load} />}
    </>
  );
}

function linkBtn(color: string): React.CSSProperties {
  return { background: "none", border: "none", color, cursor: "pointer", padding: 0, fontSize: 13, fontWeight: 700, textDecoration: "underline" };
}

function Centre({ data, onClose, act, reload }: any) {
  const items: any[] = data.items || [];
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(15,23,41,0.5)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 640, padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0 }}>Announcement Centre</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#64748b" }}>×</button>
        </div>
        {data.canAuthor && <Composer data={data} reload={reload} />}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "6px 0" }}>
          <span className="muted" style={{ fontSize: 13 }}>{items.length} announcement{items.length === 1 ? "" : "s"} · {items.filter((i) => !i.read).length} unread</span>
          {items.some((i) => !i.read) && <button className="linklike" onClick={() => act("read-all")} style={linkBtn("#4F46E5")}>Mark all read</button>}
        </div>
        {items.length === 0 && <p className="muted">No announcements.</p>}
        {items.map((n) => {
          const p = PRI[n.priority] || PRI.normal;
          return (
            <div key={n.id} style={{ border: "1px solid #e9edf4", borderLeft: `4px solid ${p.fg}`, borderRadius: 10, padding: 12, marginBottom: 10, background: n.read ? "#fff" : "#f8faff" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                <strong>{n.title}</strong>
                <span style={{ background: p.bg, color: p.fg, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, height: "fit-content", whiteSpace: "nowrap" }}>{p.label}</span>
              </div>
              <div style={{ fontSize: 13, color: "#334155", marginTop: 4, whiteSpace: "pre-wrap" }}>{n.body}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 6 }}>
                {n.scope === "global" ? "Platform" : "School"}{n.authorName ? ` · ${n.authorName}` : ""} · Published {fmt(n.publishedAt)}
                {n.updatedAt && n.updatedAt !== n.publishedAt ? ` · Updated ${fmt(n.updatedAt)}` : ""}
                {n.expiresAt ? ` · Expires ${fmt(n.expiresAt)}` : ""}
              </div>
              {!n.read && <button className="linklike" onClick={() => act("read", n.id)} style={{ ...linkBtn("#4F46E5"), marginTop: 6 }}>Mark read</button>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Composer({ data, reload }: any) {
  const canGlobal = !!data.isPlatformAdmin;
  const schools: string[] = data.authorSchools || [];
  const [f, setF] = useState<any>({ scope: canGlobal ? "global" : "school", schoolId: schools[0] || "", title: "", body: "", priority: "normal", expiresAt: "" });
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function publish() {
    setBusy(true); setMsg("");
    const res = await fetch("/api/admin/notices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...f, expiresAt: f.expiresAt || null }) });
    const d = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok || d.error) { setMsg(d.error || "Failed"); return; }
    setF({ ...f, title: "", body: "" }); setMsg("Published."); reload();
  }

  return (
    <details style={{ border: "1px solid #e9edf4", borderRadius: 10, padding: 12, marginBottom: 12 }}>
      <summary style={{ cursor: "pointer", fontWeight: 700 }}>＋ New announcement</summary>
      <div style={{ marginTop: 10 }}>
        <div className="row">
          <div>
            <label>Scope</label>
            <select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>
              {canGlobal && <option value="global">Global (all schools)</option>}
              <option value="school">School</option>
            </select>
          </div>
          {f.scope === "school" && schools.length > 0 && (
            <div><label>School</label><select value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })}>{schools.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          )}
          <div><label>Priority</label><select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="critical">Critical</option></select></div>
          <div><label>Expiry (optional)</label><input type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} /></div>
        </div>
        <label style={{ marginTop: 8 }}>Title</label>
        <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <label style={{ marginTop: 8 }}>Description</label>
        <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={3} />
        {msg && <div className={`notice ${msg === "Published." ? "ok" : "err"}`}>{msg}</div>}
        <button style={{ marginTop: 10 }} disabled={busy || !f.title || !f.body} onClick={publish}>{busy ? "Publishing…" : "Publish"}</button>
      </div>
    </details>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useSort, SortTh, useSel, Kebab } from "@/components/TableKit";

// School-administrator policy compliance monitoring: who has read / accepted the
// policies published to the school's users, with reporting, reminders (single and
// bulk) and CSV export. Backed by /api/schools/[id]/policy-compliance.

const pct = (n: number) => `${n}%`;
const tone = (r: number) => (r >= 95 ? "active" : r >= 75 ? "trial" : "suspended");

export default function PolicyComplianceTab({ schoolId }: { schoolId: string }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"policy" | "user">("policy");
  const [q, setQ] = useState("");
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const sel = useSel();
  const psort = useSort("title");
  const usort = useSort("outstanding", -1);

  const load = useCallback(async () => {
    setLoading(true);
    try { const d = await fetch(`/api/schools/${schoolId}/policy-compliance`).then((r) => r.json()); setData(d && !d.error ? d : { policies: [], users: [], totals: {} }); }
    catch { setData({ policies: [], users: [], totals: {} }); }
    finally { setLoading(false); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function remind(userIds: string[], documentId?: string, label?: string) {
    setMsg(null);
    if (!userIds.length) { setMsg({ k: "err", t: "No outstanding users to remind." }); return; }
    const res = await fetch(`/api/schools/${schoolId}/policy-compliance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds, documentId }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ k: "err", t: d.error || "Couldn't send reminders" }); return; }
    setMsg({ k: "ok", t: `Reminder sent to ${d.reminded} user(s)${label ? ` for ${label}` : ""}.` });
    sel.clear();
  }

  if (loading && !data) return <div className="panel">Loading compliance…</div>;
  const t = data?.totals || {};
  const policies: any[] = data?.policies || [];
  const users: any[] = data?.users || [];

  const pRows = psort.sort(policies, (p, k) => k === "title" ? String(p.title).toLowerCase() : k === "audience" ? p.audienceCount : k === "read" ? p.readRate : k === "accept" ? (p.acceptRate ?? -1) : "");
  const uRowsAll = users.filter((u) => {
    if (onlyOutstanding && u.fullyCompliant) return false;
    const s = q.trim().toLowerCase();
    return !s || [u.name, u.email, u.role].some((v) => String(v ?? "").toLowerCase().includes(s));
  });
  const uRows = usort.sort(uRowsAll, (u, k) => k === "name" ? String(u.name).toLowerCase() : k === "role" ? u.role : k === "read" ? u.read : k === "accepted" ? u.accepted : k === "outstanding" ? (u.unread + u.unaccepted) : "");
  const allOutstandingUserIds = Array.from(new Set(users.filter((u) => !u.fullyCompliant).map((u) => u.userId)));

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>Policy compliance</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Who at your school has read and accepted each published policy. Send reminders to anyone outstanding and export a compliance report.</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            <a href={`/api/schools/${schoolId}/policy-compliance?format=csv`}><button className="secondary">Export CSV</button></a>
            <button onClick={() => remind(allOutstandingUserIds, undefined, "all outstanding policies")} disabled={!allOutstandingUserIds.length}>Remind all outstanding</button>
          </div>
        </div>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 10 }}>{msg.t}</div>}
        <div className="stat-grid" style={{ marginTop: 12 }}>
          <div className="stat"><div className="n">{t.policies ?? 0}</div><div className="l">Policies</div></div>
          <div className="stat"><div className="n">{t.users ?? 0}</div><div className="l">Users in scope</div></div>
          <div className="stat"><div className="n">{t.avgReadRate ?? 100}%</div><div className="l">Avg read rate</div></div>
          <div className="stat"><div className="n">{t.avgAcceptRate ?? 100}%</div><div className="l">Avg acceptance</div></div>
          <div className="stat"><div className="n">{t.usersWithOutstanding ?? 0}</div><div className="l">Users outstanding</div></div>
        </div>
        <div className="tabs" style={{ marginTop: 12 }}>
          <button className={view === "policy" ? "active" : ""} onClick={() => setView("policy")}>By policy</button>
          <button className={view === "user" ? "active" : ""} onClick={() => setView("user")}>By user</button>
        </div>
      </div>

      {view === "policy" && (
        <div className="panel">
          <table>
            <thead><tr><SortTh k="title" label="Policy" sort={psort} /><th>Ack?</th><SortTh k="audience" label="Audience" sort={psort} /><SortTh k="read" label="Read" sort={psort} /><SortTh k="accept" label="Accepted" sort={psort} /><th>Outstanding</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {pRows.map((p) => (
                <tr key={p.id}>
                  <td><strong>{p.title}</strong> <span className="muted" style={{ fontSize: 11 }}>v{p.version}</span><div className="muted" style={{ fontSize: 11 }}>{p.category}</div></td>
                  <td>{p.requireAck ? <span className="badge role">required</span> : <span className="muted">—</span>}</td>
                  <td>{p.audienceCount}</td>
                  <td><span className={`badge ${tone(p.readRate)}`}>{p.readCount}/{p.audienceCount} · {pct(p.readRate)}</span></td>
                  <td>{p.requireAck ? <span className={`badge ${tone(p.acceptRate)}`}>{p.acceptedCount}/{p.audienceCount} · {pct(p.acceptRate)}</span> : <span className="muted">n/a</span>}</td>
                  <td>{(p.requireAck ? p.notAcceptedCount : p.notReadCount) || <span className="muted">0</span>}</td>
                  <td className="right"><Kebab items={[
                    { label: p.requireAck ? "Remind those who haven't accepted" : "Remind those who haven't read", onClick: () => remind(p.outstandingUserIds, p.id, `“${p.title}”`) },
                  ]} /></td>
                </tr>
              ))}
              {pRows.length === 0 && <tr><td colSpan={7} className="muted">{loading ? "Loading…" : "No policies are published to your users yet."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {view === "user" && (
        <div className="panel">
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
            <input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
            <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={onlyOutstanding} onChange={(e) => setOnlyOutstanding(e.target.checked)} /> Only outstanding</label>
            <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{uRows.length} user(s)</span>
          </div>
          {sel.ids.length > 0 && <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="small" onClick={() => remind(sel.ids)}>Send reminder</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>}
          <table>
            <thead><tr>
              <th className="checkbox-cell"><input type="checkbox" checked={uRows.length > 0 && uRows.every((u) => sel.on(u.userId))} onChange={(e) => sel.setMany(uRows.map((u) => u.userId), e.target.checked)} /></th>
              <SortTh k="name" label="User" sort={usort} /><SortTh k="role" label="Role" sort={usort} /><SortTh k="read" label="Read" sort={usort} /><SortTh k="accepted" label="Accepted" sort={usort} /><SortTh k="outstanding" label="Outstanding" sort={usort} /><th className="right">Actions</th>
            </tr></thead>
            <tbody>
              {uRows.map((u) => (
                <tr key={u.userId} style={{ opacity: u.fullyCompliant ? 0.7 : 1 }}>
                  <td className="checkbox-cell"><input type="checkbox" checked={sel.on(u.userId)} onChange={() => sel.toggle(u.userId)} /></td>
                  <td><strong>{u.name}</strong><div className="muted mono" style={{ fontSize: 11 }}>{u.email}</div></td>
                  <td className="muted">{u.role}</td>
                  <td>{u.read}/{u.applicable}</td>
                  <td>{u.toAccept ? `${u.accepted}/${u.toAccept}` : <span className="muted">n/a</span>}</td>
                  <td>{u.fullyCompliant ? <span className="badge active">up to date</span> : <span className="badge suspended">{u.unread + u.unaccepted}</span>}</td>
                  <td className="right"><Kebab items={[
                    !u.fullyCompliant ? { label: "Send reminder", onClick: () => remind([u.userId]) } : null,
                  ]} /></td>
                </tr>
              ))}
              {uRows.length === 0 && <tr><td colSpan={7} className="muted">{loading ? "Loading…" : "No users match."}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

// Global bar shown in every portal:
//  • if the current session is an active support-access impersonation → an amber
//    "support session" bar with End session (for the admin);
//  • otherwise, if the user has pending/active support-access requests → an
//    approve / reject / revoke prompt (for the user).
// Fully self-contained and fails silent (renders nothing on any error).

export default function SupportAccessBar() {
  const [imp, setImp] = useState<any>(null);
  const [mine, setMine] = useState<{ pending: any[]; active: any[] } | null>(null);

  const load = useCallback(async () => {
    try {
      const i = await fetch("/api/me/impersonation").then((r) => r.json());
      if (i?.impersonating) { setImp(i); setMine(null); return; }
      setImp(null);
      const d = await fetch("/api/me/support-access").then((r) => r.json());
      setMine({ pending: d.pending || [], active: d.active || [] });
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);

  async function endImpersonation() {
    try { await fetch("/api/me/impersonation", { method: "DELETE" }); } catch { /* ignore */ }
    window.location.assign("/");
  }
  async function respond(id: string, action: string) {
    try { await fetch("/api/me/support-access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) }); } catch { /* ignore */ }
    load();
  }

  if (imp?.impersonating) {
    const ends = imp.endsAt ? new Date(imp.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
    return (
      <div style={{ background: "#7c2d12", color: "#fff", padding: "8px 14px", borderRadius: 10, margin: "0 0 12px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontWeight: 700 }}>🛟 Support session</span>
        <span style={{ fontSize: 13 }}>You are viewing <strong>{imp.targetName || imp.targetEmail}</strong>&apos;s portal{ends ? ` · ends ${ends}` : ""}. Actions are audited.</span>
        <button onClick={endImpersonation} style={{ marginLeft: "auto", background: "#fff", color: "#7c2d12", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>End session</button>
      </div>
    );
  }

  if (mine && (mine.pending.length || mine.active.length)) {
    return (
      <div style={{ display: "grid", gap: 8, margin: "0 0 12px" }}>
        {mine.pending.map((r) => (
          <div key={r.id} style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>🔐 <strong>{r.requesterName || r.requesterEmail}</strong> is requesting temporary access to your portal ({r.durationMins} min). Reason: {r.reason}</span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button onClick={() => respond(r.id, "approve")} style={{ background: "#4f46e5", color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>Approve</button>
              <button onClick={() => respond(r.id, "reject")} style={{ background: "#fff", color: "#334155", border: "1px solid #cbd5e1", borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>Reject</button>
            </span>
          </div>
        ))}
        {mine.active.map((r) => (
          <div key={r.id} style={{ background: "#fff7ed", border: "1px solid #fdba74", borderRadius: 10, padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 13 }}>🛟 <strong>{r.requesterName || r.requesterEmail}</strong> currently has a support session on your account{r.minutesLeft != null ? ` · ${r.minutesLeft} min left` : ""}.</span>
            <button onClick={() => respond(r.id, "revoke")} style={{ marginLeft: "auto", background: "#dc2626", color: "#fff", border: 0, borderRadius: 8, padding: "6px 12px", fontWeight: 700, cursor: "pointer" }}>Revoke access</button>
          </div>
        ))}
      </div>
    );
  }

  return null;
}

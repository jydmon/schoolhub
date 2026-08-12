"use client";

import { useCallback, useEffect, useState } from "react";
import { TERMS_TITLE, TERMS_BODY } from "@/lib/terms";

type St = { mustChangePassword: boolean; termsAccepted: boolean; tourDismissed: boolean } | null;

const TOUR: { title: string; body: string }[] = [
  { title: "Welcome to SIPlat 👋", body: "A quick tour of the essentials. You can skip this at any time." },
  { title: "Ask AI Assistant", body: "At the top of your Overview, ask questions in plain English across your school's data — pupils, staff, calendar, trips, meals, reports and more." },
  { title: "People & records", body: "Students, Guardians and Staff each have search, filters, sortable columns and bulk actions. Click any name to open the full profile." },
  { title: "Calendar & trips", body: "Events, trips and homework appear on the Calendar in month/week/day/table views. Trips populate automatically." },
  { title: "Reports & search", body: "Generate PDF/CSV reports and use the portal-wide global search to find anything fast. That's it — enjoy!" },
];

export default function Onboarding() {
  const [st, setSt] = useState<St>(null);
  const [loaded, setLoaded] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [tourStarted, setTourStarted] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [tourClosed, setTourClosed] = useState(false); // skipped for this session
  const [pols, setPols] = useState<any[]>([]);
  const [polsClosed, setPolsClosed] = useState(false); // reminder dismissed for this session
  const [viewId, setViewId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try { const d = await fetch("/api/me/onboarding").then((r) => r.json()); if (!d.error) setSt(d); }
    catch { /* ignore */ } finally { setLoaded(true); }
  }, []);
  const loadPolicies = useCallback(async () => {
    try { const d = await fetch("/api/me/policies").then((r) => r.json()); if (!d.error) setPols(d.outstanding ?? []); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { refresh(); loadPolicies(); }, [refresh, loadPolicies]);

  async function acceptPolicy(id: string) {
    setBusy(true);
    try { await fetch("/api/me/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyId: id }) }); await loadPolicies(); setViewId(null); }
    finally { setBusy(false); }
  }

  async function act(action: string, extra: any = {}) {
    setBusy(true); setMsg("");
    try {
      const res = await fetch("/api/me/onboarding", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.error) { setMsg(d.error || "Something went wrong"); return false; }
      return true;
    } finally { setBusy(false); }
  }
  async function changePassword() {
    if (newPw.length < 8) { setMsg("Password must be at least 8 characters."); return; }
    if (newPw !== confirmPw) { setMsg("Passwords don't match."); return; }
    if (await act("change_password", { newPassword: newPw })) { setNewPw(""); setConfirmPw(""); refresh(); }
  }
  async function acceptTerms() { if (await act("accept_terms")) refresh(); }
  async function dismissTour() { await act("dismiss_tour"); setSt((s) => (s ? { ...s, tourDismissed: true } : s)); }

  if (!loaded || !st) return null;

  // 1) Forced temporary-password change (highest priority, blocking).
  if (st.mustChangePassword) {
    return (
      <Overlay>
        <h2 style={{ margin: 0 }}>Set your password</h2>
        <p className="sub">You signed in with a temporary password. Please choose a new password to continue.</p>
        {msg && <div className="notice err">{msg}</div>}
        <label>New password</label>
        <input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} autoFocus />
        <label>Confirm new password</label>
        <input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && changePassword()} />
        <button style={{ marginTop: 14 }} disabled={busy} onClick={changePassword}>{busy ? "Saving…" : "Save password"}</button>
      </Overlay>
    );
  }

  // 2) Terms acceptance (blocking).
  if (!st.termsAccepted) {
    return (
      <Overlay wide>
        <h2 style={{ margin: 0 }}>{TERMS_TITLE}</h2>
        <p className="sub">Please review and accept to continue. Your acceptance is recorded with your name, the version, and the date &amp; time.</p>
        {msg && <div className="notice err">{msg}</div>}
        <div style={{ maxHeight: "48vh", overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 14, whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.55 }}>{TERMS_BODY}</div>
        <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
          <button disabled={busy} onClick={acceptTerms}>{busy ? "Recording…" : "I accept the terms"}</button>
        </div>
      </Overlay>
    );
  }

  // 3) Outstanding mandatory policies — reminder at every login until accepted.
  if (pols.length > 0 && !polsClosed) {
    const viewing = pols.find((p) => p.id === viewId);
    return (
      <Overlay wide onClose={() => setPolsClosed(true)}>
        <div className="flex-between"><h2 style={{ margin: 0 }}>Policy acknowledgements</h2><span className="badge suspended">{pols.length} outstanding</span></div>
        <p className="sub">You must review and accept the following mandatory {pols.length === 1 ? "policy" : "policies"} published for you.</p>

        {!viewing ? (
          <div>
            {pols.map((p) => (
              <div key={p.id} className="flex-between" style={{ padding: "10px 0", borderTop: "1px solid var(--line)", gap: 10 }}>
                <div><strong>{p.title}</strong> <span className="badge role">{p.category}</span><div className="muted" style={{ fontSize: 12 }}>Version {p.version}{p.effectiveDate ? ` · effective ${new Date(p.effectiveDate).toLocaleDateString("en-GB")}` : ""}</div></div>
                <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button className="secondary small" onClick={() => setViewId(p.id)}>View policy</button>
                  <button className="small" disabled={busy} onClick={() => acceptPolicy(p.id)}>Accept</button>
                </span>
              </div>
            ))}
            <div className="notice err" style={{ marginTop: 14 }}>You have not completed the required policy acknowledgements. These policies must be reviewed and accepted. This reminder will continue to appear at each login until all mandatory policies have been completed.</div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "flex-end" }}><button className="secondary" onClick={() => setPolsClosed(true)}>Close reminder</button></div>
          </div>
        ) : (
          <div>
            <div className="flex-between"><h3 style={{ margin: "6px 0" }}>{viewing.title}</h3><a className="linklike" style={{ fontSize: 12 }} href={`/api/me/policies/${viewing.id}/pdf`} target="_blank" rel="noreferrer">Download PDF ↗</a></div>
            <div className="muted" style={{ fontSize: 12 }}>Version {viewing.version} · {viewing.category}</div>
            {viewing.fileUrl && <p style={{ marginTop: 8 }}><a className="linklike" href={viewing.fileUrl} target="_blank" rel="noreferrer">📎 Open the uploaded policy document</a></p>}
            <div style={{ maxHeight: "42vh", overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 14, whiteSpace: "pre-wrap", fontSize: 13.5, lineHeight: 1.55, marginTop: 8 }}>{viewing.summary ? `${viewing.summary}\n\n` : ""}{viewing.body || (viewing.fileUrl ? "See the attached document above." : "No content provided.")}</div>
            <div style={{ marginTop: 12, display: "flex", justifyContent: "space-between" }}>
              <button className="secondary" onClick={() => setViewId(null)}>Back</button>
              <button disabled={busy} onClick={() => acceptPolicy(viewing.id)}>{busy ? "Recording…" : "Accept this policy"}</button>
            </div>
          </div>
        )}
      </Overlay>
    );
  }

  // 4) Guided tour (optional, dismissible).
  if (!st.tourDismissed && !tourClosed) {
    if (!tourStarted) {
      return (
        <Overlay onClose={() => setTourClosed(true)}>
          <h2 style={{ margin: 0 }}>Take a quick tour?</h2>
          <p className="sub">A 5-step walkthrough of the main features. Takes under a minute.</p>
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => { setTourStarted(true); setTourStep(0); }}>Start tour</button>
            <button className="secondary" onClick={() => setTourClosed(true)}>Skip for now</button>
            <button className="secondary" onClick={dismissTour}>Don&apos;t show again</button>
          </div>
        </Overlay>
      );
    }
    const s = TOUR[tourStep];
    const last = tourStep === TOUR.length - 1;
    return (
      <Overlay onClose={() => setTourClosed(true)}>
        <div className="flex-between"><h2 style={{ margin: 0 }}>{s.title}</h2><span className="muted" style={{ fontSize: 12 }}>{tourStep + 1} / {TOUR.length}</span></div>
        <p style={{ marginTop: 8 }}>{s.body}</p>
        <div style={{ marginTop: 14, display: "flex", gap: 8, justifyContent: "space-between" }}>
          <button className="secondary small" onClick={dismissTour}>Don&apos;t show again</button>
          <span style={{ display: "flex", gap: 8 }}>
            {tourStep > 0 && <button className="secondary" onClick={() => setTourStep((n) => n - 1)}>Back</button>}
            {last ? <button onClick={dismissTour}>Finish</button> : <button onClick={() => setTourStep((n) => n + 1)}>Next</button>}
          </span>
        </div>
      </Overlay>
    );
  }

  return null;
}

function Overlay({ children, wide, onClose }: { children: React.ReactNode; wide?: boolean; onClose?: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose ? onClose : undefined} style={{ zIndex: 60 }}>
      <div className="modal" style={{ maxWidth: wide ? 720 : 460, width: "94%" }} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

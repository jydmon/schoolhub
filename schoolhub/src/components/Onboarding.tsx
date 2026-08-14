"use client";

import { useCallback, useEffect, useState } from "react";
import { TERMS_TITLE, TERMS_BODY } from "@/lib/terms";
import { downscaleToDataUrl } from "@/components/image";

type St = { mustChangePassword: boolean; termsAccepted: boolean; tourDismissed: boolean; needsProfile?: boolean; profileSchoolId?: string | null; profile?: any; activation?: any } | null;

const PROFILE_REQUIRED = ["name", "contactEmail", "contactPhone", "contactName", "addressLine1", "addressLine2", "city", "county", "postcode", "country", "headTeacher", "headTeacherEmail", "headTeacherPhone"];

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
  const [prof, setProf] = useState<any>(null); // school-profile working copy
  const [invFile, setInvFile] = useState<any>(null); // invoice / proof of payment
  const [invNote, setInvNote] = useState("");

  // Seed the profile form from the loaded state when the step becomes relevant.
  useEffect(() => {
    if (st?.needsProfile && !prof) {
      const p = st.profile || {};
      setProf({ name: p.name || "", contactEmail: p.contactEmail || "", contactPhone: p.contactPhone || "", contactName: p.contactName || "", addressLine1: p.addressLine1 || "", addressLine2: p.addressLine2 || "", city: p.city || "", county: p.county || "", postcode: p.postcode || "", country: p.country || "United Kingdom", headTeacher: p.headTeacher || "", headTeacherEmail: p.headTeacherEmail || "", headTeacherPhone: p.headTeacherPhone || "", logoUrl: p.logoUrl || "" });
    }
  }, [st, prof]);

  async function saveProfile() {
    if (!prof || !st?.profileSchoolId) return;
    const missing = PROFILE_REQUIRED.filter((k) => !String(prof[k] ?? "").trim());
    if (missing.length) { setMsg("Please complete all required fields."); return; }
    if (await act("save_profile", { schoolId: st.profileSchoolId, profile: prof })) { setProf(null); refresh(); }
  }
  const pf = (k: string, v: string) => setProf((s: any) => ({ ...s, [k]: v }));

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
  async function pickInvoice(file: File) {
    setMsg("");
    try {
      if (file.type.startsWith("image/")) { setInvFile({ name: file.name, type: file.type, dataUrl: await downscaleToDataUrl(file, 1600, 0.8) }); }
      else { const url = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = rej; r.readAsDataURL(file); }); setInvFile({ name: file.name, type: file.type || "application/octet-stream", dataUrl: url }); }
    } catch { setMsg("Couldn't read that file."); }
  }
  async function submitPayment() {
    if (!invFile || !st?.activation?.schoolId) { setMsg("Please attach your invoice or proof of payment."); return; }
    if (await act("submit_payment", { schoolId: st.activation.schoolId, file: invFile, note: invNote.trim() || undefined })) { setInvFile(null); setInvNote(""); refresh(); }
  }

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

  // 2b) Mandatory school-profile setup (School Administrators, blocking).
  if (st.needsProfile && prof) {
    const req = (k: string) => (String(prof[k] ?? "").trim() ? {} : { borderColor: "#e11d48" });
    return (
      <Overlay wide>
        <h2 style={{ margin: 0 }}>Complete your school profile</h2>
        <p className="sub">Before you can use the platform, please complete your school&apos;s profile. All fields are required except the logo.</p>
        {msg && <div className="notice err">{msg}</div>}
        <div style={{ maxHeight: "58vh", overflow: "auto", paddingRight: 4 }}>
          <h3 style={{ marginBottom: 6 }}>School information</h3>
          <div className="row">
            <div style={{ flex: 2 }}><label>School name</label><input value={prof.name} onChange={(e) => pf("name", e.target.value)} style={req("name")} /></div>
            <div><label>School email address</label><input value={prof.contactEmail} onChange={(e) => pf("contactEmail", e.target.value)} style={req("contactEmail")} /></div>
          </div>
          <div className="row">
            <div><label>School contact number</label><input value={prof.contactPhone} onChange={(e) => pf("contactPhone", e.target.value)} style={req("contactPhone")} /></div>
            <div><label>Main contact person</label><input value={prof.contactName} onChange={(e) => pf("contactName", e.target.value)} style={req("contactName")} /></div>
          </div>

          <h3 style={{ margin: "12px 0 6px" }}>School address</h3>
          <div className="row">
            <div><label>Building number / name</label><input value={prof.addressLine1} onChange={(e) => pf("addressLine1", e.target.value)} style={req("addressLine1")} /></div>
            <div><label>Street name</label><input value={prof.addressLine2} onChange={(e) => pf("addressLine2", e.target.value)} style={req("addressLine2")} /></div>
            <div><label>Town / City</label><input value={prof.city} onChange={(e) => pf("city", e.target.value)} style={req("city")} /></div>
          </div>
          <div className="row">
            <div><label>County / State</label><input value={prof.county} onChange={(e) => pf("county", e.target.value)} style={req("county")} /></div>
            <div><label>Postcode / ZIP</label><input value={prof.postcode} onChange={(e) => pf("postcode", e.target.value)} style={req("postcode")} /></div>
            <div><label>Country</label><input value={prof.country} onChange={(e) => pf("country", e.target.value)} style={req("country")} /></div>
          </div>

          <h3 style={{ margin: "12px 0 6px" }}>Head teacher</h3>
          <div className="row">
            <div><label>Full name</label><input value={prof.headTeacher} onChange={(e) => pf("headTeacher", e.target.value)} style={req("headTeacher")} /></div>
            <div><label>Email address</label><input value={prof.headTeacherEmail} onChange={(e) => pf("headTeacherEmail", e.target.value)} style={req("headTeacherEmail")} /></div>
            <div><label>Contact number</label><input value={prof.headTeacherPhone} onChange={(e) => pf("headTeacherPhone", e.target.value)} style={req("headTeacherPhone")} /></div>
          </div>

          <h3 style={{ margin: "12px 0 6px" }}>Branding <span className="muted" style={{ fontSize: 12, fontWeight: 400 }}>(optional — you can add this later)</span></h3>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: 10, border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", background: "#fff" }}>
              {prof.logoUrl ? <img src={prof.logoUrl} alt="" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : <span className="muted" style={{ fontSize: 11 }}>No logo</span>}
            </div>
            <input type="file" accept="image/*" onChange={async (e) => { const file = e.target.files?.[0]; if (file) pf("logoUrl", await downscaleToDataUrl(file, 240, 0.9)); }} />
            {prof.logoUrl ? <button className="secondary small" onClick={() => pf("logoUrl", "")}>Remove</button> : null}
          </div>
        </div>
        <div style={{ marginTop: 14, display: "flex", justifyContent: "flex-end" }}>
          <button disabled={busy} onClick={saveProfile}>{busy ? "Saving…" : "Save & continue"}</button>
        </div>
      </Overlay>
    );
  }

  // 2c) Account activation gate (blocking) — TENANT ADMINISTRATOR ONLY. After
  // Terms + profile, the school administrator uploads an invoice / proof of
  // payment, then waits for an Account Manager / Super Admin to activate the
  // account. Other users are NOT gated here — they proceed to policies and the
  // tour (they only ever see Terms, policies and the tour).
  if (st.activation && st.activation.status !== "activated" && st.activation.isAdmin) {
    const a = st.activation;
    const canUpload = !a.paymentSubmitted || a.paymentStatus === "rejected";
    if (canUpload) {
      return (
        <Overlay wide>
          <h2 style={{ margin: 0 }}>Upload your invoice or proof of payment</h2>
          <p className="sub">Your Terms and school profile are complete. To activate your account, upload your invoice or proof of payment. An Account Manager will review it and activate your account.</p>
          {a.paymentStatus === "rejected" && <div className="notice err">Your previous submission wasn&apos;t approved. Please re-upload your invoice or proof of payment.</div>}
          {msg && <div className="notice err">{msg}</div>}
          <label>Invoice / proof of payment (PDF or image)</label>
          <input type="file" accept="image/*,.pdf" onChange={(e) => { const f = e.target.files?.[0]; if (f) pickInvoice(f); }} />
          {invFile && <div className="notice ok" style={{ marginTop: 8 }}>📎 {invFile.name} — ready to submit</div>}
          <label style={{ marginTop: 10 }}>Note (optional)</label>
          <input value={invNote} onChange={(e) => setInvNote(e.target.value)} placeholder="e.g. payment reference or PO number" />
          <button style={{ marginTop: 14 }} disabled={busy || !invFile} onClick={submitPayment}>{busy ? "Submitting…" : "Submit for review"}</button>
        </Overlay>
      );
    }
    return (
      <Overlay>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h2 style={{ margin: "6px 0" }}>Account Pending Activation</h2>
          <p className="sub">Thank you — your invoice has been submitted. Your account is pending activation by an Account Manager. You&apos;ll receive an email as soon as it&apos;s active.</p>
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

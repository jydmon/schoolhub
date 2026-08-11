"use client";

import { useEffect, useState, useCallback } from "react";

export function ParentNotifications() {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const load = useCallback(async () => { const d = await fetch(`/api/parent/notifications`).then((r) => r.json()); setItems(d.notifications ?? []); setUnread(d.unread ?? 0); }, []);
  useEffect(() => { load(); }, [load]);
  async function markRead() { await fetch(`/api/parent/notifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) }); load(); }
  return (
    <div className="panel">
      <div className="flex-between"><h2>Notifications {unread > 0 && <span className="badge suspended">{unread}</span>}</h2>
        <div><button className="secondary small" onClick={() => setOpen((v) => !v)}>{open ? "Hide" : "Show"}</button> {unread > 0 && <button className="secondary small" onClick={markRead}>Mark all read</button>}</div></div>
      {open && (items.length ? items.map((n) => (
        <div key={n.id} style={{ borderTop: "1px solid var(--line)", padding: "8px 0", opacity: n.read ? 0.6 : 1 }}>
          <strong>{n.title}</strong>{n.body ? ` — ${n.body}` : ""}<div className="mono muted" style={{ fontSize: 11 }}>{new Date(n.createdAt).toLocaleString()}</div>
        </div>
      )) : <p className="muted">No notifications.</p>)}
    </div>
  );
}

export function ParentTransport({ children }: { children: { id: string; name: string }[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [req, setReq] = useState({ studentId: "", type: "cancel", session: "day", note: "" });
  const load = useCallback(async () => setItems((await fetch(`/api/parent/transport`).then((r) => r.json())).items ?? []), []);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (!req.studentId) { setMsg({ kind: "err", text: "Choose a child." }); return; }
    const today = new Date().toISOString().slice(0, 10);
    const payload = req.type === "note" ? { note: req.note } : {};
    const res = await fetch(`/api/parent/transport/request`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: req.studentId, date: today, session: req.session, type: req.type, payload }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: d.requiresApproval ? "Submitted — this is a late change and needs school approval." : "Submitted." });
    setReq({ ...req, note: "" });
  }

  return (
    <div className="panel">
      <h2>Transport</h2>
      <p className="sub">Live status for your child's bus. You only ever see your own child's journey.</p>
      {items.length === 0 && <p className="muted">No transport scheduled today.</p>}
      {items.map((it, i) => (
        <div key={i} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
          <div className="flex-between">
            <div><strong>{it.childName}</strong> <span className="muted">· {it.session === "am" ? "Morning" : "Afternoon"} · {it.routeName}</span>
              <div className="muted" style={{ fontSize: 13 }}>{it.approxLocation}{it.eta ? ` · ETA ${new Date(it.eta).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}{it.delayMinutes ? ` · +${it.delayMinutes} min` : ""}</div></div>
            <span className={`badge ${it.status === "completed" ? "active" : it.status === "cancelled" ? "suspended" : "trial"}`}>{it.childStatus || it.status}</span>
          </div>
        </div>
      ))}
      <h2 style={{ fontSize: 15, marginTop: 16 }}>Request a change (today)</h2>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <div className="row">
        <div><label>Child</label><select value={req.studentId} onChange={(e) => setReq({ ...req, studentId: e.target.value })}><option value="">—</option>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <div><label>Type</label><select value={req.type} onChange={(e) => setReq({ ...req, type: e.target.value })}><option value="cancel">Cancel transport</option><option value="absence">Report absence</option><option value="temp_address">Temporary address</option><option value="change_collector">Change collector</option><option value="note">Note to driver</option></select></div>
        <div><label>Session</label><select value={req.session} onChange={(e) => setReq({ ...req, session: e.target.value })}><option value="day">Whole day</option><option value="am">Morning</option><option value="pm">Afternoon</option></select></div>
      </div>
      {req.type === "note" && <><label>Note</label><input value={req.note} onChange={(e) => setReq({ ...req, note: e.target.value })} /></>}
      <button style={{ marginTop: 12 }} onClick={submit}>Submit request</button>
    </div>
  );
}

export function ParentTrips() {
  const [trips, setTrips] = useState<any[]>([]);
  const load = useCallback(async () => setTrips((await fetch(`/api/parent/trips`).then((r) => r.json())).trips ?? []), []);
  useEffect(() => { load(); }, [load]);
  async function consent(tripId: string, studentId: string, decision: string) {
    await fetch(`/api/parent/trips/consent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId, studentId, decision }) });
    load();
  }
  if (trips.length === 0) return null;
  return (
    <div className="panel">
      <h2>School trips</h2>
      {trips.map((t) => (
        <div key={`${t.tripId}-${t.childStudentId}`} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
          <div className="flex-between">
            <div><strong>{t.title}</strong> <span className="muted">· {t.child} · {t.date}{t.destination ? ` · ${t.destination}` : ""}</span></div>
            <span className={`badge ${t.status === "completed" ? "active" : t.status === "active" ? "trial" : "archived"}`}>{t.status}</span>
          </div>
          {t.consentRequired && (
            <div className="chips" style={{ marginTop: 6 }}>
              <span className="muted" style={{ fontSize: 13 }}>Consent: <strong>{t.consent}</strong></span>
              {t.consent === "pending" && <><button className="small" onClick={() => consent(t.tripId, t.childStudentId, "given")}>Give consent</button> <button className="secondary small" onClick={() => consent(t.tripId, t.childStudentId, "declined")}>Decline</button></>}
            </div>
          )}
          {t.isResidential && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Residential · {t.date} → {t.endDate || "?"}{t.accommodation ? ` · ${t.accommodation}` : ""}{t.latestHeadcount ? ` · latest welfare ${t.latestHeadcount.present}/${t.latestHeadcount.expected}` : ""}</div>}
          {t.days?.length > 0 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Itinerary: {t.days.map((d: any) => `${d.date}${d.title ? ` ${d.title}` : ""}`).join(" · ")}</div>}
          {t.packingList && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Packing: {t.packingList}</div>}
          {t.photos?.length > 0 && <div className="chips" style={{ marginTop: 6 }}>{t.photos.map((p: any, i: number) => <span key={i} className="chip">📷 {p.caption || "Photo"}</span>)}</div>}
          {t.timeline.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {t.timeline.map((u: any, i: number) => <div key={i} className="muted" style={{ fontSize: 12 }}>• {new Date(u.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} — {u.label}{u.note ? `: ${u.note}` : ""}</div>)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function ParentRewards() {
  const [children, setChildren] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [rf, setRf] = useState({ studentId: "", threshold: 20, reward: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    setChildren((await fetch(`/api/parent/rewards`).then((r) => r.json())).children ?? []);
    setRules((await fetch(`/api/parent/home-rules`).then((r) => r.json())).rules ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function addRule() {
    setMsg(null);
    if (!rf.studentId || !rf.reward) { setMsg({ kind: "err", text: "Pick a child and enter a reward." }); return; }
    const res = await fetch(`/api/parent/home-rules`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentId: rf.studentId, threshold: Number(rf.threshold), reward: rf.reward }) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setRf({ ...rf, reward: "" }); load();
  }
  async function ruleAction(id: string, body: any) { await fetch(`/api/parent/home-rules/${id}`, { method: body === "delete" ? "DELETE" : "PATCH", headers: { "Content-Type": "application/json" }, body: body === "delete" ? undefined : JSON.stringify(body) }); load(); }

  if (children.length === 0) return null;
  return (
    <div className="panel">
      <h2>Rewards &amp; behaviour</h2>
      <p className="sub">Points and achievements come from your school's behaviour system. Home reward rules are private to your family.</p>
      {children.map((c) => (
        <div key={c.studentId} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
          <div className="flex-between"><strong>{c.name}</strong><span className="muted" style={{ fontSize: 12 }}>{c.restricted ? "behaviour hidden" : c.sources.join(", ")}</span></div>
          {c.restricted ? (
            <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>Behaviour information is hidden for this child per your agreed preferences.</div>
          ) : (<>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center", marginTop: 6 }}>
            <div><span style={{ fontSize: 26, fontWeight: 700 }}>{c.points}</span> <span className="muted">points this term</span></div>
            <div style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 34 }}>{c.trend.map((v: number, i: number) => <span key={i} title={`${v}`} style={{ width: 10, height: Math.max(3, v * 4), background: "var(--brand)", borderRadius: 2, display: "inline-block" }} />)}</div>
          </div>
          {c.milestone && (
            <div style={{ marginTop: 8 }}>
              <div className="muted" style={{ fontSize: 12 }}>Home reward: “{c.milestone.reward}” at {c.milestone.threshold} · {c.milestone.remaining} to go</div>
              <div style={{ background: "#e2e8f0", borderRadius: 999, height: 8, marginTop: 4 }}><div style={{ width: `${Math.round(c.milestone.progress * 100)}%`, background: "var(--ok)", height: 8, borderRadius: 999 }} /></div>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>⭐ Rewards</div>
              {c.recent.filter((r: any) => r.positive).slice(0, 5).map((r: any, i: number) => <div key={i} style={{ fontSize: 13 }}>{r.label}{r.points ? ` +${r.points}` : ""} {r.teacher ? <span className="muted">· {r.teacher}</span> : null}</div>)}
              {c.recent.filter((r: any) => r.positive).length === 0 && <div className="muted" style={{ fontSize: 12 }}>None yet.</div>}
            </div>
            <div>
              <div className="muted" style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>⚠️ Consequences</div>
              {c.recent.filter((r: any) => !r.positive).slice(0, 5).map((r: any, i: number) => <div key={i} style={{ fontSize: 13, color: "var(--danger)" }}>{r.label}{r.points ? ` -${r.points}` : ""} {r.note ? <span className="muted">· {r.note}</span> : null}</div>)}
              {c.recent.filter((r: any) => !r.positive).length === 0 && <div className="muted" style={{ fontSize: 12 }}>None.</div>}
            </div>
          </div>
          <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>◇ Rewards &amp; consequences are logged in your school&apos;s behaviour system and synced via the Integration Hub.</div>
          </>)}
        </div>
      ))}

      <h2 style={{ fontSize: 15, marginTop: 12 }}>Private home reward rules</h2>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <ul style={{ paddingLeft: 18, margin: 0 }}>
        {rules.map((r) => (
          <li key={r.id} style={{ marginBottom: 4 }}>{r.threshold} pts → {r.reward} {r.active ? "" : "(paused)"}
            <button className="secondary small" style={{ marginLeft: 8 }} onClick={() => ruleAction(r.id, { active: !r.active })}>{r.active ? "Pause" : "Resume"}</button>
            <button className="danger small" style={{ marginLeft: 4 }} onClick={() => ruleAction(r.id, "delete")}>Delete</button></li>
        ))}
        {rules.length === 0 && <li className="muted">None yet — these stay private to your family.</li>}
      </ul>
      <div className="row" style={{ marginTop: 8 }}>
        <div><label>Child</label><select value={rf.studentId} onChange={(e) => setRf({ ...rf, studentId: e.target.value })}><option value="">—</option>{children.map((c) => <option key={c.studentId} value={c.studentId}>{c.name}</option>)}</select></div>
        <div><label>Points</label><input type="number" value={rf.threshold} onChange={(e) => setRf({ ...rf, threshold: e.target.value as any })} /></div>
        <div style={{ flex: 2 }}><label>Reward</label><input value={rf.reward} onChange={(e) => setRf({ ...rf, reward: e.target.value })} placeholder="e.g. choose a film" /></div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={addRule}>Add rule</button></div>
      </div>
    </div>
  );
}

export function ParentPreferences() {
  const [p, setP] = useState<any>(null);
  const [saved, setSaved] = useState(false);
  const load = useCallback(async () => setP((await fetch(`/api/parent/preferences`).then((r) => r.json())).prefs), []);
  useEffect(() => { load(); }, [load]);
  if (!p) return null;
  async function save() {
    await fetch(`/api/parent/preferences`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channels: p.channels, digest: p.digest, quietStart: p.quietStart, quietEnd: p.quietEnd, preferredLanguage: p.preferredLanguage, rewardPrefs: p.rewardPrefs }) });
    setSaved(true); setTimeout(() => setSaved(false), 1500);
  }
  const setCh = (k: string, v: boolean) => setP({ ...p, channels: { ...p.channels, [k]: v } });
  const setRp = (k: string, v: boolean) => setP({ ...p, rewardPrefs: { ...p.rewardPrefs, [k]: v } });
  return (
    <div className="panel">
      <h2>Notification preferences</h2>
      <p className="sub">Choose channels, digest frequency and quiet hours. Safety-critical alerts always come through.</p>
      {saved && <div className="notice ok">Saved.</div>}
      <div className="chips">
        <span className="muted" style={{ fontSize: 13 }}>Channels:</span>
        {["inapp", "push", "email", "sms"].map((c) => <label key={c} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!p.channels[c]} onChange={(e) => setCh(c, e.target.checked)} /> {c}</label>)}
      </div>
      <div className="row" style={{ marginTop: 10 }}>
        <div><label>Digest</label><select value={p.digest} onChange={(e) => setP({ ...p, digest: e.target.value })}><option value="immediate">Immediate</option><option value="daily">Daily summary</option><option value="weekly">Weekly digest</option></select></div>
        <div><label>Quiet from</label><input value={p.quietStart || ""} onChange={(e) => setP({ ...p, quietStart: e.target.value })} placeholder="21:00" /></div>
        <div><label>Quiet to</label><input value={p.quietEnd || ""} onChange={(e) => setP({ ...p, quietEnd: e.target.value })} placeholder="07:00" /></div>
        <div><label>Language</label><select value={p.preferredLanguage} onChange={(e) => setP({ ...p, preferredLanguage: e.target.value })}><option value="en">English</option><option value="fr">Français</option><option value="es">Español</option><option value="pl">Polski</option><option value="ur">اردو</option></select></div>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        <span className="muted" style={{ fontSize: 13 }}>Reward alerts:</span>
        {[["immediatePositive", "Immediate positive"], ["dailySummary", "Daily summary"], ["weeklySummary", "Weekly summary"], ["incident", "Behaviour incident"], ["detention", "Detention"], ["milestone", "Milestone"]].map(([k, l]) => <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={!!p.rewardPrefs[k]} onChange={(e) => setRp(k, e.target.checked)} /> {l}</label>)}
      </div>
      <button style={{ marginTop: 12 }} onClick={save}>Save preferences</button>
    </div>
  );
}

/* ---- School reports (Phase 15) — released reports for a parent's children ---- */
function renderVal(v: any): any {
  if (v == null) return "—";
  if (Array.isArray(v)) return v.map((x, i) => <div key={i}>{typeof x === "object" ? JSON.stringify(x) : String(x)}</div>);
  if (typeof v === "object") return Object.entries(v).map(([k, x]: any) => <div key={k}><strong>{k}:</strong> {typeof x === "object" ? JSON.stringify(x) : String(x)}</div>);
  return String(v);
}
export function ParentReports() {
  const [reports, setReports] = useState<any[]>([]);
  const [open, setOpen] = useState<any | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const d = await fetch(`/api/parent/reports`).then((r) => r.json()); if (d.error) throw new Error(d.error); setReports(d.reports ?? []); }
    catch (e: any) { setErr(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function view(id: string) {
    setErr(null);
    try { const d = await fetch(`/api/parent/reports/${id}`).then((r) => r.json()); if (d.error) throw new Error(d.error); setOpen(d.report); load(); }
    catch (e: any) { setErr(e.message); }
  }
  const nm = (s: any) => (s ? `${s.preferredName || s.firstName} ${s.lastName || ""}`.trim() : "");
  return (
    <div className="panel">
      <h2>School reports</h2>
      <p className="sub">Your children&apos;s released reports. Opening a report is recorded for the school.</p>
      {err && <div className="notice err">{err}</div>}
      {open ? (
        <div>
          <button className="secondary small" onClick={() => setOpen(null)}>← Back to list</button>
          <h3 style={{ marginTop: 12 }}>{open.title} <span className="muted">· {nm(open.student)}</span></h3>
          <div className="mono muted">{open.term || open.type}</div>
          {open.summary && <p style={{ marginTop: 8 }}>{open.summary}</p>}
          {open.body && typeof open.body === "object" && Object.keys(open.body).length > 0 && (
            <div style={{ marginTop: 8 }}>
              {Object.entries(open.body).map(([k, v]: any) => (
                <div key={k} style={{ borderTop: "1px solid var(--line)", padding: "8px 0" }}>
                  <strong style={{ textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</strong>
                  <div className="muted">{renderVal(v)}</div>
                </div>
              ))}
            </div>
          )}
          {open.fileUrl && <p style={{ marginTop: 10 }}><a href={open.fileUrl} target="_blank" rel="noreferrer">Download attached report file</a></p>}
        </div>
      ) : (
        <table>
          <thead><tr><th>Child</th><th>Report</th><th>Term</th><th>Released</th><th className="right"></th></tr></thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{nm(r.student)}</td>
                <td><strong>{r.title}</strong>{!r.viewed && <span className="badge suspended" style={{ marginLeft: 6 }}>new</span>}</td>
                <td className="muted">{r.term || r.type}</td>
                <td className="mono muted">{r.releasedAt ? new Date(r.releasedAt).toLocaleDateString() : "—"}</td>
                <td className="right"><button className="small" onClick={() => view(r.id)}>View</button></td>
              </tr>
            ))}
            {reports.length === 0 && <tr><td colSpan={5} className="muted">No reports available yet.</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

/* ---- Messaging & contact consent (SMS / WhatsApp) ---- */
export function ParentMessaging() {
  const [s, setS] = useState<any>(null);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => { const d = await fetch(`/api/parent/messaging`).then((r) => r.json()); setS(d); }, []);
  useEffect(() => { load(); }, [load]);
  async function setChannel(channel: string, optIn: boolean) {
    setMsg(null);
    const body: any = { channel, optIn };
    if (phone) body.phone = phone;
    const res = await fetch(`/api/parent/messaging`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Saved." }); setPhone(""); load();
  }
  if (!s) return <div className="panel"><h2>Messaging &amp; contact</h2><p className="muted">Loading…</p></div>;
  return (
    <div className="panel">
      <h2>Messaging &amp; contact preferences</h2>
      <p className="sub">Choose how the school may contact you. WhatsApp needs your explicit opt-in; SMS is on unless you opt out.</p>
      {msg && <div className={`notice ${msg.kind === "ok" ? "ok" : "err"}`}>{msg.text}</div>}
      <p>Mobile on file: <strong>{s.phone || "none"}</strong></p>
      {!s.hasPhone && (
        <div style={{ marginBottom: 10 }}>
          <label>Mobile number (E.164, e.g. +447700900123)</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44…" />
        </div>
      )}
      <div style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
        <strong>SMS</strong> — {s.sms?.optedOut ? <span className="muted">opted out</span> : <span className="badge active">receiving</span>}
        <div style={{ marginTop: 6 }}>{s.sms?.optedOut ? <button className="small" onClick={() => setChannel("sms", true)}>Turn SMS on</button> : <button className="danger small" onClick={() => setChannel("sms", false)}>Opt out of SMS</button>}</div>
      </div>
      <div style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
        <strong>WhatsApp</strong> — {s.whatsapp?.optedIn ? <span className="badge active">opted in</span> : <span className="muted">not opted in</span>}
        <div style={{ marginTop: 6 }}>{s.whatsapp?.optedIn ? <button className="danger small" onClick={() => setChannel("whatsapp", false)}>Opt out of WhatsApp</button> : <button className="small" onClick={() => setChannel("whatsapp", true)}>Opt in to WhatsApp</button>}</div>
      </div>
    </div>
  );
}

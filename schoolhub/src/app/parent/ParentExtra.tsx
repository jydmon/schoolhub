"use client";

import { useEffect, useState, useCallback } from "react";

// ---- Notifications Centre: badge, type filters, detail view, deep-links ----
const NOTIF_CATS: { key: string; label: string; icon: string; page: string | null; test: (kind: string) => boolean }[] = [
  { key: "transport", label: "Transport", icon: "🚌", page: "transport", test: (k) => /transport|bus|journey|pickup|collect|drop/.test(k) },
  { key: "trips", label: "Trips", icon: "🧳", page: "trips", test: (k) => /trip|excursion|residential|visit/.test(k) },
  { key: "reports", label: "Reports", icon: "📄", page: "reports", test: (k) => /report/.test(k) },
  { key: "behaviour", label: "Behaviour", icon: "⭐", page: "rewards", test: (k) => /reward|behaviou?r|point|merit|conduct|detention|consequence|achievement/.test(k) },
  { key: "homework", label: "Homework", icon: "📚", page: "children", test: (k) => /homework|assignment|task/.test(k) },
  { key: "policies", label: "Policies", icon: "📋", page: "profile", test: (k) => /policy|consent|acknowledge/.test(k) },
  { key: "events", label: "Events", icon: "📅", page: "calendar", test: (k) => /event|calendar|assembly|parents.?evening|photo|sports/.test(k) },
  // Announcements open their own detail (the modal already shows the full text) —
  // they must NOT deep-link to another page. Tested before "messages" so an
  // announcement/newsletter/broadcast never falls through to the Messages page.
  { key: "announcements", label: "Announcements", icon: "📣", page: null, test: (k) => /announce|newsletter|broadcast|bulletin|notice/.test(k) },
  // Real secure messages live on the "dm" page (nav key), NOT "messaging"
  // (which is Contact preferences).
  { key: "messages", label: "Messages", icon: "✉️", page: "dm", test: (k) => /message|chat|conversation|reply|dm\b/.test(k) },
];
function notifCat(n: any) {
  const k = String(n.kind || "").toLowerCase();
  if (n.journeyId) return NOTIF_CATS[0];
  if (n.tripId) return NOTIF_CATS[1];
  for (const c of NOTIF_CATS) if (c.test(k)) return c;
  return { key: "other", label: "Other", icon: "🔔", page: null as string | null, test: () => false };
}

export function ParentNotifications({ onNavigate }: { onNavigate?: (k: string) => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState("all");
  const [detail, setDetail] = useState<any | null>(null);
  const load = useCallback(async () => { const d = await fetch(`/api/parent/notifications`).then((r) => r.json()); setItems(d.notifications ?? []); setUnread(d.unread ?? 0); }, []);
  useEffect(() => { load(); }, [load]);

  async function mark(ids?: string[]) {
    await fetch(`/api/parent/notifications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ids ? { ids } : {}) });
    load();
  }
  function openDetail(n: any) { setDetail(n); if (!n.read) mark([n.id]); }
  function goTo(n: any) { const c = notifCat(n); if (!n.read) mark([n.id]); setDetail(null); if (c.page && onNavigate) onNavigate(c.page); }

  // Which category chips to show — only those present, plus counts.
  const counts: Record<string, number> = {};
  for (const n of items) { const c = notifCat(n); counts[c.key] = (counts[c.key] || 0) + 1; }
  const presentCats = NOTIF_CATS.filter((c) => counts[c.key]).concat(counts["other"] ? [{ key: "other", label: "Other", icon: "🔔", page: null, test: () => false }] : []);

  const shown = items.filter((n) => filter === "all" || (filter === "unread" ? !n.read : notifCat(n).key === filter));

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "center" }}>
          <div><h2 style={{ margin: 0 }}>Notifications {unread > 0 && <span className="badge" style={{ background: "#dc2626", color: "#fff", marginLeft: 4 }}>{unread}</span>}</h2>
            <p className="sub" style={{ marginBottom: 0, marginTop: 4 }}>Everything the school has sent you. Tap an item to read it and jump to the related page.</p></div>
          {unread > 0 && <button className="secondary small" onClick={() => mark()}>Mark all read</button>}
        </div>
        <div className="chips" style={{ marginTop: 12 }}>
          <button className={filter === "all" ? "" : "secondary"} onClick={() => setFilter("all")}>All ({items.length})</button>
          <button className={filter === "unread" ? "" : "secondary"} onClick={() => setFilter("unread")}>Unread ({unread})</button>
          {presentCats.map((c) => (
            <button key={c.key} className={filter === c.key ? "" : "secondary"} onClick={() => setFilter(c.key)}>{c.icon} {c.label} ({counts[c.key]})</button>
          ))}
        </div>
      </div>

      <div className="panel">
        {shown.length === 0 ? <p className="muted">No notifications{filter !== "all" ? " in this view" : ""}.</p> : shown.map((n) => {
          const c = notifCat(n);
          return (
            <div key={n.id} className="flex-between" style={{ borderTop: "1px solid var(--line)", padding: "10px 0", gap: 12, cursor: "pointer" }} onClick={() => openDetail(n)}>
              <div style={{ display: "flex", gap: 10, alignItems: "flex-start", minWidth: 0 }}>
                <span style={{ fontSize: 18, lineHeight: "20px" }}>{c.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: n.read ? 500 : 700 }}>{n.title}{!n.read && <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 999, background: "#dc2626", marginLeft: 8, verticalAlign: "middle" }} />}</div>
                  {n.body && <div className="muted" style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 520 }}>{n.body}</div>}
                  <div className="mono muted" style={{ fontSize: 11 }}>{c.label} · {new Date(n.createdAt).toLocaleString()}</div>
                </div>
              </div>
              <button className="secondary small" onClick={(e) => { e.stopPropagation(); openDetail(n); }}>View</button>
            </div>
          );
        })}
      </div>

      {detail && (
        <div className="modal-overlay" onClick={() => setDetail(null)}>
          <div className="modal" style={{ maxWidth: 520, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}>
              <h2 style={{ margin: 0 }}>{notifCat(detail).icon} {detail.title}</h2>
              <button className="secondary small" onClick={() => setDetail(null)}>Close</button>
            </div>
            <div className="mono muted" style={{ fontSize: 12, marginTop: 6 }}>{notifCat(detail).label} · {new Date(detail.createdAt).toLocaleString()}</div>
            {detail.body && <p style={{ marginTop: 12, whiteSpace: "pre-wrap" }}>{detail.body}</p>}
            {notifCat(detail).page && (
              <button style={{ marginTop: 8 }} onClick={() => goTo(detail)}>Go to {notifCat(detail).label} →</button>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function ParentTransport({ children }: { children: { id: string; name: string }[] }) {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [mapKey, setMapKey] = useState<number | null>(null);
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
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {it.status !== "completed" && it.status !== "cancelled" && it.journeyId && (
                <button className="linklike" style={{ fontSize: 12 }} onClick={() => setMapKey(mapKey === i ? null : i)}>{mapKey === i ? "Hide map" : "Live map"}</button>
              )}
              <span className={`badge ${it.status === "completed" ? "active" : it.status === "cancelled" ? "suspended" : "trial"}`}>{it.childStatus || it.status}</span>
            </div>
          </div>
          {mapKey === i && <ParentBusMap journeyId={it.journeyId} studentId={it.studentId} />}
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

// Parent live bus map — shows the bus and the child's OWN stop only (never other
// families' stops). Self-contained SVG, no map tiles or provider. Refreshes
// every 12s while open; stops when the journey ends.
function ParentBusMap({ journeyId, studentId }: { journeyId: string; studentId: string }) {
  const [t, setT] = useState<any>(null);
  useEffect(() => {
    if (!journeyId || !studentId) return;
    let alive = true;
    const go = async () => { const d = await fetch(`/api/parent/transport/track?journeyId=${encodeURIComponent(journeyId)}&studentId=${encodeURIComponent(studentId)}`).then((r) => r.json()); if (alive) setT(d); };
    go();
    const iv = setInterval(go, 12000);
    return () => { alive = false; clearInterval(iv); };
  }, [journeyId, studentId]);

  if (!t) return <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>Loading live position…</p>;
  if (t.ended) return <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>The journey has ended — live tracking is off.</p>;

  const trail: any[] = t.trail || [];
  const stop = t.myStop;
  const last = t.last;
  const pts = [...trail.map((p) => ({ lat: p.lat, lng: p.lng })), ...(stop ? [{ lat: stop.lat, lng: stop.lng }] : [])].filter((p) => p.lat != null && p.lng != null);
  const ageMin = last ? Math.round((Date.now() - new Date(last.at).getTime()) / 60000) : null;

  if (pts.length === 0) {
    return <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{t.sharing ? "Waiting for the bus's first GPS position…" : "The driver hasn't started sharing the bus location yet."}</p>;
  }
  const W = 560, H = 260, PAD = 24;
  const lats = pts.map((p) => p.lat), lngs = pts.map((p) => p.lng);
  let minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  if (maxLat - minLat < 0.002) { minLat -= 0.001; maxLat += 0.001; }
  if (maxLng - minLng < 0.002) { minLng -= 0.001; maxLng += 0.001; }
  const x = (lng: number) => PAD + ((lng - minLng) / (maxLng - minLng)) * (W - 2 * PAD);
  const y = (lat: number) => PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * PAD);
  const trailPath = trail.filter((p) => p.lat != null).map((p, i) => `${i === 0 ? "M" : "L"}${x(p.lng).toFixed(1)},${y(p.lat).toFixed(1)}`).join(" ");

  return (
    <div style={{ marginTop: 8 }}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
        <span className={`badge ${t.sharing ? "active" : "archived"}`}>{t.sharing ? "live" : "not sharing"}</span>
        {last ? ` · last update ${ageMin === 0 ? "just now" : `${ageMin} min ago`}` : " · awaiting first fix"}
        {t.journey?.delayMinutes ? ` · running +${t.journey.delayMinutes} min` : ""}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: W, height: "auto", background: "#eef4ff", border: "1px solid var(--line)", borderRadius: 10 }}>
        {trailPath && <path d={trailPath} fill="none" stroke="#94a3b8" strokeWidth={2} strokeDasharray="4 4" />}
        {stop && (
          <g>
            <rect x={x(stop.lng) - 5} y={y(stop.lat) - 5} width={10} height={10} rx={2} fill="#12a150" />
            <text x={x(stop.lng) + 9} y={y(stop.lat) + 4} fontSize={11} fill="#334155">Your stop{stop.plannedArrival ? ` (${stop.plannedArrival})` : ""}</text>
          </g>
        )}
        {last && (
          <g>
            <circle cx={x(last.lng)} cy={y(last.lat)} r={11} fill="#e11d48" opacity={0.18} />
            <circle cx={x(last.lng)} cy={y(last.lat)} r={6} fill="#e11d48" stroke="#fff" strokeWidth={2} />
            <text x={x(last.lng) + 9} y={y(last.lat) - 8} fontSize={12} fontWeight={700} fill="#e11d48">🚌</text>
          </g>
        )}
      </svg>
      {last && <div style={{ marginTop: 4 }}><a className="linklike" style={{ fontSize: 12 }} href={`https://www.openstreetmap.org/?mlat=${last.lat}&mlon=${last.lng}#map=16/${last.lat}/${last.lng}`} target="_blank" rel="noreferrer">Open in OpenStreetMap ↗</a></div>}
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
  if (trips.length === 0) return (
    <div className="panel">
      <h2>School trips</h2>
      <p className="sub" style={{ marginBottom: 0 }}>No trips for your children right now. When your school adds a trip, consent requests, itineraries and live updates will appear here.</p>
    </div>
  );
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

// ---- Parent profile: personal details, children/schools, compliance history ----
export function ParentProfile() {
  const [data, setData] = useState<any>(null);
  const [f, setF] = useState<any>({ fullName: "", phone: "", photoUrl: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    const d = await fetch("/api/parent/profile").then((r) => r.json());
    setData(d);
    if (d.profile) setF({ fullName: d.profile.fullName || "", phone: d.profile.phone || "", photoUrl: d.profile.photoUrl || "" });
  }, []);
  useEffect(() => { load(); }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    setMsg(res.ok && !d.error ? { kind: "ok", text: "Profile updated." } : { kind: "err", text: d.error || "Failed" });
    load();
  }
  async function acceptPolicy(id: string) {
    await fetch("/api/me/policies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policyId: id }) });
    load();
  }
  const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");
  if (!data) return <div className="panel" id="p-profile"><p className="muted">Loading profile…</p></div>;
  const p = data.profile || {};

  return (
    <div id="p-profile">
      <div className="panel">
        <h2>My profile</h2>
        <p className="sub">Your personal and contact details. Your email is managed by your school and can&apos;t be changed here.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={save}>
          <div className="row">
            <div><label>Full name</label><input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} /></div>
            <div><label>Email (read-only)</label><input value={p.email || ""} readOnly disabled /></div>
          </div>
          <div className="row">
            <div><label>Mobile number</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="+44…" /></div>
            <div><label>Photo URL</label><input value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} placeholder="https://…" /></div>
          </div>
          <button type="submit" style={{ marginTop: 12 }}>Save profile</button>
          <span className="muted" style={{ fontSize: 12, marginLeft: 10 }}>Two-factor: {p.mfaEnabled ? "on" : "off"} · manage notification channels under Preferences.</span>
        </form>
      </div>

      <div className="panel">
        <h2>My children</h2>
        <p className="sub">Everyone linked to your account{data.schools?.length > 1 ? ` across ${data.schools.length} schools` : ""}.</p>
        <table>
          <thead><tr><th>Child</th><th>Year</th><th>Relationship</th><th>School</th></tr></thead>
          <tbody>
            {(data.children || []).map((c: any) => (
              <tr key={c.id}><td><strong>{c.name}</strong><div className="mono muted" style={{ fontSize: 11 }}>{c.reference}</div></td><td className="muted">{c.yearGroup || "—"}</td><td className="muted">{c.relationship || "—"}</td><td>{c.schoolName}</td></tr>
            ))}
            {(data.children || []).length === 0 && <tr><td colSpan={4} className="muted">No children linked yet — contact your school.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Terms &amp; policy compliance</h2>
        <p className="sub">A record of what you&apos;ve accepted, and anything still outstanding.</p>

        <h3 style={{ fontSize: 14, margin: "6px 0" }}>{data.terms?.title || "Terms of Business"}</h3>
        <p style={{ margin: 0 }}>
          {data.terms?.acceptedAt ? <>Accepted version <strong>{data.terms.acceptedVersion}</strong> on {dt(data.terms.acceptedAt)} {data.terms.upToDate ? <span className="badge active">up to date</span> : <span className="badge suspended">update required</span>}</> : <span className="badge suspended">not yet accepted</span>}
        </p>

        <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>Policies accepted</h3>
        {(data.policies?.accepted || []).length === 0 ? <p className="muted">None recorded yet.</p> : (
          <table><thead><tr><th>Policy</th><th>Version</th><th>Accepted</th></tr></thead><tbody>
            {data.policies.accepted.map((a: any) => (<tr key={a.id}><td>{a.title}{a.mandatory ? <span className="badge role" style={{ marginLeft: 6 }}>mandatory</span> : null}</td><td className="muted">{a.version}</td><td className="mono muted" style={{ fontSize: 12 }}>{dt(a.acceptedAt)}</td></tr>))}
          </tbody></table>
        )}

        <h3 style={{ fontSize: 14, margin: "16px 0 6px" }}>Outstanding {(data.policies?.outstanding || []).length > 0 && <span className="badge suspended">{data.policies.outstanding.length}</span>}</h3>
        {(data.policies?.outstanding || []).length === 0 ? <p className="muted">You&apos;re fully up to date. 🎉</p> : (
          <table><thead><tr><th>Policy</th><th>Version</th><th className="right"></th></tr></thead><tbody>
            {data.policies.outstanding.map((o: any) => (
              <tr key={o.id}><td>{o.title}{o.updated ? <span className="badge trial" style={{ marginLeft: 6 }}>updated — re-accept</span> : null}</td><td className="muted">{o.version}</td>
                <td className="right nowrap"><a className="linklike" style={{ fontSize: 12 }} href={`/api/me/policies/${o.id}/pdf`} target="_blank" rel="noreferrer">View</a>{" · "}<button className="small" onClick={() => acceptPolicy(o.id)}>Accept</button></td></tr>
            ))}
          </tbody></table>
        )}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const STATUS_LABEL: Record<string, string> = { boarded: "Boarded", absent: "Absent", not_present: "Not present", dropped_off: "Dropped off" };
const STATUS_BADGE: Record<string, string> = { boarded: "active", dropped_off: "active", absent: "suspended", not_present: "archived" };

export default function DriverApp() {
  const [journeys, setJourneys] = useState<any[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [msg, setMsg] = useState("");

  const loadList = useCallback(async () => {
    const d = await fetch(`/api/driver/journeys`).then((r) => r.json());
    setJourneys(d.journeys ?? []);
  }, []);
  useEffect(() => { loadList(); }, [loadList]);

  const loadDetail = useCallback(async (id: string) => {
    const d = await fetch(`/api/driver/journeys/${id}`).then((r) => r.json());
    setDetail(d);
  }, []);
  useEffect(() => { if (open) loadDetail(open); }, [open, loadDetail]);

  async function act(path: string, body?: any) {
    const res = await fetch(`/api/driver/journeys/${open}/${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
    const d = await res.json();
    if (d.error) setMsg(d.error); else setMsg("");
    if (open) loadDetail(open);
    loadList();
  }
  async function board(studentId: string, status: string) { await act("board", { studentId, status }); }

  if (!open) {
    return (
      <>
        {journeys.map((j) => (
          <div className="panel flex-between" key={j.id}>
            <div><h2 style={{ marginBottom: 2 }}>{j.routeName}</h2><div className="muted">{j.session === "am" ? "Morning" : "Afternoon"} · {j.vehicle || "no vehicle"} · <span className={`badge ${j.status === "completed" ? "active" : "trial"}`}>{j.status}</span></div></div>
            <button onClick={() => setOpen(j.id)}>Open</button>
          </div>
        ))}
        {journeys.length === 0 && <div className="panel"><p className="muted">No journeys assigned today.</p></div>}
      </>
    );
  }

  if (!detail) return <div className="panel">Loading…</div>;
  const j = detail.journey;

  return (
    <>
      <button className="secondary small" onClick={() => { setOpen(null); setDetail(null); }}>← All journeys</button>
      {msg && <div className="notice err" style={{ marginTop: 10 }}>{msg}</div>}
      <div className="panel" style={{ marginTop: 10 }}>
        <div className="flex-between">
          <div><h2 style={{ marginBottom: 2 }}>{detail.route.name}</h2><div className="muted">{j.session === "am" ? "Morning" : "Afternoon"} · <span className="badge trial">{j.status}</span>{j.delayMinutes ? ` · +${j.delayMinutes} min` : ""}</div></div>
          {j.status === "scheduled" && <button onClick={() => act("start")}>Start journey</button>}
        </div>
        {j.status !== "scheduled" && j.status !== "completed" && (
          <>
            <div className="chips" style={{ marginTop: 10 }}>
              <button className="secondary small" onClick={() => act("position", { advance: true })}>Approaching</button>
              <button className="secondary small" onClick={() => act("position", { delayMinutes: (j.delayMinutes || 0) + 10 })}>Running late (+10)</button>
              <button className="small" onClick={() => act("complete")}>Complete journey</button>
            </div>
            <LiveShare journeyId={open!} active={j.status !== "completed"} />
          </>
        )}
      </div>

      <div className="panel">
        <h2>Stops</h2>
        <ol style={{ paddingLeft: 18, margin: 0 }}>
          {detail.route.stops.map((s: any) => <li key={s.id}>{s.name}{s.plannedArrival ? ` — ${s.plannedArrival}` : ""} <span className="muted">({s.kind})</span></li>)}
          {detail.route.stops.length === 0 && <li className="muted">No stops defined.</li>}
        </ol>
      </div>

      <div className="panel">
        <h2>Students ({detail.students.length})</h2>
        {detail.students.map((s: any) => (
          <div key={s.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0" }}>
            <div className="flex-between">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 36, height: 36, borderRadius: 999, background: "#e2e8f0", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700 }}>{s.name.split(" ").map((p: string) => p[0]).join("").slice(0, 2)}</span>
                <div><strong>{s.name}</strong> {s.medicalAlert && <span className="badge suspended">MED</span>}<div className="mono muted" style={{ fontSize: 11 }}>{s.reference}{s.accessibility ? ` · ${s.accessibility}` : ""}</div></div>
              </div>
              {s.status && <span className={`badge ${STATUS_BADGE[s.status]}`}>{STATUS_LABEL[s.status]}</span>}
            </div>
            {j.status !== "completed" && (
              <div className="chips" style={{ marginTop: 8 }}>
                <button className="small" onClick={() => board(s.id, "boarded")}>Boarded</button>
                <button className="secondary small" onClick={() => board(s.id, j.session === "am" ? "dropped_off" : "dropped_off")}>Dropped off</button>
                <button className="secondary small" onClick={() => board(s.id, "not_present")}>Not present</button>
                <button className="danger small" onClick={() => board(s.id, "absent")}>Absent</button>
              </div>
            )}
          </div>
        ))}
        {detail.students.length === 0 && <p className="muted">No students assigned to this route/session.</p>}
      </div>

      <div className="panel">
        <h2>Report incident</h2>
        <IncidentForm journeyId={open} onDone={() => setMsg("Incident reported.")} />
      </div>
    </>
  );
}

// Share the driver phone's GPS as the live-tracking source. No third-party
// provider: the browser's geolocation is posted to the journey every ~15s while
// sharing is on, and stops the moment it's turned off or the journey ends.
function LiveShare({ journeyId, active }: { journeyId: string; active: boolean }) {
  const [on, setOn] = useState(false);
  const [status, setStatus] = useState("");
  const [lastAt, setLastAt] = useState<number | null>(null);
  const watchId = useRef<number | null>(null);
  const lastSent = useRef<number>(0);

  const stop = useCallback(() => {
    if (watchId.current != null && typeof navigator !== "undefined" && navigator.geolocation) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
  }, []);

  useEffect(() => { if (!active && on) { setOn(false); stop(); } }, [active, on, stop]);
  useEffect(() => () => stop(), [stop]);

  function start() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setStatus("This device can't share location."); return; }
    setOn(true); setStatus("Starting…");
    watchId.current = navigator.geolocation.watchPosition(
      async (pos) => {
        const now = Date.now();
        if (now - lastSent.current < 15000) return; // throttle to ~15s
        lastSent.current = now;
        const { latitude: lat, longitude: lng } = pos.coords;
        try {
          const res = await fetch(`/api/driver/journeys/${journeyId}/position`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ lat, lng }) });
          const d = await res.json().catch(() => ({}));
          if (d.error) { setStatus(d.error); }
          else { setLastAt(now); setStatus(""); }
        } catch { setStatus("Couldn't reach the server — will retry."); }
      },
      (err) => { setStatus(err.code === err.PERMISSION_DENIED ? "Location permission denied — allow it to share." : "Couldn't get a GPS fix."); },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 20000 },
    );
  }
  function toggle() { if (on) { setOn(false); stop(); setStatus(""); } else start(); }

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <div className="flex-between">
        <div>
          <strong>Live location {on ? <span className="badge active">sharing</span> : <span className="badge archived">off</span>}</strong>
          <div className="muted" style={{ fontSize: 12 }}>{on ? (lastAt ? `Last sent ${new Date(lastAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Waiting for a GPS fix…") : "Share your position so the school can track this journey."}</div>
        </div>
        <button className={on ? "danger small" : "small"} onClick={toggle}>{on ? "Stop sharing" : "Share live location"}</button>
      </div>
      {status && <div className="notice info" style={{ marginTop: 8 }}>{status}</div>}
    </div>
  );
}

function IncidentForm({ journeyId, onDone }: { journeyId: string; onDone: () => void }) {
  const [type, setType] = useState("delay");
  const [notes, setNotes] = useState("");
  return (
    <div className="row">
      <div><label>Type</label><select value={type} onChange={(e) => setType(e.target.value)}><option>delay</option><option>breakdown</option><option>medical</option><option>behaviour</option><option>other</option></select></div>
      <div style={{ flex: 2 }}><label>Notes</label><input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
      <div style={{ display: "flex", alignItems: "flex-end" }}>
        <button className="danger" onClick={async () => { await fetch(`/api/driver/incident`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ journeyId, type, notes }) }); setNotes(""); onDone(); }}>Report</button>
      </div>
    </div>
  );
}

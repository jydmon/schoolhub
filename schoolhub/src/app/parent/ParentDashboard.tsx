"use client";

import { useEffect, useState, useCallback } from "react";
import AssistantChat from "@/components/AssistantChat";
import { ParentNotifications, ParentTransport, ParentTrips, ParentRewards, ParentPreferences, ParentReports, ParentMessaging } from "./ParentExtra";

const PARENT_EXAMPLES = ["What does my child need tomorrow?", "When is Sports Day?", "What is the uniform policy?", "How do I report an absence?", "What did the latest newsletter say?", "When is Parents' Evening?"];

const RANGES: [string, string][] = [["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This week"], ["month", "This month"]];
const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic", term: "Term date", holiday: "Holiday", inset: "INSET", exam: "Exam",
  parents_evening: "Parents' evening", sports_day: "Sports day", trip: "Trip", assembly: "Assembly",
  club: "Club", performance: "Performance", photos: "Photos", fundraiser: "Fundraiser",
  early_closure: "Early closure", timetable_change: "Timetable change", event: "Event",
};

// --- client-side add-to-calendar link builders (mirror src/lib/calendar.ts) ---
function pad(n: number) { return String(n).padStart(2, "0"); }
function stamp(d: Date) { return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`; }
function googleUrl(e: any) {
  const s = new Date(e.startsAt); const en = e.endsAt ? new Date(e.endsAt) : new Date(s.getTime() + 3600000);
  const p = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates: `${stamp(s)}/${stamp(en)}`, details: e.description || "", location: e.location || "" });
  return `https://calendar.google.com/calendar/render?${p}`;
}
function outlookUrl(e: any) {
  const s = new Date(e.startsAt); const en = e.endsAt ? new Date(e.endsAt) : new Date(s.getTime() + 3600000);
  const p = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: e.title, body: e.description || "", location: e.location || "", startdt: s.toISOString(), enddt: en.toISOString() });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p}`;
}

function fmtTime(iso: string, allDay: boolean) {
  if (allDay) return "All day";
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" });
}

export default function ParentDashboard() {
  const [range, setRange] = useState("today");
  const [childId, setChildId] = useState("all");
  const [data, setData] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/parent/overview?range=${range}`).then((r) => r.json());
    setData(d);
  }, [range]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/parent/calendar`).then((r) => r.json()).then(setFeed); }, []);

  if (!data) return <div className="panel">Loading…</div>;
  const children = data.children || [];
  const inChild = (item: any) => childId === "all" || (item.childIds || []).includes(childId);
  const events = (data.events || []).filter(inChild);
  const homework = (data.homework || []).filter(inChild);
  const outstanding = (data.outstanding || []).filter((o: any) => childId === "all" || o.studentId === childId);

  const clubs = events.filter((e: any) => e.category === "club");
  const transport = events.filter((e: any) => e.transportRequired || e.collectionAt || e.collectionLocation);

  // group events by day for week/month
  const byDay: Record<string, any[]> = {};
  for (const e of events) { const k = fmtDay(e.startsAt); (byDay[k] = byDay[k] || []).push(e); }

  async function consent(o: any, decision: string) {
    const res = await fetch(`/api/parent/consent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: o.eventId, studentId: o.studentId, decision, paymentAck: true }) });
    const d = await res.json();
    setMsg(res.ok && !d.error ? { kind: "ok", text: `Response recorded: ${decision}.` } : { kind: "err", text: d.error || "Failed" });
    load();
  }

  return (
    <>
      <div className="tabs" id="p-overview">
        {RANGES.map(([k, label]) => (
          <button key={k} className={range === k ? "active" : ""} onClick={() => setRange(k)}>{label}</button>
        ))}
      </div>

      <div className="panel flex-between" style={{ alignItems: "center" }}>
        <div className="chips">
          <button className={childId === "all" ? "" : "secondary"} onClick={() => setChildId("all")}>Whole family</button>
          {children.map((c: any) => (
            <button key={c.id} className={childId === c.id ? "" : "secondary"} onClick={() => setChildId(c.id)}>{c.name}</button>
          ))}
        </div>
        <div className="muted" style={{ fontSize: 13 }}>
          {children.map((c: any) => `${c.name.split(" ")[0]}: start ${c.startTime}`).join(" · ")}
        </div>
      </div>

      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      <div id="p-notifications"><ParentNotifications /></div>
      <div id="p-transport"><ParentTransport children={children} /></div>
      <div id="p-trips"><ParentTrips /></div>
      <div id="p-rewards"><ParentRewards /></div>

      {outstanding.length > 0 && (
        <div className="panel" style={{ borderColor: "var(--warn)" }}>
          <h2>Outstanding actions</h2>
          <p className="sub">These need your response.</p>
          {outstanding.map((o: any, i: number) => (
            <div key={i} className="flex-between" style={{ borderBottom: "1px solid var(--line)", padding: "8px 0" }}>
              <div><strong>{o.title}</strong> <span className="muted">— consent for {o.childName}{o.paymentRef ? ` · payment ref ${o.paymentRef}` : ""}</span>
                <div className="muted" style={{ fontSize: 12 }}>{fmtDay(o.startsAt)}</div></div>
              <div><button className="small" onClick={() => consent(o, "given")}>Give consent</button>{" "}
                <button className="small secondary" onClick={() => consent(o, "declined")}>Decline</button></div>
            </div>
          ))}
        </div>
      )}

      <div className="panel">
        <h2>{data.rangeLabel} · activities &amp; events</h2>
        {events.length === 0 && <p className="muted">Nothing scheduled.</p>}
        {Object.entries(byDay).map(([day, evs]) => (
          <div key={day} style={{ marginBottom: 14 }}>
            {range !== "today" && range !== "tomorrow" && <div className="muted" style={{ fontWeight: 700, margin: "8px 0 4px" }}>{day}</div>}
            {(evs as any[]).map((e) => (
              <div key={e.id} style={{ borderBottom: "1px solid var(--line)", padding: "10px 0" }}>
                <div className="flex-between">
                  <div>
                    <span className="mono muted" style={{ fontSize: 12 }}>{fmtTime(e.startsAt, e.allDay)}</span>{" "}
                    <strong>{e.title}</strong> <span className="badge role">{CATEGORY_LABELS[e.category] || e.category}</span>
                    {childId === "all" && e.childNames?.length ? <span className="muted" style={{ fontSize: 12 }}> · {Array.from(new Set(e.childNames)).join(", ")}</span> : null}
                    <div className="muted" style={{ fontSize: 12 }}>{e.location || ""}{e.schoolName ? ` · ${e.schoolName}` : ""}</div>
                    <div className="chips" style={{ marginTop: 6 }}>
                      {e.equipment && <span className="chip">Kit: {e.equipment}</span>}
                      {e.clothing && <span className="chip">Wear: {e.clothing}</span>}
                      {e.packedLunch && <span className="chip">Packed lunch</span>}
                      {e.transportRequired && <span className="chip">Transport</span>}
                      {e.collectionAt && <span className="chip">Collect {fmtTime(e.collectionAt, false)}{e.collectionLocation ? ` @ ${e.collectionLocation}` : ""}</span>}
                      {e.consentRequired && <span className="chip" style={{ borderColor: "var(--warn)" }}>Consent required</span>}
                    </div>
                  </div>
                  <div style={{ whiteSpace: "nowrap" }}>
                    <a href={googleUrl(e)} target="_blank" rel="noreferrer"><button className="small secondary">Google</button></a>{" "}
                    <a href={outlookUrl(e)} target="_blank" rel="noreferrer"><button className="small secondary">Outlook</button></a>{" "}
                    <a href={`/api/schools/${e.schoolId}/events/${e.id}/ics`}><button className="small secondary">Apple</button></a>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="row" style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
        <div className="panel" style={{ flex: 1, minWidth: 280 }}>
          <h2>Homework deadlines</h2>
          {homework.length === 0 ? <p className="muted">None due in this period.</p> : (
            <table><thead><tr><th>Due</th><th>Title</th><th>Subject</th></tr></thead><tbody>
              {homework.map((h: any) => (
                <tr key={h.id}><td className="mono muted">{fmtDay(h.dueAt)}</td><td>{h.title}{childId === "all" && h.childNames?.length ? <span className="muted"> · {Array.from(new Set(h.childNames)).join(", ")}</span> : null}</td><td>{h.subject || "—"}</td></tr>
              ))}
            </tbody></table>
          )}
        </div>
        <div className="panel" style={{ flex: 1, minWidth: 280 }}>
          <h2>Clubs &amp; transport</h2>
          <div className="muted" style={{ fontSize: 13, marginBottom: 6 }}>Clubs</div>
          {clubs.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>None.</p> : clubs.map((c: any) => <div key={c.id}>• {c.title} <span className="muted">({fmtTime(c.startsAt, c.allDay)})</span></div>)}
          <div className="muted" style={{ fontSize: 13, margin: "10px 0 6px" }}>Transport &amp; collection</div>
          {transport.length === 0 ? <p className="muted" style={{ marginTop: 0 }}>No changes.</p> : transport.map((t: any) => <div key={t.id}>• {t.title}{t.collectionAt ? ` — collect ${fmtTime(t.collectionAt, false)}` : ""}{t.collectionLocation ? ` @ ${t.collectionLocation}` : ""}</div>)}
        </div>
      </div>

      <div className="panel">
        <h2>Add to your calendar</h2>
        <p className="sub">Use the per-event buttons above, or subscribe to your whole family calendar so it stays in sync.</p>
        {feed?.httpUrl ? (
          <>
            <label>Family calendar subscription URL</label>
            <input readOnly value={feed.httpUrl} onFocus={(e) => e.currentTarget.select()} />
            <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              Google Calendar: “Other calendars → From URL”. Apple Calendar: “File → New Calendar Subscription”. Outlook: “Add calendar → Subscribe from web”.
            </p>
            <button className="secondary" onClick={async () => { const d = await fetch(`/api/parent/calendar`, { method: "POST" }).then((r) => r.json()); setFeed(d); }}>Regenerate link</button>
          </>
        ) : <p className="muted">Loading subscription link…</p>}
      </div>

      <div id="p-reports"><ParentReports /></div>
      <div id="p-messaging"><ParentMessaging /></div>
      <div id="p-preferences"><ParentPreferences /></div>
      <AssistantChat examples={PARENT_EXAMPLES} />
    </>
  );
}

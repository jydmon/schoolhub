"use client";

import { useEffect, useState, useCallback } from "react";

const RANGES: [string, string][] = [["today", "Today"], ["tomorrow", "Tomorrow"], ["week", "This week"], ["month", "This month"]];
const CATEGORY_LABELS: Record<string, string> = {
  academic: "Academic", term: "Term date", holiday: "Holiday", inset: "INSET", exam: "Exam",
  parents_evening: "Parents' evening", sports_day: "Sports day", trip: "Trip", assembly: "Assembly",
  club: "Club", performance: "Performance", photos: "Photos", fundraiser: "Fundraiser",
  early_closure: "Early closure", timetable_change: "Timetable change", event: "Event", homework: "Homework", timetable: "Lesson",
};
const TONE_STYLE: Record<string, { bg: string; bd: string; ic: string }> = {
  good: { bg: "#ecfdf5", bd: "#a7f3d0", ic: "✅" },
  info: { bg: "#eff6ff", bd: "#bfdbfe", ic: "ℹ️" },
  warn: { bg: "#fff7ed", bd: "#fed7aa", ic: "⚠️" },
};

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
function fmtTime(iso: string, allDay: boolean) { if (allDay) return "All day"; return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function fmtDay(iso: string) { return new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }); }
function fmtDT(iso: string, allDay?: boolean) { const d = new Date(iso); return allDay ? fmtDay(iso) : `${fmtDay(iso)} · ${fmtTime(iso, false)}`; }
function rateColor(r: number | null) { if (r == null) return "var(--muted)"; if (r >= 96) return "#16a34a"; if (r >= 90) return "#ca8a04"; return "#dc2626"; }

function Widget({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="panel" style={{ flex: 1, minWidth: 300, marginBottom: 0 }}>
      <div className="flex-between" style={{ alignItems: "center" }}><h2 style={{ margin: 0, fontSize: 16 }}>{title}</h2>{action}</div>
      <div style={{ marginTop: 10 }}>{children}</div>
    </div>
  );
}

export default function ParentOverview({ onNavigate }: { onNavigate?: (k: string) => void }) {
  const [range, setRange] = useState("today");
  const [childId, setChildId] = useState("all");
  const [data, setData] = useState<any>(null);
  const [dash, setDash] = useState<any>(null);
  const [feed, setFeed] = useState<any>(null);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch(`/api/parent/overview?range=${range}`).then((r) => r.json());
    setData(d);
  }, [range]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/parent/dashboard`).then((r) => r.json()).then(setDash).catch(() => setDash({ error: true })); }, []);
  useEffect(() => { fetch(`/api/parent/calendar`).then((r) => r.json()).then(setFeed); }, []);

  if (!data) return <div className="panel">Loading…</div>;
  const children = data.children || [];
  const inChild = (item: any) => childId === "all" || (item.childIds || []).includes(childId);
  const events = (data.events || []).filter(inChild);
  const outstanding = (data.outstanding || []).filter((o: any) => childId === "all" || o.studentId === childId);
  const byDay: Record<string, any[]> = {};
  for (const e of events) { const k = fmtDay(e.startsAt); (byDay[k] = byDay[k] || []).push(e); }

  const go = (k: string) => onNavigate && onNavigate(k);
  const childName = (id: string) => (dash?.children || []).find((c: any) => c.id === id)?.firstName || "";

  async function consent(o: any, decision: string) {
    const res = await fetch(`/api/parent/consent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventId: o.eventId, studentId: o.studentId, decision, paymentAck: true }) });
    const d = await res.json();
    setMsg(res.ok && !d.error ? { kind: "ok", text: `Response recorded: ${decision}.` } : { kind: "err", text: d.error || "Failed" });
    load();
  }

  const wrap = { display: "flex", gap: 16, flexWrap: "wrap" as const, marginBottom: 16 };

  return (
    <>
      {/* AI insights */}
      {dash && !dash.error && (dash.insights?.length ? (
        <div className="panel" style={{ background: "linear-gradient(180deg,#f5f3ff,#ffffff)", borderColor: "#ddd6fe" }}>
          <div className="flex-between" style={{ alignItems: "center" }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>🤖 AI insights</h2>
            <button className="secondary small" onClick={() => go("assistant")}>Ask a question</button>
          </div>
          <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
            {dash.insights.map((it: any, i: number) => {
              const t = TONE_STYLE[it.tone] || TONE_STYLE.info;
              return <div key={i} style={{ background: t.bg, border: `1px solid ${t.bd}`, borderRadius: 8, padding: "8px 10px", fontSize: 13 }}>{t.ic} {it.text}</div>;
            })}
          </div>
        </div>
      ) : null)}

      {/* Per-child attendance + behaviour */}
      {dash && !dash.error && dash.children?.length > 0 && (
        <div style={wrap}>
          {dash.children.map((c: any) => {
            const s = (dash.perChild || []).find((p: any) => p.id === c.id) || {};
            const at = s.attendance || {}; const bh = s.behaviour || {};
            return (
              <div key={c.id} className="panel" style={{ flex: 1, minWidth: 260, marginBottom: 0 }}>
                <div className="flex-between" style={{ alignItems: "center" }}>
                  <div><strong>{c.name}</strong><div className="muted" style={{ fontSize: 12 }}>{[c.yearGroup, c.className].filter(Boolean).join(" · ")} · {c.schoolName}</div></div>
                  <button className="secondary small" onClick={() => go("children")}>View</button>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 12, alignItems: "center" }}>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 26, fontWeight: 800, color: rateColor(at.rate ?? null) }}>{at.rate == null ? "—" : `${at.rate}%`}</div>
                    <div className="muted" style={{ fontSize: 11 }}>Attendance (60d)</div>
                  </div>
                  <div style={{ flex: 1, fontSize: 12 }} className="muted">
                    <div>Present {at.present ?? 0} · Late {at.late ?? 0} · Absent {at.absent ?? 0}</div>
                    <div style={{ marginTop: 6 }}>⭐ {bh.positivePoints ?? 0} positive{bh.negativeCount ? ` · ${bh.negativeCount} to review` : ""}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Widget grid */}
      {dash && !dash.error && (
        <>
          <div style={wrap}>
            <Widget title="Upcoming events & trips" action={<button className="secondary small" onClick={() => go("calendar")}>Calendar</button>}>
              {dash.upcomingEvents?.length ? dash.upcomingEvents.slice(0, 6).map((e: any) => (
                <div key={e.id} style={{ borderBottom: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
                  <div><strong>{e.title}</strong> <span className="badge role">{CATEGORY_LABELS[e.category] || e.category}</span></div>
                  <div className="muted" style={{ fontSize: 12 }}>{fmtDT(e.startsAt, e.allDay)}{e.childNames?.length ? ` · ${Array.from(new Set(e.childNames)).join(", ")}` : ""}{e.location ? ` · ${e.location}` : ""}</div>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>Nothing in the next 2 weeks.</p>}
            </Widget>
            <Widget title="Homework due" action={<button className="secondary small" onClick={() => go("children")}>All homework</button>}>
              {dash.homeworkDue?.length ? dash.homeworkDue.slice(0, 6).map((h: any) => (
                <div key={h.id} style={{ borderBottom: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
                  <div><strong>{h.title}</strong></div>
                  <div className="muted" style={{ fontSize: 12 }}>Due {fmtDT(h.startsAt)}{h.childNames?.length ? ` · ${Array.from(new Set(h.childNames)).join(", ")}` : ""}</div>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>Nothing due in the next 7 days.</p>}
            </Widget>
          </div>

          <div style={wrap}>
            <Widget title="Today's lessons" action={<button className="secondary small" onClick={() => go("timetable")}>Timetable</button>}>
              {dash.timetableToday?.length ? dash.timetableToday.slice(0, 8).map((t: any) => (
                <div key={t.id} className="flex-between" style={{ borderBottom: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
                  <div><strong>{t.title}</strong>{t.childNames?.length ? <span className="muted" style={{ fontSize: 12 }}> · {t.childNames.join(", ")}</span> : null}</div>
                  <div className="mono muted" style={{ fontSize: 12 }}>{fmtTime(t.startsAt, false)}</div>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>No lessons scheduled today.</p>}
            </Widget>
            <Widget title="Recent reports" action={<button className="secondary small" onClick={() => go("reports")}>Reports</button>}>
              {dash.recentReports?.length ? dash.recentReports.slice(0, 6).map((r: any) => (
                <div key={r.id} className="flex-between" style={{ borderBottom: "1px solid var(--line)", padding: "6px 0", fontSize: 13 }}>
                  <div><strong>{r.title}</strong>{r.childName ? <span className="muted" style={{ fontSize: 12 }}> · {r.childName}</span> : null}<div className="muted" style={{ fontSize: 12 }}>{r.term || ""}</div></div>
                  <button className="secondary small" onClick={() => go("reports")}>Open</button>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>No reports released yet.</p>}
            </Widget>
          </div>

          <div style={wrap}>
            <Widget title="Announcements" action={<button className="secondary small" onClick={() => go("notifications")}>{dash.unreadCount ? `${dash.unreadCount} unread` : "All"}</button>}>
              {dash.announcements?.length ? dash.announcements.slice(0, 5).map((n: any) => (
                <div key={n.id} style={{ borderBottom: "1px solid var(--line)", padding: "7px 0", fontSize: 13, opacity: n.read ? 0.75 : 1 }}>
                  <div><strong>{n.title}</strong>{!n.read && <span className="badge" style={{ marginLeft: 6, background: "#dc2626", color: "#fff" }}>new</span>}</div>
                  <div className="muted" style={{ fontSize: 12 }}>{n.body ? String(n.body).slice(0, 90) : ""}</div>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>No announcements.</p>}
            </Widget>
            <Widget title="Outstanding policies" action={<button className="secondary small" onClick={() => go("compliance")}>Compliance</button>}>
              {dash.outstandingPolicies?.length ? dash.outstandingPolicies.map((p: any) => (
                <div key={p.id} className="flex-between" style={{ borderBottom: "1px solid var(--line)", padding: "7px 0", fontSize: 13 }}>
                  <div><strong>{p.title}</strong> <span className="muted" style={{ fontSize: 12 }}>v{p.version}{p.category ? ` · ${p.category}` : ""}</span></div>
                  <button className="secondary small" onClick={() => go("compliance")}>Review</button>
                </div>
              )) : <p className="muted" style={{ margin: 0 }}>All policies acknowledged. ✅</p>}
            </Widget>
          </div>
        </>
      )}

      {/* Detailed activity feed (range-driven) */}
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

      <div className="panel">
        <h2>Add to your calendar</h2>
        <p className="sub">Subscribe to your whole family calendar so it stays in sync.</p>
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
    </>
  );
}

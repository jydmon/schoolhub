"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";
import { Kebab, SourceBadge, DetailModal } from "./EntityKit";

const CATEGORIES = ["academic", "term", "holiday", "inset", "exam", "parents_evening", "sports_day", "trip", "assembly", "club", "performance", "photos", "fundraiser", "early_closure", "timetable_change", "event"];
const CAT_LABEL: Record<string, string> = {
  academic: "Academic", term: "Term date", holiday: "Holiday", inset: "INSET day", exam: "Exam",
  parents_evening: "Parents' evening", sports_day: "Sports day", trip: "School trip", assembly: "Assembly",
  club: "Club", performance: "Performance", photos: "School photographs", fundraiser: "Fundraiser",
  early_closure: "Early closure", timetable_change: "Timetable change", event: "Event",
  homework: "Homework", timetable: "Timetable",
};
const CAT_COLOR: Record<string, string> = {
  academic: "#4f46e5", term: "#0ea5e9", holiday: "#12a150", inset: "#64748b", exam: "#e11d48",
  parents_evening: "#7c3aed", sports_day: "#d97706", trip: "#0891b2", assembly: "#2563eb",
  club: "#059669", performance: "#db2777", photos: "#9333ea", fundraiser: "#ca8a04",
  early_closure: "#dc2626", timetable_change: "#475569", event: "#4338ca",
  homework: "#0f766e", timetable: "#7c3aed",
};
const CAT_ICON: Record<string, string> = {
  academic: "🎓", term: "📅", holiday: "🏖️", inset: "🧑‍🏫", exam: "📝", parents_evening: "👪",
  sports_day: "🏅", trip: "🧳", assembly: "🎤", club: "⚽", performance: "🎭", photos: "📸",
  fundraiser: "💷", early_closure: "🚪", timetable_change: "🔁", event: "📌", homework: "📚", timetable: "🗓️",
};
const catColor = (c: string) => CAT_COLOR[c] || "#4338ca";
const catIcon = (c: string) => CAT_ICON[c] || "📌";
// A rich, multi-line tooltip preview for an event chip.
const evTip = (e: any) => [
  `${CAT_LABEL[e.category] || e.category}: ${e.title}`,
  e.allDay ? "All day" : `${new Date(e.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
  e.location ? `📍 ${e.location}` : "",
  e.consentRequired ? "Consent required" : "",
].filter(Boolean).join("\n");
const SCOPES = ["school", "year", "class", "house", "club", "students"];
const VIEWS: [string, string][] = [["month", "Month"], ["week", "Week"], ["day", "Day"], ["quarter", "Quarter"], ["year", "Year"], ["table", "Table"]];
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ---- date helpers (local time) ----
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const monthMatrix = (year: number, month: number) => {
  const first = new Date(year, month, 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
};
const eventOnDay = (e: any, day: Date) => {
  const s = new Date(e.startsAt);
  const en = e.endsAt ? new Date(e.endsAt) : s;
  const d0 = ymd(day);
  return ymd(s) <= d0 && d0 <= ymd(en);
};
const timeLabel = (e: any) => e.allDay ? "All day" : new Date(e.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function blankEvent() {
  return {
    title: "", description: "", category: "event", startsAt: "", endsAt: "", allDay: false, location: "",
    audienceScope: "school", yearGroup: "", className: "", house: "", club: "",
    equipment: "", clothing: "", packedLunch: false, transportRequired: false, collectionAt: "", collectionLocation: "",
    consentRequired: false, paymentRef: "", status: "published", reminders: { 1440: false, 60: false, 15: false } as Record<string, boolean>,
  };
}
function eventToForm(e: any) {
  const offs: number[] = Array.isArray(e.reminderOffsets) ? e.reminderOffsets : (() => { try { return JSON.parse(e.reminderOffsets || "[]"); } catch { return []; } })();
  return {
    title: e.title || "", description: e.description || "", category: e.category || "event",
    startsAt: e.startsAt ? toLocalInput(new Date(e.startsAt)) : "", endsAt: e.endsAt ? toLocalInput(new Date(e.endsAt)) : "",
    allDay: !!e.allDay, location: e.location || "", audienceScope: e.audienceScope || "school",
    yearGroup: e.yearGroup || "", className: "", house: e.house || "", club: e.club || "",
    equipment: e.equipment || "", clothing: e.clothing || "", packedLunch: !!e.packedLunch, transportRequired: !!e.transportRequired,
    collectionAt: e.collectionAt ? toLocalInput(new Date(e.collectionAt)) : "", collectionLocation: e.collectionLocation || "",
    consentRequired: !!e.consentRequired, paymentRef: e.paymentRef || "", status: e.status || "published",
    reminders: { 1440: offs.includes(1440), 60: offs.includes(60), 15: offs.includes(15) } as Record<string, boolean>,
  };
}
function formToBody(form: any) {
  const reminderOffsets = Object.entries(form.reminders).filter(([, v]) => v).map(([k]) => Number(k));
  return {
    title: form.title, description: form.description || undefined, category: form.category,
    startsAt: form.startsAt, endsAt: form.endsAt || undefined, allDay: form.allDay, location: form.location || undefined,
    audienceScope: form.audienceScope, yearGroup: form.yearGroup || undefined, house: form.house || undefined, club: form.club || undefined,
    equipment: form.equipment || undefined, clothing: form.clothing || undefined, packedLunch: form.packedLunch, transportRequired: form.transportRequired,
    collectionAt: form.collectionAt || undefined, collectionLocation: form.collectionLocation || undefined,
    consentRequired: form.consentRequired, paymentRef: form.paymentRef || undefined, status: form.status, reminderOffsets,
  };
}

function EventFields({ form, setForm }: { form: any; setForm: (f: any) => void }) {
  return (
    <>
      <div className="row">
        <div style={{ flex: 2 }}><label>Title</label><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></div>
        <div><label>Category</label><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></div>
        <div><label>Status</label><select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>published</option><option>draft</option><option>cancelled</option></select></div>
      </div>
      <div className="row">
        <div><label>Starts</label><input type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} required /></div>
        <div><label>Ends</label><input type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} /></div>
        <div><label>Location</label><input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Audience</label><select value={form.audienceScope} onChange={(e) => setForm({ ...form, audienceScope: e.target.value })}>{SCOPES.map((s) => <option key={s}>{s}</option>)}</select></div>
        {form.audienceScope === "year" && <div><label>Year group</label><input value={form.yearGroup} onChange={(e) => setForm({ ...form, yearGroup: e.target.value })} /></div>}
        {form.audienceScope === "house" && <div><label>House</label><input value={form.house} onChange={(e) => setForm({ ...form, house: e.target.value })} /></div>}
        {form.audienceScope === "club" && <div><label>Club</label><input value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })} /></div>}
      </div>
      <label>Description</label>
      <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="row" style={{ marginTop: 8 }}>
        <div><label>Equipment</label><input value={form.equipment} onChange={(e) => setForm({ ...form, equipment: e.target.value })} /></div>
        <div><label>Clothing / uniform</label><input value={form.clothing} onChange={(e) => setForm({ ...form, clothing: e.target.value })} /></div>
        <div><label>Payment reference</label><input value={form.paymentRef} onChange={(e) => setForm({ ...form, paymentRef: e.target.value })} /></div>
      </div>
      <div className="row">
        <div><label>Collection time</label><input type="datetime-local" value={form.collectionAt} onChange={(e) => setForm({ ...form, collectionAt: e.target.value })} /></div>
        <div><label>Collection location</label><input value={form.collectionLocation} onChange={(e) => setForm({ ...form, collectionLocation: e.target.value })} /></div>
      </div>
      <div className="chips" style={{ marginTop: 10 }}>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.allDay} onChange={(e) => setForm({ ...form, allDay: e.target.checked })} /> All day</label>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.packedLunch} onChange={(e) => setForm({ ...form, packedLunch: e.target.checked })} /> Packed lunch</label>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.transportRequired} onChange={(e) => setForm({ ...form, transportRequired: e.target.checked })} /> Transport required</label>
        <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.consentRequired} onChange={(e) => setForm({ ...form, consentRequired: e.target.checked })} /> Consent required</label>
      </div>
      <div className="chips" style={{ marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 13 }}>Reminders:</span>
        {[["1440", "1 day before"], ["60", "1 hour before"], ["15", "15 min before"]].map(([k, l]) => (
          <label key={k} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={form.reminders[k]} onChange={(e) => setForm({ ...form, reminders: { ...form.reminders, [k]: e.target.checked } })} /> {l}</label>
        ))}
      </div>
    </>
  );
}

export default function CalendarTab({ schoolId, onOpenStudent }: { schoolId: string; onOpenStudent?: (studentId: string) => void }) {
  const [events, setEvents] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [parts, setParts] = useState<{ loading: boolean; staff: any[]; students: any[] } | null>(null);
  const [view, setView] = useState<string>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [form, setForm] = useState<any>(blankEvent());
  const [hw, setHw] = useState({ title: "", subject: "", dueAt: "", yearGroup: "", className: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  // filters + sort
  const [q, setQ] = useState("");
  const [fCat, setFCat] = useState("");
  const [fScope, setFScope] = useState("");
  const [fSource, setFSource] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [sortKey, setSortKey] = useState("startsAt");
  const [sortDir, setSortDir] = useState<1 | -1>(1);

  // drill-through
  const [detail, setDetail] = useState<any>(null);
  const [dTab, setDTab] = useState("Details");
  const [editForm, setEditForm] = useState<any>(null);

  const load = useCallback(async () => {
    const [e, h, tr, tt] = await Promise.all([
      fetch(`/api/schools/${schoolId}/events`).then((r) => r.json()),
      fetch(`/api/schools/${schoolId}/homework`).then((r) => r.json()),
      fetch(`/api/schools/${schoolId}/trips`).then((r) => r.json()).catch(() => ({})),
      fetch(`/api/schools/${schoolId}/timetable`).then((r) => r.json()).catch(() => ({})),
    ]);
    // Trips show automatically on the calendar as read-only "trip" events
    // (managed in the Trips tab). Synthetic ids are prefixed "trip:".
    const tripEvents = (tr.trips ?? []).filter((t: any) => t.date).map((t: any) => {
      const t0 = /^\d{1,2}:\d{2}$/.test(t.departureTime || "") ? String(t.departureTime).padStart(5, "0") : null;
      const t1 = /^\d{1,2}:\d{2}$/.test(t.returnTime || "") ? String(t.returnTime).padStart(5, "0") : null;
      return {
        id: `trip:${t.id}`, title: t.title, category: "trip",
        startsAt: `${t.date}T${t0 || "09:00"}:00`, endsAt: t1 ? `${t.date}T${t1}:00` : null,
        allDay: !t0, location: t.destination || t.venue || "", description: t.purpose || "",
        audienceScope: "school", status: "published", source: "api",
        consentRequired: !!t.consentRequired, transportRequired: true, _isTrip: true,
      };
    });
    // Homework due dates also appear on the calendar (read-only "homework" entries).
    const hwEvents = (h.homework ?? []).filter((x: any) => x.dueAt).map((x: any) => ({
      id: `hw:${x.id}`, title: `${x.title}${x.subject ? ` (${x.subject})` : ""}`, category: "homework",
      startsAt: x.dueAt, endsAt: null, allDay: false, location: "", description: `Homework due${x.yearGroup ? ` · ${x.yearGroup}` : ""}`,
      audienceScope: x.yearGroup ? "year" : "school", yearGroup: x.yearGroup || "", status: "published", source: "api", _isHomework: true,
    }));
    // Timetable lessons repeat weekly — expand into dated occurrences across an
    // 8-week window from the start of this week so they show on the calendar.
    const ttEntries: any[] = tt.entries ?? [];
    const ttEvents: any[] = [];
    if (ttEntries.length) {
      const weekStart = startOfWeek(new Date());
      for (let d = 0; d < 56; d++) {
        const day = addDays(weekStart, d);
        const dow = ((day.getDay() + 6) % 7) + 1; // 1=Mon..7=Sun
        for (const t of ttEntries.filter((x) => x.dayOfWeek === dow)) {
          const ds = ymd(day);
          ttEvents.push({
            id: `tt:${t.id}:${ds}`, title: `${t.subject}${t.room ? ` (${t.room})` : ""}`, category: "timetable",
            startsAt: `${ds}T${String(t.startTime).padStart(5, "0")}:00`, endsAt: `${ds}T${String(t.endTime).padStart(5, "0")}:00`,
            allDay: false, location: t.room || "", description: [t.className || t.yearGroup, t.teacherName].filter(Boolean).join(" · "),
            audienceScope: t.yearGroup ? "year" : "school", yearGroup: t.yearGroup || "", status: "published", source: "api", _isTimetable: true,
          });
        }
      }
    }
    setEvents([...(e.events ?? []), ...tripEvents, ...hwEvents, ...ttEvents]);
    setHomework(h.homework ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return events.filter((e) => {
      if (fCat && e.category !== fCat) return false;
      if (fScope && e.audienceScope !== fScope) return false;
      if (fSource && (e.source || "manual") !== fSource) return false;
      if (fStatus && e.status !== fStatus) return false;
      if (needle && !(`${e.title} ${e.location || ""} ${e.description || ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
  }, [events, q, fCat, fScope, fSource, fStatus]);

  async function createEvent(ev: React.FormEvent) {
    ev.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formToBody(form)) });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed to create event" }); return; }
    setMsg({ kind: "ok", text: "Event created." }); setForm(blankEvent()); setShowForm(false); load();
  }
  async function saveEdit(ev: React.FormEvent) {
    ev.preventDefault();
    const res = await fetch(`/api/schools/${schoolId}/events/${detail.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(formToBody(editForm)) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed to save" }); return; }
    setMsg({ kind: "ok", text: "Event updated." }); setDetail(null); load();
  }
  async function del(id: string) {
    const res = await fetch(`/api/schools/${schoolId}/events/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed to delete" }); return; }
    setDetail(null); load();
  }

  function openDetail(e: any) {
    setDetail(e); setDTab("Details"); setEditForm(eventToForm(e)); setParts(null);
    // Fetch the full participant list (teacher in charge + students attending).
    if (e._isHomework || e._isTimetable) return;
    setParts({ loading: true, staff: [], students: [] });
    if (e._isTrip) {
      const tripId = String(e.id).replace(/^trip:/, "");
      fetch(`/api/schools/${schoolId}/trips/${tripId}`).then((r) => r.json()).then((d) => {
        const t = d.trip || {};
        setParts({ loading: false, staff: (t.staff || []).map((s: any) => ({ id: s.userId, name: s.user?.fullName })), students: (t.students || []).map((s: any) => ({ id: s.studentId, name: `${s.student?.firstName ?? ""} ${s.student?.lastName ?? ""}`.trim(), medicalAlert: s.student?.medicalAlert })) });
      }).catch(() => setParts({ loading: false, staff: [], students: [] }));
    } else {
      fetch(`/api/schools/${schoolId}/events/${e.id}`).then((r) => r.json()).then((d) => {
        const ev = d.event || {};
        setParts({ loading: false, staff: (ev.staff || []).map((s: any) => ({ id: s.user?.id || s.userId, name: s.user?.fullName })), students: (ev.students || []).map((s: any) => ({ id: s.student?.id || s.studentId, name: `${s.student?.firstName ?? ""} ${s.student?.lastName ?? ""}`.trim() })) });
      }).catch(() => setParts({ loading: false, staff: [], students: [] }));
    }
  }

  async function addHomework(ev: React.FormEvent) {
    ev.preventDefault();
    const res = await fetch(`/api/schools/${schoolId}/homework`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: hw.title, subject: hw.subject || undefined, dueAt: hw.dueAt, yearGroup: hw.yearGroup || undefined }) });
    const d = await res.json();
    if (res.ok && !d.error) { setHw({ title: "", subject: "", dueAt: "", yearGroup: "", className: "" }); load(); }
  }

  // ---- navigation ----
  function shift(dir: number) {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else if (view === "month" || view === "table") setCursor((c) => addMonths(c, dir));
    else if (view === "quarter") setCursor((c) => addMonths(c, dir * 3));
    else if (view === "year") setCursor((c) => addMonths(c, dir * 12));
  }
  const rangeLabel = useMemo(() => {
    const c = cursor;
    if (view === "day") return c.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (view === "week") { const s = startOfWeek(c); const e = addDays(s, 6); return `${s.toLocaleDateString([], { day: "numeric", month: "short" })} – ${e.toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`; }
    if (view === "quarter") { const qi = Math.floor(c.getMonth() / 3); return `Q${qi + 1} ${c.getFullYear()} · ${MONTHS[qi * 3]}–${MONTHS[qi * 3 + 2]}`; }
    if (view === "year") return String(c.getFullYear());
    return `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
  }, [view, cursor]);

  const clearFilters = () => { setQ(""); setFCat(""); setFScope(""); setFSource(""); setFStatus(""); };
  const hasFilters = q || fCat || fScope || fSource || fStatus;

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="calendar_events" title="Import calendar & timetable" hint="No timetable system? Bulk-add events and timetable entries from a CSV (dates as YYYY-MM-DD HH:MM)." />

      <div className="panel">
        <div className="cal-toolbar">
          <div className="cal-views">
            {VIEWS.map(([k, l]) => <button key={k} className={view === k ? "active" : ""} onClick={() => setView(k)}>{l}</button>)}
          </div>
          {view !== "table" && (
            <div className="cal-nav">
              <button className="secondary small" onClick={() => shift(-1)}>‹</button>
              <button className="secondary small" onClick={() => setCursor(new Date())}>Today</button>
              <button className="secondary small" onClick={() => shift(1)}>›</button>
            </div>
          )}
          <div className="cal-title">{view === "table" ? "All events" : rangeLabel}</div>
          <div style={{ flex: 1 }} />
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "New event"}</button>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <div style={{ flex: 2, minWidth: 180 }}><input placeholder="Search title, location, notes…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><select value={fCat} onChange={(e) => setFCat(e.target.value)}><option value="">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{CAT_LABEL[c]}</option>)}</select></div>
          <div><select value={fScope} onChange={(e) => setFScope(e.target.value)}><option value="">All audiences</option>{SCOPES.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
          <div><select value={fSource} onChange={(e) => setFSource(e.target.value)}><option value="">All sources</option><option value="manual">Manual</option><option value="import">Imported</option><option value="api">Integration (API)</option></select></div>
          <div><select value={fStatus} onChange={(e) => setFStatus(e.target.value)}><option value="">All statuses</option><option value="published">Published</option><option value="draft">Draft</option><option value="cancelled">Cancelled</option></select></div>
          {hasFilters ? <button className="secondary small" onClick={clearFilters}>Clear</button> : null}
          <span className="muted" style={{ fontSize: 12, alignSelf: "center" }}>{filtered.length} of {events.length}</span>
        </div>

        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}

        {showForm && (
          <form onSubmit={createEvent} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
            <EventFields form={form} setForm={setForm} />
            <button type="submit" style={{ marginTop: 14 }}>Create event</button>
          </form>
        )}
      </div>

      <div className="panel">
        {view === "month" && <MonthView cursor={cursor} events={filtered} onEvent={openDetail} onDay={(d) => { setCursor(d); setView("day"); }} />}
        {view === "week" && <WeekView cursor={cursor} events={filtered} onEvent={openDetail} />}
        {view === "day" && <DayView cursor={cursor} events={filtered} onEvent={openDetail} />}
        {view === "quarter" && <MiniMonths months={[0, 1, 2].map((i) => addMonths(new Date(cursor.getFullYear(), Math.floor(cursor.getMonth() / 3) * 3, 1), i))} events={filtered} onMonth={(d) => { setCursor(d); setView("month"); }} />}
        {view === "year" && <MiniMonths year months={Array.from({ length: 12 }, (_, i) => new Date(cursor.getFullYear(), i, 1))} events={filtered} onMonth={(d) => { setCursor(d); setView("month"); }} />}
        {view === "table" && (
          <TableView events={filtered} sortKey={sortKey} sortDir={sortDir}
            onSort={(k) => { if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1)); else { setSortKey(k); setSortDir(1); } }}
            onEvent={openDetail} onDelete={del} />
        )}
        <CatLegend events={filtered} />
      </div>

      <div className="panel">
        <h2>Homework</h2>
        <table>
          <thead><tr><th>Due</th><th>Title</th><th>Subject</th><th>Audience</th></tr></thead>
          <tbody>
            {homework.map((h) => (
              <tr key={h.id}><td className="mono muted">{new Date(h.dueAt).toLocaleDateString()}</td><td>{h.title}</td><td>{h.subject || "—"}</td><td>{h.yearGroup || "whole school"}</td></tr>
            ))}
            {homework.length === 0 && <tr><td colSpan={4} className="muted">No homework set.</td></tr>}
          </tbody>
        </table>
        <form onSubmit={addHomework} style={{ marginTop: 12 }}>
          <div className="row">
            <div style={{ flex: 2 }}><label>Title</label><input value={hw.title} onChange={(e) => setHw({ ...hw, title: e.target.value })} required /></div>
            <div><label>Subject</label><input value={hw.subject} onChange={(e) => setHw({ ...hw, subject: e.target.value })} /></div>
            <div><label>Due</label><input type="datetime-local" value={hw.dueAt} onChange={(e) => setHw({ ...hw, dueAt: e.target.value })} required /></div>
            <div><label>Year group (optional)</label><input value={hw.yearGroup} onChange={(e) => setHw({ ...hw, yearGroup: e.target.value })} /></div>
          </div>
          <button type="submit" style={{ marginTop: 12 }}>Add homework</button>
        </form>
      </div>

      {detail && (() => {
        const readOnly = (detail.source || "manual") === "api";
        const tabs = readOnly ? ["Details"] : ["Details", "Edit"];
        return (
          <DetailModal
            title={<span><span style={{ marginRight: 6 }}>{catIcon(detail.category)}</span>{detail.title}</span>}
            subtitle={<span>{CAT_LABEL[detail.category] || detail.category} · {new Date(detail.startsAt).toLocaleString([], { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })} · <SourceBadge src={detail.source} /></span>}
            onClose={() => setDetail(null)} tabs={tabs} active={dTab} onTab={setDTab}
          >
            {dTab === "Details" && (
              <div>
                {readOnly && <div className="notice info" style={{ marginBottom: 12 }}>This event is fed by an integration and is read-only here. Manage it in the source system.</div>}
                <table>
                  <tbody>
                    <tr><th style={{ width: 160 }}>When</th><td>{detail.allDay ? "All day · " : ""}{new Date(detail.startsAt).toLocaleString()}{detail.endsAt ? ` – ${new Date(detail.endsAt).toLocaleString()}` : ""}</td></tr>
                    {detail.location && <tr><th>Location</th><td>{detail.location}</td></tr>}
                    <tr><th>Audience</th><td>{detail.audienceScope}{detail.yearGroup ? ` · ${detail.yearGroup}` : ""}{detail.house ? ` · ${detail.house}` : ""}{detail.club ? ` · ${detail.club}` : ""}</td></tr>
                    <tr><th>Status</th><td><span className={`badge ${detail.status}`}>{detail.status}</span></td></tr>
                    {detail.description && <tr><th>Description</th><td>{detail.description}</td></tr>}
                    {detail.equipment && <tr><th>Equipment</th><td>{detail.equipment}</td></tr>}
                    {detail.clothing && <tr><th>Clothing</th><td>{detail.clothing}</td></tr>}
                    {(detail.collectionAt || detail.collectionLocation) && <tr><th>Collection</th><td>{detail.collectionAt ? new Date(detail.collectionAt).toLocaleString() : ""}{detail.collectionLocation ? ` · ${detail.collectionLocation}` : ""}</td></tr>}
                    {detail.paymentRef && <tr><th>Payment ref</th><td>{detail.paymentRef}</td></tr>}
                    <tr><th>Flags</th><td>{detail.consentRequired ? <span className="badge suspended">consent</span> : null} {detail.transportRequired ? <span className="badge trial">transport</span> : null} {detail.packedLunch ? <span className="badge role">packed lunch</span> : null} {!detail.consentRequired && !detail.transportRequired && !detail.packedLunch ? <span className="muted">—</span> : null}</td></tr>
                    {!detail._isHomework && !detail._isTimetable && (
                      <tr><th>Teacher in charge</th><td>{!parts || parts.loading ? <span className="muted">Loading…</span> : parts.staff.length === 0 ? <span className="muted">—</span> : parts.staff.map((s: any, i: number) => <span key={s.id || i}>{i > 0 ? ", " : ""}{s.name || "Staff"}</span>)}</td></tr>
                    )}
                    {!detail._isHomework && !detail._isTimetable && (
                      <tr><th>Students attending</th><td>
                        {!parts || parts.loading ? <span className="muted">Loading…</span> : parts.students.length === 0 ? <span className="muted">Whole {detail.audienceScope === "year" ? "year group" : detail.audienceScope === "class" ? "class" : "school"} — no named pupils</span> : (
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {parts.students.map((s: any, i: number) => (
                              <button key={s.id || i} className="chip" style={{ margin: 0 }} title="Open pupil profile" onClick={() => s.id && onOpenStudent?.(s.id)}>{s.name || "Pupil"}{s.medicalAlert ? " ⚕️" : ""}</button>
                            ))}
                          </div>
                        )}
                      </td></tr>
                    )}
                  </tbody>
                </table>
                <div className="chips" style={{ marginTop: 14 }}>
                  {!detail._isTrip && !detail._isHomework && !detail._isTimetable && <a className="chip" href={`/api/schools/${schoolId}/events/${detail.id}/ics`}>Download .ics</a>}
                  {detail._isTrip && <span className="muted" style={{ fontSize: 12 }}>This is a school trip — manage it in the Trips tab.</span>}
                  {detail._isHomework && <span className="muted" style={{ fontSize: 12 }}>This is a homework deadline — manage it in the Homework panel below the calendar.</span>}
                  {detail._isTimetable && <span className="muted" style={{ fontSize: 12 }}>This is a recurring timetable lesson — manage it in the Timetable section.</span>}
                  {!readOnly && <button className="danger small" onClick={() => del(detail.id)}>Delete event</button>}
                </div>
              </div>
            )}
            {dTab === "Edit" && editForm && (
              <form onSubmit={saveEdit} style={{ marginTop: 4 }}>
                <EventFields form={editForm} setForm={setEditForm} />
                <div className="chips" style={{ marginTop: 14 }}>
                  <button type="submit">Save changes</button>
                  <button type="button" className="danger small" onClick={() => del(detail.id)}>Delete</button>
                </div>
              </form>
            )}
          </DetailModal>
        );
      })()}
    </>
  );
}

// ---- views ----
function EventChip({ e, onEvent, showTime }: { e: any; onEvent: (e: any) => void; showTime?: boolean }) {
  const dim = e.status !== "published";
  return (
    <button className={`cal-ev${dim ? " dim" : ""}`} style={{ background: catColor(e.category) }} title={evTip(e)} onClick={() => onEvent(e)}>
      <span style={{ marginRight: 3 }}>{catIcon(e.category)}</span>{showTime ? `${timeLabel(e)} · ` : ""}{e.title}
    </button>
  );
}

function MonthView({ cursor, events, onEvent, onDay }: { cursor: Date; events: any[]; onEvent: (e: any) => void; onDay: (d: Date) => void }) {
  const cells = monthMatrix(cursor.getFullYear(), cursor.getMonth());
  const today = new Date();
  return (
    <div className="cal-grid">
      {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
      {cells.map((day, i) => {
        const dayEvents = events.filter((e) => eventOnDay(e, day)).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
        const other = day.getMonth() !== cursor.getMonth();
        return (
          <div key={i} className={`cal-cell${other ? " other" : ""}${sameDay(day, today) ? " today" : ""}`}>
            <button className="cal-daynum" style={{ background: "transparent", border: 0, cursor: "pointer" }} onClick={() => onDay(day)}>{day.getDate()}</button>
            {dayEvents.slice(0, 3).map((e) => <EventChip key={e.id} e={e} onEvent={onEvent} />)}
            {dayEvents.length > 3 && <button className="cal-more" onClick={() => onDay(day)}>+{dayEvents.length - 3} more</button>}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({ cursor, events, onEvent }: { cursor: Date; events: any[]; onEvent: (e: any) => void }) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const today = new Date();
  return (
    <div className="cal-week">
      {days.map((day, i) => {
        const dayEvents = events.filter((e) => eventOnDay(e, day)).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
        return (
          <div key={i} style={{ display: "contents" }}>
            <div className="cal-wk-label" style={sameDay(day, today) ? { color: "var(--brand-ink)" } : undefined}>{DOW[i]}<br />{day.getDate()}/{day.getMonth() + 1}</div>
            <div className="cal-wk-day">
              {dayEvents.length === 0 ? <span className="muted" style={{ fontSize: 12 }}>—</span> : dayEvents.map((e) => <EventChip key={e.id} e={e} onEvent={onEvent} showTime />)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DayView({ cursor, events, onEvent }: { cursor: Date; events: any[]; onEvent: (e: any) => void }) {
  const dayEvents = events.filter((e) => eventOnDay(e, cursor)).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  if (dayEvents.length === 0) return <p className="muted">No events on this day.</p>;
  return (
    <table>
      <thead><tr><th style={{ width: 120 }}>Time</th><th>Event</th><th>Audience</th><th>Flags</th></tr></thead>
      <tbody>
        {dayEvents.map((e) => (
          <tr key={e.id} style={{ cursor: "pointer", opacity: e.status !== "published" ? 0.6 : 1 }} onClick={() => onEvent(e)}>
            <td className="mono muted">{timeLabel(e)}</td>
            <td><span className="cal-dot" style={{ background: catColor(e.category) }} /><strong>{e.title}</strong> <span className="badge role">{CAT_LABEL[e.category] || e.category}</span><div className="muted" style={{ fontSize: 12 }}>{e.location || ""}</div></td>
            <td>{e.audienceScope}{e.yearGroup ? ` · ${e.yearGroup}` : ""}</td>
            <td>{e.consentRequired && <span className="badge suspended">consent</span>} {e.transportRequired && <span className="badge trial">transport</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MiniMonths({ months, events, onMonth, year }: { months: Date[]; events: any[]; onMonth: (d: Date) => void; year?: boolean }) {
  const today = new Date();
  return (
    <div className={`cal-mini${year ? " year" : ""}`}>
      {months.map((m, mi) => {
        const cells = monthMatrix(m.getFullYear(), m.getMonth());
        const monthCount = events.filter((e) => { const s = new Date(e.startsAt); return s.getFullYear() === m.getFullYear() && s.getMonth() === m.getMonth(); }).length;
        return (
          <div key={mi} className="cal-mini-card">
            <div className="cal-mini-hdr">
              <h4>{MONTHS[m.getMonth()]} {m.getFullYear()}</h4>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {monthCount > 0 ? <span className="cal-mini-count" title={`${monthCount} item(s) this month`}>{monthCount}</span> : null}
                <button className="linklike" style={{ fontSize: 11 }} onClick={() => onMonth(m)}>Open</button>
              </div>
            </div>
            <div className="cal-mini-grid">
              {DOW.map((d) => <div key={d} className="cal-mini-d head muted" style={{ fontWeight: 700 }}>{d[0]}</div>)}
              {cells.map((day, i) => {
                const has = events.some((e) => eventOnDay(e, day));
                const other = day.getMonth() !== m.getMonth();
                return <div key={i} onClick={has && !other ? () => onMonth(m) : undefined} className={`cal-mini-d${other ? " other" : ""}${sameDay(day, today) ? " today" : ""}${has && !other ? " has" : ""}`} title={has ? "Has events — open month" : ""}>{day.getDate()}</div>;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TableView({ events, sortKey, sortDir, onSort, onEvent, onDelete }: { events: any[]; sortKey: string; sortDir: 1 | -1; onSort: (k: string) => void; onEvent: (e: any) => void; onDelete: (id: string) => void }) {
  const sorted = [...events].sort((a, b) => {
    let av: any, bv: any;
    if (sortKey === "startsAt") { av = +new Date(a.startsAt); bv = +new Date(b.startsAt); }
    else { av = (a[sortKey] || "").toString().toLowerCase(); bv = (b[sortKey] || "").toString().toLowerCase(); }
    return (av < bv ? -1 : av > bv ? 1 : 0) * sortDir;
  });
  const arrow = (k: string) => sortKey === k ? (sortDir === 1 ? " ▲" : " ▼") : "";
  const th = (k: string, label: string) => <th style={{ cursor: "pointer" }} onClick={() => onSort(k)}>{label}{arrow(k)}</th>;
  return (
    <table>
      <thead><tr>{th("startsAt", "When")}{th("title", "Event")}{th("category", "Category")}{th("audienceScope", "Audience")}{th("status", "Status")}<th>Source</th><th className="right"></th></tr></thead>
      <tbody>
        {sorted.map((e) => (
          <tr key={e.id}>
            <td className="mono muted" style={{ whiteSpace: "nowrap" }}>{new Date(e.startsAt).toLocaleString([], { day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" })}</td>
            <td><button className="linklike" onClick={() => onEvent(e)}><span className="cal-dot" style={{ background: catColor(e.category) }} /><strong>{e.title}</strong></button><div className="muted" style={{ fontSize: 12 }}>{e.location || ""}</div></td>
            <td>{CAT_LABEL[e.category] || e.category}</td>
            <td>{e.audienceScope}{e.yearGroup ? ` · ${e.yearGroup}` : ""}</td>
            <td><span className={`badge ${e.status}`}>{e.status}</span></td>
            <td><SourceBadge src={e.source} /></td>
            <td className="right">
              <Kebab items={[
                { label: "View / edit", onClick: () => onEvent(e) },
                (e.source || "manual") !== "api" ? { label: "Delete", onClick: () => onDelete(e.id), danger: true } : null,
              ]} />
            </td>
          </tr>
        ))}
        {sorted.length === 0 && <tr><td colSpan={7} className="muted">No events match your filters.</td></tr>}
      </tbody>
    </table>
  );
}

function CatLegend({ events }: { events: any[] }) {
  const cats = Array.from(new Set(events.map((e) => e.category)));
  if (cats.length === 0) return null;
  return (
    <div className="cal-legend">
      {cats.map((c) => <span key={c}><span className="cal-dot" style={{ background: catColor(c) }} />{CAT_LABEL[c] || c}</span>)}
    </div>
  );
}

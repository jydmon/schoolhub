"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const addMonths = (d: Date, n: number) => { const x = new Date(d); x.setDate(1); x.setMonth(x.getMonth() + n); return x; };
const startOfWeek = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const startOfQuarter = (d: Date) => new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1);
const sameDay = (a: Date, b: Date) => ymd(a) === ymd(b);
const monthMatrix = (y: number, m: number) => { const start = startOfWeek(new Date(y, m, 1)); return Array.from({ length: 42 }, (_, i) => addDays(start, i)); };
const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const TYPE_COLOR: Record<string, string> = { event: "#4338ca", trip: "#0891b2", homework: "#0f766e", timetable: "#7c3aed" };
const CAT_COLOR: Record<string, string> = {
  academic: "#4f46e5", term: "#0ea5e9", holiday: "#12a150", inset: "#64748b", exam: "#e11d48", parents_evening: "#7c3aed",
  sports_day: "#d97706", trip: "#0891b2", assembly: "#2563eb", club: "#059669", performance: "#db2777", photos: "#9333ea",
  fundraiser: "#ca8a04", early_closure: "#dc2626", timetable_change: "#475569", event: "#4338ca", homework: "#0f766e", timetable: "#7c3aed",
};
const color = (it: any) => CAT_COLOR[it.category] || TYPE_COLOR[it.type] || "#4338ca";
const TYPE_ICON: Record<string, string> = { event: "📌", trip: "🧳", homework: "📚", timetable: "🗓️" };
const CAT_ICON: Record<string, string> = { holiday: "🏖️", exam: "📝", assembly: "🎤", sports_day: "🏅", parents_evening: "👪", club: "⚽" };
const icon = (it: any) => CAT_ICON[it.category] || TYPE_ICON[it.type] || "📌";
const time = (it: any) => it.allDay ? "All day" : new Date(it.startsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const tip = (it: any) => `${it.title} · ${time(it)}${it.location ? ` · ${it.location}` : ""}${it.schoolName ? ` · ${it.schoolName}` : ""}`;

type View = "day" | "week" | "month" | "quarter" | "year" | "list";

// Self-contained styling so the calendar reads clearly regardless of theme CSS.
const S: Record<string, React.CSSProperties> = {
  viewBtns: { display: "flex", gap: 6, flexWrap: "wrap" },
  navBtn: { border: "1px solid #e2e8f0", background: "#fff", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#334155" },
  navBtnOn: { border: "1px solid #4f46e5", background: "#4f46e5", color: "#fff", borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 13, fontWeight: 700 },
  grid: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6, marginTop: 4 },
  dow: { textAlign: "center", fontSize: 11, fontWeight: 700, color: "#64748b", padding: "4px 0" },
  cell: { minHeight: 98, border: "1px solid #e9edf4", borderRadius: 10, padding: 6, background: "#fff", display: "flex", flexDirection: "column", gap: 3, overflow: "hidden" },
  cellOther: { background: "#f8fafc" },
  cellToday: { borderColor: "#4f46e5", boxShadow: "inset 0 0 0 1px #4f46e5" },
  daynum: { alignSelf: "flex-end", fontSize: 12, color: "#475569", cursor: "pointer", fontWeight: 600 },
  ev: { display: "block", width: "100%", textAlign: "left", color: "#fff", border: "none", borderRadius: 6, padding: "3px 6px", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  overlay: { position: "fixed", inset: 0, background: "rgba(15,23,41,0.5)", zIndex: 200, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: 24, overflowY: "auto" },
  modal: { background: "#fff", borderRadius: 16, maxWidth: 520, width: "94%", padding: 20 },
};

export default function ParentCalendar({ children, schools }: { children: { id: string; name: string; schoolId?: string }[]; schools: { id: string; name: string }[] }) {
  const [view, setView] = useState<View>("month");
  const [cursor, setCursor] = useState<Date>(() => new Date());
  const [rangeFrom, setRangeFrom] = useState("");
  const [rangeTo, setRangeTo] = useState("");
  const [items, setItems] = useState<any[]>([]);
  const [detail, setDetail] = useState<any>(null);
  const [fChild, setFChild] = useState("all");
  const [fSchool, setFSchool] = useState("all");
  const [fType, setFType] = useState("all");

  const window = useMemo(() => {
    if (view === "day") { const s = new Date(cursor); s.setHours(0, 0, 0, 0); return { from: addDays(s, -1), to: addDays(s, 2) }; }
    if (view === "week") { const s = startOfWeek(cursor); return { from: addDays(s, -1), to: addDays(s, 8) }; }
    if (view === "month") { const m0 = new Date(cursor.getFullYear(), cursor.getMonth(), 1); return { from: addDays(startOfWeek(m0), -1), to: addDays(startOfWeek(addMonths(m0, 1)), 7) }; }
    if (view === "quarter") { const q = startOfQuarter(cursor); return { from: addDays(q, -7), to: addMonths(q, 3) }; }
    if (view === "year") { return { from: new Date(cursor.getFullYear(), 0, 1), to: new Date(cursor.getFullYear() + 1, 0, 1) }; }
    const from = rangeFrom ? new Date(rangeFrom) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const to = rangeTo ? new Date(`${rangeTo}T23:59:59`) : addMonths(from, 3);
    return { from, to };
  }, [view, cursor, rangeFrom, rangeTo]);

  const load = useCallback(async () => {
    const d = await fetch(`/api/parent/calendar/items?from=${window.from.toISOString()}&to=${window.to.toISOString()}`).then((r) => r.json());
    setItems(d.items ?? []);
  }, [window.from, window.to]);
  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => items.filter((it) => {
    if (fChild !== "all" && !(it.childIds || []).includes(fChild)) return false;
    if (fSchool !== "all" && it.schoolId !== fSchool) return false;
    if (fType !== "all" && it.type !== fType) return false;
    return true;
  }), [items, fChild, fSchool, fType]);

  const onDay = useCallback((day: Date) => filtered.filter((it) => {
    const s = new Date(it.startsAt); const e = it.endsAt ? new Date(it.endsAt) : s;
    return ymd(s) <= ymd(day) && ymd(day) <= ymd(e);
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt)), [filtered]);

  // Upcoming homework — pinned at the top of the calendar page.
  const homework = useMemo(() => filtered.filter((it) => it.type === "homework")
    .filter((it) => new Date(it.startsAt) >= new Date(new Date().setHours(0, 0, 0, 0)))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt)).slice(0, 8), [filtered]);

  const today = new Date();
  const nav = (dir: number) => {
    if (view === "day") setCursor((c) => addDays(c, dir));
    else if (view === "week") setCursor((c) => addDays(c, dir * 7));
    else if (view === "month") setCursor((c) => addMonths(c, dir));
    else if (view === "quarter") setCursor((c) => addMonths(c, dir * 3));
    else if (view === "year") setCursor((c) => new Date(c.getFullYear() + dir, c.getMonth(), 1));
  };
  const drill = (day: Date) => { setCursor(day); setView("day"); };

  const label = view === "day" ? cursor.toLocaleDateString([], { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : view === "week" ? `Week of ${startOfWeek(cursor).toLocaleDateString([], { day: "numeric", month: "short" })}`
    : view === "month" ? `${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`
    : view === "quarter" ? `Q${Math.floor(cursor.getMonth() / 3) + 1} ${cursor.getFullYear()}`
    : view === "year" ? `${cursor.getFullYear()}` : "Upcoming";

  const chip = (it: any) => (
    <button key={it.id} style={{ ...S.ev, background: color(it) }} title={tip(it)} onClick={() => setDetail(it)}>{icon(it)} {it.title}</button>
  );

  return (
    <div id="p-calendar">
      {/* Homework pinned to the top of the calendar page */}
      {homework.length > 0 && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>📚 Upcoming homework</h2>
          <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
            {homework.map((it) => (
              <button key={it.id} onClick={() => setDetail(it)} title={tip(it)} style={{ display: "flex", gap: 10, alignItems: "center", width: "100%", textAlign: "left", border: "1px solid #e9edf4", borderLeft: "4px solid #0f766e", borderRadius: 10, padding: "8px 12px", background: "#fff", cursor: "pointer" }}>
                <span style={{ fontSize: 12, color: "#64748b", minWidth: 96 }}>{new Date(it.startsAt).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })}</span>
                <span style={{ flex: 1, fontWeight: 600, color: "#0f172a" }}>{it.title}</span>
                {it.childNames?.length ? <span style={{ fontSize: 11, color: "#64748b" }}>{Array.from(new Set(it.childNames)).join(", ")}</span> : null}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={S.viewBtns}>
            {(["day", "week", "month", "quarter", "year", "list"] as View[]).map((v) => (
              <button key={v} style={view === v ? S.navBtnOn : S.navBtn} onClick={() => setView(v)}>{v[0].toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          {view !== "list" && (
            <div style={{ display: "flex", gap: 6 }}>
              <button style={S.navBtn} onClick={() => nav(-1)}>‹</button>
              <button style={S.navBtn} onClick={() => setCursor(new Date())}>Today</button>
              <button style={S.navBtn} onClick={() => nav(1)}>›</button>
            </div>
          )}
          <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", marginLeft: "auto" }}>{label}</div>
        </div>

        <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: "wrap" }}>
          <div><label>Child</label><select value={fChild} onChange={(e) => setFChild(e.target.value)}><option value="all">All children</option>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          {schools.length > 1 && <div><label>School</label><select value={fSchool} onChange={(e) => setFSchool(e.target.value)}><option value="all">All schools</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
          <div><label>Type</label><select value={fType} onChange={(e) => setFType(e.target.value)}><option value="all">All types</option><option value="event">Events</option><option value="trip">Trips</option><option value="homework">Homework</option><option value="timetable">Timetable</option></select></div>
          {view === "list" && <>
            <div><label>From</label><input type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} /></div>
            <div><label>To</label><input type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} /></div>
          </>}
          <div style={{ display: "flex", alignItems: "flex-end", marginLeft: "auto" }}><span className="muted" style={{ fontSize: 12 }}>{filtered.length} item(s)</span></div>
        </div>

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 10, fontSize: 12, color: "#64748b" }}>
          {[["event", "Events"], ["trip", "Trips"], ["homework", "Homework"], ["timetable", "Timetable"]].map(([k, l]) => (
            <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: TYPE_COLOR[k] }} />{l}</span>
          ))}
        </div>
      </div>

      <div className="panel">
        {view === "day" && (
          <div>
            {onDay(cursor).length === 0 ? <p className="muted">Nothing scheduled on this day.</p> :
              onDay(cursor).map((it) => (
                <button key={it.id} onClick={() => setDetail(it)} title={tip(it)} style={{ display: "flex", gap: 10, width: "100%", textAlign: "left", alignItems: "flex-start", border: "1px solid #e9edf4", borderLeft: `4px solid ${color(it)}`, borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: "#fff", cursor: "pointer" }}>
                  <span style={{ fontSize: 12, color: "#64748b", minWidth: 74 }}>{time(it)}</span>
                  <span style={{ flex: 1 }}><strong>{icon(it)} {it.title}</strong><div style={{ fontSize: 12, color: "#64748b" }}>{[it.location, Array.from(new Set(it.childNames)).join(", "), schools.length > 1 ? it.schoolName : ""].filter(Boolean).join(" · ")}</div></span>
                  <span className="badge role">{it.type}</span>
                </button>
              ))}
          </div>
        )}

        {view === "week" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 8 }}>
            {Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cursor), i)).map((day, i) => (
              <div key={i} style={{ border: "1px solid #e9edf4", borderRadius: 10, minHeight: 150, padding: 6, background: sameDay(day, today) ? "#eef2ff" : "#fff" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b" }}>{DOW[i]} {day.getDate()}</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 4 }}>{onDay(day).map((it) => chip(it))}</div>
              </div>
            ))}
          </div>
        )}

        {view === "month" && (
          <div style={S.grid}>
            {DOW.map((d) => <div key={d} style={S.dow}>{d}</div>)}
            {monthMatrix(cursor.getFullYear(), cursor.getMonth()).map((day, i) => {
              const de = onDay(day); const other = day.getMonth() !== cursor.getMonth();
              return (
                <div key={i} style={{ ...S.cell, ...(other ? S.cellOther : {}), ...(sameDay(day, today) ? S.cellToday : {}) }}>
                  <span style={S.daynum} onClick={() => drill(day)}>{day.getDate()}</span>
                  {de.slice(0, 4).map((it) => chip(it))}
                  {de.length > 4 && <button onClick={() => drill(day)} style={{ background: "none", border: "none", cursor: "pointer", color: "#64748b", fontSize: 11, textAlign: "left" }}>+{de.length - 4} more</button>}
                </div>
              );
            })}
          </div>
        )}

        {view === "quarter" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: 14 }}>
            {[0, 1, 2].map((q) => { const m = startOfQuarter(cursor).getMonth() + q; const y = cursor.getFullYear() + Math.floor(m / 12); return <MiniMonth key={q} year={y} month={m % 12} onDay={onDay} onPick={drill} today={today} />; })}
          </div>
        )}

        {view === "year" && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))", gap: 14 }}>
            {Array.from({ length: 12 }, (_, m) => <MiniMonth key={m} year={cursor.getFullYear()} month={m} onDay={onDay} onPick={drill} today={today} />)}
          </div>
        )}

        {view === "list" && (
          <table>
            <thead><tr><th>When</th><th>What</th><th>Child</th>{schools.length > 1 && <th>School</th>}<th></th></tr></thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} style={{ cursor: "pointer" }} onClick={() => setDetail(it)} title={tip(it)}>
                  <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{new Date(it.startsAt).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" })} · {time(it)}</td>
                  <td><span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, background: color(it), marginRight: 6 }} />{icon(it)} <strong>{it.title}</strong><div className="muted" style={{ fontSize: 11 }}>{it.location || it.description || ""}</div></td>
                  <td className="muted">{Array.from(new Set(it.childNames)).join(", ")}</td>
                  {schools.length > 1 && <td className="muted">{it.schoolName}</td>}
                  <td className="right"><span className="badge role">{it.type}</span></td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={schools.length > 1 ? 5 : 4} className="muted">Nothing scheduled in this window.</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <div style={S.overlay} onClick={() => setDetail(null)}>
          <div style={S.modal} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}>
              <div><h2 style={{ margin: 0 }}>{icon(detail)} {detail.title}</h2><div className="muted" style={{ fontSize: 13 }}>{detail.type} · {new Date(detail.startsAt).toLocaleString()}</div></div>
              <button style={S.navBtn} onClick={() => setDetail(null)}>Close</button>
            </div>
            <table style={{ marginTop: 12 }}><tbody>
              <tr><th style={{ width: 130 }}>For</th><td>{Array.from(new Set(detail.childNames)).join(", ")}</td></tr>
              <tr><th>School</th><td>{detail.schoolName}</td></tr>
              {detail.location && <tr><th>Location</th><td>{detail.location}</td></tr>}
              <tr><th>When</th><td>{detail.allDay ? "All day · " : ""}{new Date(detail.startsAt).toLocaleString()}{detail.endsAt ? ` – ${new Date(detail.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}</td></tr>
              {detail.description && <tr><th>Details</th><td>{detail.description}</td></tr>}
            </tbody></table>
          </div>
        </div>
      )}
    </div>
  );
}

function MiniMonth({ year, month, onDay, onPick, today }: { year: number; month: number; onDay: (d: Date) => any[]; onPick: (d: Date) => void; today: Date }) {
  const cells = monthMatrix(year, month);
  return (
    <div style={{ border: "1px solid #e9edf4", borderRadius: 12, padding: 10, background: "#fff" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>{MONTHS[month]} {year}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
        {DOW.map((d) => <div key={d} style={{ fontSize: 9, textAlign: "center", color: "#94a3b8" }}>{d[0]}</div>)}
        {cells.map((day, i) => {
          const de = onDay(day); const other = day.getMonth() !== month; const has = de.length > 0;
          return (
            <button key={i} onClick={() => onPick(day)} title={has ? `${de.length} item(s) — ${de.map((x) => x.title).slice(0, 4).join(", ")}` : day.toLocaleDateString()}
              style={{ aspectRatio: "1", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 10, position: "relative", background: sameDay(day, today) ? "#4f46e5" : has ? "#eef2ff" : "transparent", color: sameDay(day, today) ? "#fff" : other ? "#cbd5e1" : "#0f172a" }}>
              {day.getDate()}
              {has && !sameDay(day, today) ? <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 2, background: color(de[0]) }} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

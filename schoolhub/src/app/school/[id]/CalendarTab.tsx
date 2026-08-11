"use client";

import { useEffect, useState, useCallback } from "react";

const CATEGORIES = ["academic", "term", "holiday", "inset", "exam", "parents_evening", "sports_day", "trip", "assembly", "club", "performance", "photos", "fundraiser", "early_closure", "timetable_change", "event"];
const CAT_LABEL: Record<string, string> = {
  academic: "Academic", term: "Term date", holiday: "Holiday", inset: "INSET day", exam: "Exam",
  parents_evening: "Parents' evening", sports_day: "Sports day", trip: "School trip", assembly: "Assembly",
  club: "Club", performance: "Performance", photos: "School photographs", fundraiser: "Fundraiser",
  early_closure: "Early closure", timetable_change: "Timetable change", event: "Event",
};
const SCOPES = ["school", "year", "class", "house", "club", "students"];

function blankEvent() {
  return {
    title: "", description: "", category: "event", startsAt: "", endsAt: "", allDay: false, location: "",
    audienceScope: "school", yearGroup: "", className: "", house: "", club: "",
    equipment: "", clothing: "", packedLunch: false, transportRequired: false, collectionAt: "", collectionLocation: "",
    consentRequired: false, paymentRef: "", status: "published", reminders: { 1440: false, 60: false, 15: false },
  };
}

export default function CalendarTab({ schoolId }: { schoolId: string }) {
  const [events, setEvents] = useState<any[]>([]);
  const [homework, setHomework] = useState<any[]>([]);
  const [form, setForm] = useState<any>(blankEvent());
  const [hw, setHw] = useState({ title: "", subject: "", dueAt: "", yearGroup: "", className: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    const [e, h] = await Promise.all([
      fetch(`/api/schools/${schoolId}/events`).then((r) => r.json()),
      fetch(`/api/schools/${schoolId}/homework`).then((r) => r.json()),
    ]);
    setEvents(e.events ?? []);
    setHomework(h.homework ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function createEvent(ev: React.FormEvent) {
    ev.preventDefault(); setMsg(null);
    const reminderOffsets = Object.entries(form.reminders).filter(([, v]) => v).map(([k]) => Number(k));
    const body: any = {
      title: form.title, description: form.description || undefined, category: form.category,
      startsAt: form.startsAt, endsAt: form.endsAt || undefined, allDay: form.allDay, location: form.location || undefined,
      audienceScope: form.audienceScope, yearGroup: form.yearGroup || undefined, classId: undefined, house: form.house || undefined, club: form.club || undefined,
      equipment: form.equipment || undefined, clothing: form.clothing || undefined, packedLunch: form.packedLunch, transportRequired: form.transportRequired,
      collectionAt: form.collectionAt || undefined, collectionLocation: form.collectionLocation || undefined,
      consentRequired: form.consentRequired, paymentRef: form.paymentRef || undefined, status: form.status, reminderOffsets,
    };
    const res = await fetch(`/api/schools/${schoolId}/events`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed to create event" }); return; }
    setMsg({ kind: "ok", text: "Event created." }); setForm(blankEvent()); setShowForm(false); load();
  }
  async function del(id: string) { await fetch(`/api/schools/${schoolId}/events/${id}`, { method: "DELETE" }); load(); }

  async function addHomework(ev: React.FormEvent) {
    ev.preventDefault();
    const res = await fetch(`/api/schools/${schoolId}/homework`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: hw.title, subject: hw.subject || undefined, dueAt: hw.dueAt, yearGroup: hw.yearGroup || undefined }) });
    const d = await res.json();
    if (res.ok && !d.error) { setHw({ title: "", subject: "", dueAt: "", yearGroup: "", className: "" }); load(); }
  }

  return (
    <>
      <div className="panel">
        <div className="flex-between">
          <div><h2>School calendar</h2><p className="sub" style={{ marginBottom: 0 }}>{events.length} event(s)</p></div>
          <button onClick={() => setShowForm((v) => !v)}>{showForm ? "Close" : "New event"}</button>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 12 }}>{msg.text}</div>}
        {showForm && (
          <form onSubmit={createEvent} style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 14 }}>
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
              {(form.audienceScope === "club") && <div><label>Club</label><input value={form.club} onChange={(e) => setForm({ ...form, club: e.target.value })} /></div>}
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
            <button type="submit" style={{ marginTop: 14 }}>Create event</button>
          </form>
        )}
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>When</th><th>Event</th><th>Audience</th><th>Flags</th><th className="right"></th></tr></thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="mono muted">{new Date(e.startsAt).toLocaleString([], { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                <td><strong>{e.title}</strong> <span className="badge role">{CAT_LABEL[e.category] || e.category}</span>{e.status !== "published" && <span className="badge trial"> {e.status}</span>}<div className="muted" style={{ fontSize: 12 }}>{e.location || ""}</div></td>
                <td>{e.audienceScope}{e.yearGroup ? ` · ${e.yearGroup}` : ""}{e.house ? ` · ${e.house}` : ""}</td>
                <td>{e.consentRequired && <span className="badge suspended">consent</span>} {e.transportRequired && <span className="badge trial">transport</span>}</td>
                <td className="right"><button className="danger small" onClick={() => del(e.id)}>Delete</button></td>
              </tr>
            ))}
            {events.length === 0 && <tr><td colSpan={5} className="muted">No events yet.</td></tr>}
          </tbody>
        </table>
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
    </>
  );
}

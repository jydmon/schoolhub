"use client";

import { useEffect, useState, useCallback } from "react";
import { useSel, useSort, SortTh, Kebab, SourceBadge, DetailModal } from "./EntityKit";
import ModuleImportCard from "./ModuleImportCard";

const CATEGORIES = ["sport", "music", "arts", "drama", "academic", "stem", "wellbeing", "general"];
const CADENCES = ["daily", "weekly", "monthly", "annual", "adhoc"];
const DAYS = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const ATT = ["present", "absent", "late", "excused"];
const gbp = (pence: number) => (pence ? `£${(pence / 100).toFixed(2)}` : "Free");
const editable = (c: any) => (c.source ?? "manual") !== "api";
const CAT_ICON: Record<string, string> = { sport: "⚽", music: "🎵", arts: "🎨", drama: "🎭", academic: "📘", stem: "🔬", wellbeing: "🧘", general: "🏫" };

const BLANK = { name: "", category: "general", description: "", location: "", cadence: "weekly", dayOfWeek: "", startTime: "", endTime: "", yearGroup: "", capacity: "", cost: "", staffLead: "" };

export default function ClubsTab({ schoolId }: { schoolId: string }) {
  const [clubs, setClubs] = useState<any[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [catF, setCatF] = useState("all");
  const [statusF, setStatusF] = useState("active");
  const [showAdd, setShowAdd] = useState(false);
  const [f, setF] = useState<any>({ ...BLANK });
  const [detail, setDetail] = useState<any | null>(null);
  const [detailTab, setDetailTab] = useState("Roster");
  const sel = useSel();
  const srt = useSort("day");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/clubs`).then((r) => r.json());
    setClubs(d.clubs ?? []); sel.clear();
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);
  useEffect(() => { fetch(`/api/schools/${schoolId}/students`).then((r) => r.json()).then((d) => setStudents(d.students ?? d.items ?? [])).catch(() => {}); }, [schoolId]);

  const filtered = clubs.filter((c) => {
    if (statusF !== "all" && c.status !== statusF) return false;
    if (catF !== "all" && c.category !== catF) return false;
    const s = q.trim().toLowerCase();
    if (s && ![c.name, c.category, c.location, c.staffLead, c.yearGroup, c.dayOfWeek].some((v) => String(v ?? "").toLowerCase().includes(s))) return false;
    return true;
  });
  const dayIdx: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const view = srt.sort(filtered, (c, k) =>
    k === "name" ? String(c.name).toLowerCase() : k === "day" ? (dayIdx[c.dayOfWeek] ?? 9) : k === "cat" ? c.category : k === "members" ? c.memberCount : k === "cost" ? c.cost : "");
  const allOn = view.length > 0 && view.every((c) => sel.on(c.id));

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/clubs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Could not create club" }); return; }
    setMsg({ kind: "ok", text: "Club created." }); setF({ ...BLANK }); setShowAdd(false); load();
  }
  async function patch(body: any) {
    const res = await fetch(`/api/schools/${schoolId}/clubs`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({})); if (!res.ok || d.error) setMsg({ kind: "err", text: d.error || "Failed" }); return d;
  }
  async function toggleStatus(c: any) { await patch({ id: c.id, status: c.status === "archived" ? "active" : "archived" }); load(); if (detail?.id === c.id) openDetail(c.id); }
  async function del(c: any) { const res = await fetch(`/api/schools/${schoolId}/clubs?id=${c.id}`, { method: "DELETE" }); const d = await res.json().catch(() => ({})); if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; } setMsg({ kind: "ok", text: "Club deleted." }); setDetail(null); load(); }
  async function bulkArchive() { let n = 0; for (const id of sel.ids) { const c = clubs.find((x) => x.id === id); if (!c || !editable(c)) continue; await patch({ id, status: "archived" }); n++; } sel.clear(); load(); setMsg({ kind: "ok", text: `Archived ${n} club(s).` }); }

  async function openDetail(id: string) {
    const d = await fetch(`/api/schools/${schoolId}/clubs?clubId=${id}`).then((r) => r.json());
    if (d.club) { setDetail(d.club); setDetailTab("Roster"); }
  }

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="clubs_activities" title="Import clubs & activities" hint="Download the sample template (CSV or Excel), fill it in and upload. Files are validated against the template and clubs are matched by name." onImported={load} />
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>Clubs &amp; activities</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Extracurricular clubs, their members and the attendance register. Parents see only the clubs their own child belongs to. Add manually or bulk-import above.</p></div>
          <div style={{ display: "flex", gap: 8 }}><button onClick={() => { setF({ ...BLANK }); setShowAdd(true); setMsg(null); }}>New club</button></div>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
          <input placeholder="Search clubs…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 220 }} />
          <select value={catF} onChange={(e) => setCatF(e.target.value)} style={{ width: "auto" }}><option value="all">All categories</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}</select>
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} style={{ width: "auto" }}><option value="active">Active</option><option value="archived">Archived</option><option value="all">All</option></select>
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{view.length === clubs.length ? `${clubs.length} club${clubs.length === 1 ? "" : "s"}` : `${view.length} of ${clubs.length}`}</span>
        </div>

        {sel.ids.length > 0 && <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="danger small" onClick={bulkArchive}>Archive</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>}

        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((c) => c.id), e.target.checked)} aria-label="Select all" /></th>
            <SortTh k="name" label="Club" sort={srt} /><SortTh k="cat" label="Category" sort={srt} /><SortTh k="day" label="When" sort={srt} /><th>Year</th><SortTh k="members" label="Members" sort={srt} /><SortTh k="cost" label="Cost" sort={srt} /><th>Status</th><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((c) => (
              <tr key={c.id} style={{ opacity: c.status === "archived" ? 0.55 : 1 }}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(c.id)} onChange={() => sel.toggle(c.id)} /></td>
                <td><button className="linklike" onClick={() => openDetail(c.id)}><strong>{CAT_ICON[c.category] || "🏫"} {c.name}</strong></button>{c.staffLead ? <div className="muted" style={{ fontSize: 11 }}>Led by {c.staffLead}</div> : null}</td>
                <td className="muted" style={{ textTransform: "capitalize" }}>{c.category}</td>
                <td className="muted">{c.cadence === "weekly" && c.dayOfWeek ? c.dayOfWeek : c.cadence}{c.startTime ? ` · ${c.startTime}${c.endTime ? "–" + c.endTime : ""}` : ""}</td>
                <td className="muted">{c.yearGroup || "All"}</td>
                <td>{c.memberCount}{c.capacity ? <span className="muted"> / {c.capacity}</span> : null}{c.waitlistCount ? <span className="badge trial" style={{ marginLeft: 6 }}>{c.waitlistCount} wait</span> : null}</td>
                <td>{gbp(c.cost)}</td>
                <td>{c.status === "archived" ? <span className="badge archived">archived</span> : <span className="badge active">active</span>}</td>
                <td><SourceBadge src={c.source} /></td>
                <td className="right"><Kebab items={[
                  { label: "Open / manage", onClick: () => openDetail(c.id) },
                  editable(c) ? { label: c.status === "archived" ? "Restore" : "Archive", onClick: () => toggleStatus(c) } : null,
                  editable(c) ? { label: "Delete", onClick: () => del(c), danger: true } : null,
                ]} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={10} className="muted">{clubs.length ? "No clubs match your filter." : "No clubs yet — add one or import a CSV."}</td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 680, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>New club</h2><button className="secondary small" onClick={() => setShowAdd(false)}>Close</button></div>
            {msg && msg.kind === "err" && <div className="notice err" style={{ marginTop: 10 }}>{msg.text}</div>}
            <form onSubmit={add} style={{ marginTop: 12 }}>
              <div className="row">
                <div style={{ flex: 2 }}><label>Club name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required placeholder="Football Club" /></div>
                <div><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
              </div>
              <div className="row">
                <div><label>Frequency</label><select value={f.cadence} onChange={(e) => setF({ ...f, cadence: e.target.value })}>{CADENCES.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label>Day</label><select value={f.dayOfWeek} onChange={(e) => setF({ ...f, dayOfWeek: e.target.value })}>{DAYS.map((d) => <option key={d} value={d}>{d || "—"}</option>)}</select></div>
                <div><label>Start</label><input type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></div>
                <div><label>End</label><input type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></div>
              </div>
              <div className="row">
                <div><label>Year / group (blank = all)</label><input value={f.yearGroup} onChange={(e) => setF({ ...f, yearGroup: e.target.value })} placeholder="Year 5" /></div>
                <div><label>Location</label><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} placeholder="Main hall" /></div>
                <div><label>Capacity</label><input value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} placeholder="20" /></div>
                <div><label>Cost (£)</label><input value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} placeholder="0.00" /></div>
              </div>
              <div className="row">
                <div style={{ flex: 2 }}><label>Staff lead</label><input value={f.staffLead} onChange={(e) => setF({ ...f, staffLead: e.target.value })} placeholder="Ms Carter" /></div>
              </div>
              <label>Description</label>
              <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="What the club does, kit needed, etc." />
              <button type="submit" style={{ marginTop: 14 }}>Create club</button>
            </form>
          </div>
        </div>
      )}

      {detail && (
        <DetailModal
          title={<>{CAT_ICON[detail.category] || "🏫"} {detail.name}</>}
          subtitle={<>{detail.cadence}{detail.dayOfWeek ? ` · ${detail.dayOfWeek}` : ""}{detail.startTime ? ` · ${detail.startTime}${detail.endTime ? "–" + detail.endTime : ""}` : ""} · {gbp(detail.cost)} · <SourceBadge src={detail.source} /></>}
          tabs={["Roster", "Register", "Details"]} active={detailTab} onTab={setDetailTab}
          onClose={() => setDetail(null)}
        >
          {detailTab === "Roster" && <Roster schoolId={schoolId} club={detail} students={students} onChange={() => openDetail(detail.id)} />}
          {detailTab === "Register" && <Register schoolId={schoolId} club={detail} onDone={() => openDetail(detail.id)} />}
          {detailTab === "Details" && (
            <div style={{ marginTop: 10 }}>
              <p>{detail.description || <span className="muted">No description.</span>}</p>
              <div className="row" style={{ marginTop: 8 }}>
                <div className="stat"><div className="n" style={{ fontSize: 18 }}>{detail.members?.length ?? 0}</div><div className="l">Members</div></div>
                <div className="stat"><div className="n" style={{ fontSize: 18 }}>{detail.sessions?.length ?? 0}</div><div className="l">Sessions logged</div></div>
                <div className="stat"><div className="n" style={{ fontSize: 16 }}>{detail.location || "—"}</div><div className="l">Location</div></div>
                <div className="stat"><div className="n" style={{ fontSize: 16 }}>{detail.yearGroup || "All years"}</div><div className="l">Eligibility</div></div>
              </div>
            </div>
          )}
        </DetailModal>
      )}
    </>
  );
}

function Roster({ schoolId, club, students, onChange }: any) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const memberIds = new Set((club.members || []).map((m: any) => m.studentId));
  const available = students.filter((s: any) => !memberIds.has(s.id));

  async function addMember() {
    if (!pick) return; setBusy(true);
    await fetch(`/api/schools/${schoolId}/clubs`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "addMember", clubId: club.id, studentId: pick }) });
    setPick(""); setBusy(false); onChange();
  }
  async function remove(m: any) {
    await fetch(`/api/schools/${schoolId}/clubs`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ op: "removeMember", membershipId: m.id }) });
    onChange();
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div style={{ flex: 2 }}><label>Add a student</label>
          <select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Select a student…</option>
            {available.map((s: any) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName}{s.yearGroup ? ` · ${s.yearGroup}` : ""}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "flex-end" }}><button disabled={!pick || busy} onClick={addMember}>Add to club</button></div>
      </div>
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Student</th><th>Year / class</th><th>Status</th><th className="right"></th></tr></thead>
        <tbody>
          {(club.members || []).map((m: any) => (
            <tr key={m.id}>
              <td><strong>{m.studentName}</strong></td>
              <td className="muted">{m.className || m.yearGroup || "—"}</td>
              <td>{m.status === "waitlist" ? <span className="badge trial">waitlist</span> : <span className="badge active">enrolled</span>}</td>
              <td className="right"><button className="secondary small danger" onClick={() => remove(m)}>Remove</button></td>
            </tr>
          ))}
          {(club.members || []).length === 0 && <tr><td colSpan={4} className="muted">No members yet — add students above.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Register({ schoolId, club, onDone }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [marks, setMarks] = useState<Record<string, string>>(() => Object.fromEntries((club.members || []).map((m: any) => [m.studentId, "present"])));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    const payload = { clubId: club.id, date, note, marks: (club.members || []).map((m: any) => ({ studentId: m.studentId, status: marks[m.studentId] || "present" })) };
    const res = await fetch(`/api/schools/${schoolId}/clubs/attendance`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (res.ok) { setSaved(true); onDone(); setTimeout(() => setSaved(false), 2500); }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div><label>Session date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div style={{ flex: 2 }}><label>Note (optional)</label><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. match cancelled — training instead" /></div>
      </div>
      {saved && <div className="notice ok" style={{ marginTop: 10 }}>Register saved.</div>}
      <table style={{ marginTop: 12 }}>
        <thead><tr><th>Student</th><th className="right">Mark</th></tr></thead>
        <tbody>
          {(club.members || []).map((m: any) => (
            <tr key={m.studentId}>
              <td>{m.studentName}</td>
              <td className="right">
                <select value={marks[m.studentId] || "present"} onChange={(e) => setMarks({ ...marks, [m.studentId]: e.target.value })} style={{ width: "auto" }}>
                  {ATT.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </td>
            </tr>
          ))}
          {(club.members || []).length === 0 && <tr><td colSpan={2} className="muted">Add members on the Roster tab before taking a register.</td></tr>}
        </tbody>
      </table>
      {(club.members || []).length > 0 && <button style={{ marginTop: 12 }} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save register"}</button>}

      {(club.sessions || []).length > 0 && (
        <div style={{ marginTop: 18 }}>
          <div className="muted" style={{ fontWeight: 700, fontSize: 13, marginBottom: 6 }}>Recent sessions</div>
          <table>
            <thead><tr><th>Date</th><th>Present</th><th>Note</th></tr></thead>
            <tbody>
              {(club.sessions || []).map((s: any) => (
                <tr key={s.id}><td>{new Date(s.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</td><td>{s.present} / {s.recorded}</td><td className="muted">{s.note || "—"}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

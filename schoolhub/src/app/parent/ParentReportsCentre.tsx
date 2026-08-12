"use client";

import { useState } from "react";

const SECTIONS: [string, string][] = [
  ["attendance", "Attendance"], ["behaviour", "Behaviour & rewards"], ["homework", "Homework"],
  ["academic", "Academic reports"], ["trips", "Trips"], ["communications", "Communications"],
];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dt = (v: any) => (v ? new Date(v).toLocaleDateString() : "—");
function rateColor(r: number | null) { if (r == null) return "var(--muted)"; if (r >= 96) return "#16a34a"; if (r >= 90) return "#ca8a04"; return "#dc2626"; }

export default function ParentReportsCentre({ children, schools }: { children: { id: string; name: string; schoolId: string }[]; schools: { id: string; name: string }[] }) {
  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 86400000);
  const [from, setFrom] = useState(ymd(monthAgo));
  const [to, setTo] = useState(ymd(today));
  const [child, setChild] = useState("all");
  const [school, setSchool] = useState("all");
  const [secs, setSecs] = useState<string[]>(SECTIONS.map((s) => s[0]));
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const toggle = (k: string) => setSecs((v) => v.includes(k) ? v.filter((x) => x !== k) : [...v, k]);
  const params = () => new URLSearchParams({ from, to, child, school, sections: secs.join(",") }).toString();

  async function generate() {
    setErr(null); setLoading(true); setData(null);
    try {
      if (secs.length === 0) throw new Error("Pick at least one section to include.");
      const d = await fetch(`/api/parent/reports-centre?${params()}`).then((r) => r.json());
      if (d.error) throw new Error(d.error);
      setData(d);
    } catch (e: any) { setErr(e.message || "Failed to build report"); }
    finally { setLoading(false); }
  }

  const report: any[] = data?.report ?? [];

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>Reports centre</h2>
        <p className="sub">Build a customised report across your children. Choose a date range, who to include and which sections you want, then preview it or download a PDF.</p>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <div><label>From</label><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: "auto" }} /></div>
          <div><label>To</label><input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: "auto" }} /></div>
          {children.length > 1 && <div><label>Child</label><select value={child} onChange={(e) => setChild(e.target.value)} style={{ width: "auto" }}><option value="all">All children</option>{children.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>}
          {schools.length > 1 && <div><label>School</label><select value={school} onChange={(e) => setSchool(e.target.value)} style={{ width: "auto" }}><option value="all">All schools</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
        </div>

        <label style={{ display: "block", marginTop: 10 }}>Include sections</label>
        <div className="chips" style={{ marginTop: 4 }}>
          {SECTIONS.map(([k, l]) => <button key={k} className={secs.includes(k) ? "" : "secondary"} onClick={() => toggle(k)}>{l}</button>)}
        </div>

        {err && <div className="notice err" style={{ marginTop: 10 }}>{err}</div>}
        <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={generate} disabled={loading}>{loading ? "Building…" : "Generate report"}</button>
          <a href={`/api/parent/reports-centre?${params()}&format=pdf`} target="_blank" rel="noreferrer"><button className="secondary" type="button">Download PDF</button></a>
        </div>
      </div>

      {data && (report.length === 0 ? (
        <div className="panel"><p className="muted">No children match the selected filters.</p></div>
      ) : report.map((c) => (
        <div className="panel" key={c.id}>
          <div className="flex-between" style={{ alignItems: "baseline" }}>
            <h2 style={{ margin: 0, fontSize: 17 }}>{c.name}</h2>
            <span className="muted" style={{ fontSize: 12 }}>{[c.yearGroup, c.className].filter(Boolean).join(" · ")} · {c.schoolName}</span>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{from} → {to}</div>

          {c.attendance && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Attendance</h3>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 24, fontWeight: 800, color: rateColor(c.attendance.rate) }}>{c.attendance.rate == null ? "—" : `${c.attendance.rate}%`}</div>
                <div className="muted" style={{ fontSize: 13 }}>Present {c.attendance.present} · Late {c.attendance.late} · Absent {c.attendance.absent} · Authorised {c.attendance.authorised} · {c.attendance.total} sessions</div>
              </div>
            </div>
          )}
          {c.behaviour && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Behaviour & rewards</h3>
              <div className="muted" style={{ fontSize: 13 }}>⭐ {c.behaviour.positivePoints} positive · ⚠️ {c.behaviour.negativePoints} negative points</div>
              {c.behaviour.records.slice(0, 8).map((r: any, i: number) => <div key={i} style={{ fontSize: 13 }}>{dt(r.at)} {r.positive ? "＋" : "－"} {r.type || ""} {r.points ? `(${r.points})` : ""} <span className="muted">{r.note || ""}</span></div>)}
            </div>
          )}
          {c.homework && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Homework ({c.homework.length})</h3>
              {c.homework.length ? c.homework.slice(0, 12).map((h: any) => <div key={h.id} style={{ fontSize: 13 }}>Due {dt(h.dueAt)} — <strong>{h.title}</strong>{h.subject ? ` · ${h.subject}` : ""}</div>) : <p className="muted" style={{ margin: 0 }}>None in range.</p>}
            </div>
          )}
          {c.academic && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Academic reports ({c.academic.length})</h3>
              {c.academic.length ? c.academic.map((r: any) => <div key={r.id} style={{ fontSize: 13 }}>{dt(r.releasedAt)} — <strong>{r.title}</strong>{r.term ? ` · ${r.term}` : ""}</div>) : <p className="muted" style={{ margin: 0 }}>None in range.</p>}
            </div>
          )}
          {c.trips && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Trips ({c.trips.length})</h3>
              {c.trips.length ? c.trips.map((t: any, i: number) => <div key={i} style={{ fontSize: 13 }}>{t.date} — <strong>{t.title}</strong>{t.destination ? ` @ ${t.destination}` : ""} <span className="muted">· consent {t.consent}</span></div>) : <p className="muted" style={{ margin: 0 }}>None in range.</p>}
            </div>
          )}
          {c.communications && (
            <div style={{ marginTop: 14 }}>
              <h3 style={{ fontSize: 14, margin: "0 0 6px" }}>Communications ({c.communications.length})</h3>
              {c.communications.length ? c.communications.slice(0, 12).map((m: any, i: number) => <div key={i} style={{ fontSize: 13 }}>{dt(m.at)} — <strong>{m.title}</strong></div>) : <p className="muted" style={{ margin: 0 }}>None in range.</p>}
            </div>
          )}
        </div>
      )))}
    </>
  );
}

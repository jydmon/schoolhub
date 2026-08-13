"use client";

import { useEffect, useMemo, useState } from "react";

const DAY_ORDER: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DAY_LABEL: Record<string, string> = { Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday" };
const MEAL_ORDER: Record<string, number> = { breakfast: 1, lunch: 2, snack: 3, tea: 4 };
const MEAL_LABEL: Record<string, string> = { breakfast: "Breakfast", lunch: "Lunch", snack: "Snack", tea: "Tea" };
const ALLERGEN_ICON: Record<string, string> = { gluten: "🌾", milk: "🥛", egg: "🥚", eggs: "🥚", fish: "🐟", nuts: "🥜", peanuts: "🥜", soya: "🫘", soy: "🫘", sesame: "🌰", celery: "🥬", mustard: "🌭", crustaceans: "🦐", molluscs: "🦑", sulphites: "🍷", lupin: "🌱" };
const price = (p: number) => (p ? `£${(p / 100).toFixed(2)}` : "");

// Full date for a day header, e.g. "Monday, 17 August 2026", derived from the
// week-commencing date + the weekday offset. Falls back to the weekday name.
function fullDate(weekOf: string, day: string) {
  const off = (DAY_ORDER[day] ?? 1) - 1;
  if (weekOf) {
    const d = new Date(weekOf);
    if (!isNaN(d.getTime())) { d.setDate(d.getDate() + off); return d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  }
  return DAY_LABEL[day] || day;
}

export default function ParentMenu() {
  const [data, setData] = useState<any>(null);
  const [school, setSchool] = useState("all");
  const [child, setChild] = useState("all");
  const [week, setWeek] = useState("all");
  const [dietary, setDietary] = useState("all");
  const [avoid, setAvoid] = useState<string[]>([]);

  useEffect(() => { fetch(`/api/parent/menu`).then((r) => r.json()).then(setData).catch(() => setData({ error: true })); }, []);

  const items: any[] = data?.items ?? [];
  const weeks: string[] = data?.weeks ?? [];
  const allergens: string[] = data?.allergens ?? [];
  const schools: any[] = data?.schools ?? [];
  const children: any[] = data?.children ?? [];

  const filtered = useMemo(() => items.filter((m) => {
    if (school !== "all" && m.schoolId !== school) return false;
    if (child !== "all" && !(m.childIds || []).includes(child)) return false;
    if (week !== "all" && m.weekOf !== week) return false;
    if (dietary === "vegetarian" && !m.vegetarian && !m.vegan) return false;
    if (dietary === "vegan" && !m.vegan) return false;
    if (avoid.length) { const its = (m.allergens || "").toLowerCase(); if (avoid.some((a) => its.includes(a))) return false; }
    return true;
  }), [items, school, child, week, dietary, avoid]);

  // Group by (week, day) so each header can show a full date.
  const groups = useMemo(() => {
    const g: Record<string, { weekOf: string; day: string; meals: Record<string, any[]> }> = {};
    for (const m of filtered) {
      const key = `${m.weekOf || ""}|${m.day}`;
      if (!g[key]) g[key] = { weekOf: m.weekOf || "", day: m.day, meals: {} };
      (g[key].meals[m.meal] = g[key].meals[m.meal] || []).push(m);
    }
    return g;
  }, [filtered]);
  const groupKeys = Object.keys(groups).sort((a, b) => {
    const ga = groups[a], gb = groups[b];
    return (ga.weekOf || "").localeCompare(gb.weekOf || "") || (DAY_ORDER[ga.day] ?? 9) - (DAY_ORDER[gb.day] ?? 9);
  });

  const toggleAvoid = (a: string) => setAvoid((v) => v.includes(a) ? v.filter((x) => x !== a) : [...v, a]);

  if (!data) return <div className="panel">Loading menus…</div>;
  if (data.error) return <div className="panel"><h2>Menu</h2><p className="muted">Couldn&apos;t load menus right now.</p></div>;

  return (
    <>
      <div className="panel">
        <h2 style={{ margin: 0 }}>School meals</h2>
        <p className="sub">Daily and weekly meal plans for your children, with dietary options and allergen information. Filter to see what suits your family.</p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {schools.length > 1 && <div><label>School</label><select value={school} onChange={(e) => setSchool(e.target.value)} style={{ width: "auto" }}><option value="all">All schools</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>}
          {children.length > 1 && <div><label>Child</label><select value={child} onChange={(e) => setChild(e.target.value)} style={{ width: "auto" }}><option value="all">All children</option>{children.map((c) => <option key={c.id} value={c.id}>{c.firstName}</option>)}</select></div>}
          {weeks.length > 0 && <div><label>Week</label><select value={week} onChange={(e) => setWeek(e.target.value)} style={{ width: "auto" }}><option value="all">All weeks</option>{weeks.map((w) => <option key={w} value={w}>w/c {w}</option>)}</select></div>}
          <div><label>Dietary</label><select value={dietary} onChange={(e) => setDietary(e.target.value)} style={{ width: "auto" }}><option value="all">All</option><option value="vegetarian">Vegetarian</option><option value="vegan">Vegan</option></select></div>
        </div>
        {allergens.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <label style={{ display: "block" }}>Hide dishes containing</label>
            <div className="chips" style={{ marginTop: 4 }}>
              {allergens.map((a) => <button key={a} className={avoid.includes(a) ? "" : "secondary"} onClick={() => toggleAvoid(a)} style={{ textTransform: "capitalize" }}>{ALLERGEN_ICON[a] || "•"} {a}</button>)}
              {avoid.length > 0 && <button className="secondary small" onClick={() => setAvoid([])}>Clear</button>}
            </div>
          </div>
        )}
      </div>

      {groupKeys.length === 0 ? (
        <div className="panel"><p className="muted">No menu items match your filters{items.length ? "" : " — the school hasn't published a menu yet"}.</p></div>
      ) : groupKeys.map((key) => {
        const grp = groups[key];
        return (
          <div className="panel" key={key}>
            <h2 style={{ fontSize: 16, marginTop: 0 }}>{fullDate(grp.weekOf, grp.day)}</h2>
            {Object.keys(grp.meals).sort((a, b) => (MEAL_ORDER[a] ?? 9) - (MEAL_ORDER[b] ?? 9)).map((meal) => (
              <div key={meal} style={{ marginBottom: 12 }}>
                <div className="muted" style={{ fontWeight: 700, fontSize: 13, margin: "6px 0" }}>{MEAL_LABEL[meal] || meal}</div>
                <div style={{ display: "grid", gap: 8 }}>
                  {grp.meals[meal].sort((a: any, b: any) => a.course.localeCompare(b.course)).map((m: any) => {
                    const al = (m.allergens || "").split(",").map((s: string) => s.trim()).filter(Boolean);
                    return (
                      <div key={m.id} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: "8px 12px" }}>
                        <div className="flex-between" style={{ alignItems: "flex-start" }}>
                          <div>
                            <strong>{m.name}</strong>
                            {m.vegetarian && <span className="badge active" style={{ marginLeft: 6 }}>Veg</span>}
                            {m.vegan && <span className="badge active" style={{ marginLeft: 4 }}>Vegan</span>}
                            <span className="muted" style={{ fontSize: 12, marginLeft: 6, textTransform: "capitalize" }}>{m.course}</span>
                            {m.description && <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{m.description}</div>}
                            {al.length > 0 && <div style={{ fontSize: 12, marginTop: 4 }}>Allergens: {al.map((a: string) => <span key={a} style={{ marginRight: 6, textTransform: "capitalize" }}>{ALLERGEN_ICON[a.toLowerCase()] || "•"} {a}</span>)}</div>}
                            {(m.yearGroup || m.className) && <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>For {m.className || m.yearGroup}{m.childNames?.length ? ` · ${Array.from(new Set(m.childNames)).join(", ")}` : ""}</div>}
                          </div>
                          <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                            {price(m.price) && <div style={{ fontWeight: 700 }}>{price(m.price)}</div>}
                            {schools.length > 1 && <div className="muted" style={{ fontSize: 11 }}>{m.schoolName}</div>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <div className="panel">
        <p className="muted" style={{ fontSize: 12, margin: 0 }}>Allergen information is provided by your school. Always confirm with the school office if your child has a severe allergy. Special dietary announcements from the school appear in your Notifications.</p>
      </div>
    </>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["breakfast", "lunch", "snack", "tea"];
const COURSES = ["main", "vegetarian", "dessert", "side", "drink"];

const gbp = (pence: number) => (pence ? `£${(pence / 100).toFixed(2)}` : "—");

export default function MealsTab({ schoolId }: { schoolId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [f, setF] = useState({ day: "Mon", meal: "lunch", course: "main", name: "", description: "", allergens: "", price: "" });
  const [q, setQ] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/menus`).then((r) => r.json());
    setItems(d.items ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const rows = items.filter((i) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [i.name, i.day, i.meal, i.course, i.allergens].some((v) => String(v ?? "").toLowerCase().includes(s));
  });

  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/menus`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, price: f.price }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Could not add item" }); return; }
    setMsg({ kind: "ok", text: "Menu item added." });
    setF({ ...f, name: "", description: "", allergens: "", price: "" });
    load();
  }
  async function toggle(id: string, active: boolean) {
    await fetch(`/api/schools/${schoolId}/menus`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active }) });
    load();
  }

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="menus" title="Import meals & menus" hint="No catering system? Bulk-add canteen items from a CSV (price in pounds, e.g. 2.50; allergens comma-separated)." />
      <div className="panel">
        <h2>Meals &amp; menus</h2>
        <p className="sub">The canteen menu for schools with no catering system. Items appear to parents grouped by day and meal; allergens and price are shown alongside each dish.</p>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 12px" }}>
          <input placeholder="Filter menu…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <span className="muted" style={{ fontSize: 12 }}>{q ? `${rows.length} of ${items.length}` : `${items.length} item${items.length === 1 ? "" : "s"}`}</span>
        </div>
        <table>
          <thead><tr><th>Day</th><th>Meal</th><th>Course</th><th>Item</th><th>Allergens</th><th>Price</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rows.map((i) => (
              <tr key={i.id}>
                <td>{i.day}</td>
                <td className="muted">{i.meal}</td>
                <td className="muted">{i.course}</td>
                <td><strong>{i.name}</strong>{i.description ? <div className="muted" style={{ fontSize: 12 }}>{i.description}</div> : null}</td>
                <td className="muted">{i.allergens || "—"}</td>
                <td>{gbp(i.price)}</td>
                <td>{i.active ? <span className="badge active">active</span> : <span className="badge archived">hidden</span>}</td>
                <td className="right"><button className="secondary small" onClick={() => toggle(i.id, !i.active)}>{i.active ? "Hide" : "Show"}</button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="muted">{items.length ? "No items match your filter." : "No menu items yet — add one below or import a CSV."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Add a menu item</h2>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={add}>
          <div className="row">
            <div><label>Day</label><select value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></div>
            <div><label>Meal</label><select value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value })}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select></div>
            <div><label>Course</label><select value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })}>{COURSES.map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <div className="row">
            <div style={{ flex: 2 }}><label>Item name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div><label>Price (£)</label><input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="2.50" /></div>
          </div>
          <label>Description</label>
          <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <label>Allergens (comma-separated)</label>
          <input value={f.allergens} onChange={(e) => setF({ ...f, allergens: e.target.value })} placeholder="gluten, milk" />
          <button type="submit" style={{ marginTop: 14 }}>Add item</button>
        </form>
      </div>
    </>
  );
}

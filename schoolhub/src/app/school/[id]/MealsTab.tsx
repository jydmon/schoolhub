"use client";

import { useEffect, useState, useCallback } from "react";
import ModuleImportCard from "./ModuleImportCard";
import { useSel, useSort, SortTh, Kebab, SourceBadge, DetailModal } from "./EntityKit";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MEALS = ["breakfast", "lunch", "snack", "tea"];
const COURSES = ["main", "vegetarian", "dessert", "side", "drink"];
const FREQUENCIES = ["one-off", "weekly", "monthly", "yearly"];
const FREQ_LABEL: Record<string, string> = { "one-off": "One-off", weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" };
const blankForm = () => ({ frequency: "weekly", weekOf: "", day: "Mon", yearGroup: "", meal: "lunch", course: "main", name: "", description: "", allergens: "", vegetarian: false, vegan: false, price: "" });
const gbp = (pence: number) => (pence ? `£${(pence / 100).toFixed(2)}` : "—");
const editableItem = (i: any) => (i.source ?? "manual") !== "api";
// Menu items are surfaced to parents/guardians (portal + mobile). Hiding an item
// removes it from that audience; scope it to a class/year where set.
const audienceOf = (i: any) => i.className || i.yearGroup || "Whole school";
const groupsSummary = (list: any[]) => {
  const gs = Array.from(new Set(list.map(audienceOf)));
  return gs.length ? gs.join(", ") : "Whole school";
};

export default function MealsTab({ schoolId }: { schoolId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [f, setF] = useState<any>(blankForm());
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const sel = useSel();
  const srt = useSort("week");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/menus`).then((r) => r.json());
    setItems(d.items ?? []); sel.clear();
  }, [schoolId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const rows = items.filter((i) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [i.name, i.day, i.meal, i.course, i.allergens, i.weekOf, i.yearGroup].some((v) => String(v ?? "").toLowerCase().includes(s));
  });
  const view = srt.sort(rows, (i, k) => k === "name" ? String(i.name ?? "").toLowerCase() : k === "week" ? (i.weekOf || "") : k === "meal" ? `${i.meal} ${i.course}` : k === "price" ? (i.price ?? 0) : "");
  const allOn = view.length > 0 && view.every((i) => sel.on(i.id));

  function openNew() { setEditId(null); setF(blankForm()); setShowAdd(true); setMsg(null); }
  function openEdit(i: any) {
    setEditId(i.id);
    setF({ frequency: i.frequency || "weekly", weekOf: i.weekOf || "", day: i.day || "Mon", yearGroup: i.yearGroup || i.className || "", meal: i.meal || "lunch", course: i.course || "main", name: i.name || "", description: i.description || "", allergens: i.allergens || "", vegetarian: !!i.vegetarian, vegan: !!i.vegan, price: i.price ? (i.price / 100).toFixed(2) : "" });
    setShowAdd(true); setMsg(null);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = editId
      ? await fetch(`/api/schools/${schoolId}/menus`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editId, ...f }) })
      : await fetch(`/api/schools/${schoolId}/menus`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || (editId ? "Could not save changes" : "Could not add item") }); return; }
    setMsg({ kind: "ok", text: editId ? "Menu item updated." : "Menu item added." });
    setShowAdd(false); setEditId(null); setF(blankForm()); load();
  }
  async function toggle(i: any) {
    setMsg(null);
    const nowActive = !i.active;
    const res = await fetch(`/api/schools/${schoolId}/menus`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: i.id, active: nowActive }) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); }
    else setMsg({ kind: "ok", text: nowActive
      ? `“${i.name}” is now shown again to parents & guardians (${audienceOf(i)}).`
      : `“${i.name}” is now hidden from parents & guardians (${audienceOf(i)}) in the parent portal and mobile app.` });
    load();
  }
  async function del(i: any) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/menus?id=${i.id}`, { method: "DELETE" });
    const d = await res.json().catch(() => ({})); if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; } setMsg({ kind: "ok", text: "Item removed." }); load();
  }
  async function bulkSetActive(active: boolean) {
    setMsg(null); let skip = 0; const affected: any[] = [];
    for (const id of sel.ids) {
      const i = items.find((x) => x.id === id);
      if (!editableItem(i)) { skip++; continue; }
      const res = await fetch(`/api/schools/${schoolId}/menus`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, active }) });
      if (res.ok) affected.push(i);
    }
    sel.clear(); load();
    const who = affected.length ? ` (${groupsSummary(affected)})` : "";
    const tail = skip ? ` · ${skip} API-fed item(s) skipped` : "";
    setMsg({ kind: "ok", text: active
      ? `Restored ${affected.length} item(s). They are shown again to parents & guardians${who} in the parent portal and mobile app.${tail}`
      : `Hid ${affected.length} item(s). This content is now hidden from parents & guardians${who} in the parent portal and mobile app.${tail}` });
  }

  return (
    <>
      <ModuleImportCard schoolId={schoolId} type="menus" title="Import meals & menus" hint="No catering system? Bulk-add the weekly menu from a CSV (weekOf date, class/year, veg/vegan, price in pounds)." />
      <div className="panel">
        <div className="flex-between"><div><h2>Meals &amp; menus</h2><p className="sub" style={{ marginBottom: 0 }}>Weekly canteen menu — from your catering system (read-only) or added/imported here. Shows week, class/year, veg/vegan options, allergens and price. Click an item to open its details. Manually-added menus are fully editable; menus fed from a catering integration are read-only.</p></div><button onClick={openNew}>New menu item</button></div>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 12px" }}>
          <input placeholder="Filter menu…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <span className="muted" style={{ fontSize: 12 }}>{q ? `${rows.length} of ${items.length}` : `${items.length} item${items.length === 1 ? "" : "s"}`}</span>
        </div>
        {sel.ids.length > 0 && <div className="bulkbar"><span>{sel.ids.length} selected</span><button className="danger small" onClick={() => bulkSetActive(false)}>Hide rows</button><button className="secondary small" onClick={() => bulkSetActive(true)}>Unhide rows</button><button className="secondary small" onClick={() => sel.clear()}>Clear</button></div>}
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(view.map((i) => i.id), e.target.checked)} /></th>
            <SortTh k="week" label="Week / Day" sort={srt} /><th>For</th><SortTh k="meal" label="Meal" sort={srt} /><SortTh k="name" label="Item" sort={srt} /><th>Diet</th><SortTh k="price" label="Price" sort={srt} /><th>Status</th><th>Source</th><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {view.map((i) => (
              <tr key={i.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(i.id)} onChange={() => sel.toggle(i.id)} /></td>
                <td>{i.weekOf || "—"}<div className="muted" style={{ fontSize: 11 }}>{i.day}{i.frequency && i.frequency !== "weekly" ? ` · ${FREQ_LABEL[i.frequency] || i.frequency}` : ""}</div></td>
                <td className="muted">{i.className || i.yearGroup || "Whole school"}</td>
                <td className="muted">{i.meal} · {i.course}</td>
                <td><button className="linklike" onClick={() => setSelected(i)}><strong>{i.name}</strong></button>{i.description ? <div className="muted" style={{ fontSize: 11 }}>{i.description}</div> : null}</td>
                <td>{i.vegan ? <span className="badge active" title="Vegan">VG</span> : i.vegetarian ? <span className="badge trial" title="Vegetarian">V</span> : <span className="muted">—</span>}</td>
                <td>{gbp(i.price)}</td>
                <td>{i.active ? <span className="badge active">shown</span> : <span className="badge archived">hidden</span>}</td>
                <td><SourceBadge src={i.source} /></td>
                <td className="right"><Kebab items={[
                  { label: "Open / expand", onClick: () => setSelected(i) },
                  editableItem(i) ? { label: "Edit", onClick: () => openEdit(i) } : null,
                  editableItem(i) ? { label: i.active ? "Hide" : "Show", onClick: () => toggle(i) } : null,
                  editableItem(i) ? { label: "Delete", onClick: () => del(i), danger: true } : null,
                ]} /></td>
              </tr>
            ))}
            {view.length === 0 && <tr><td colSpan={10} className="muted">{items.length ? "No items match your filter." : "No menu items yet — add one or import a CSV."}</td></tr>}
          </tbody>
        </table>
      </div>

      {showAdd && (
        <div className="modal-overlay" onClick={() => { setShowAdd(false); setEditId(null); }}>
          <div className="modal" style={{ maxWidth: 680, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>{editId ? "Edit menu item" : "New menu item"}</h2><button className="secondary small" onClick={() => { setShowAdd(false); setEditId(null); }}>Close</button></div>
            {msg && msg.kind === "err" && <div className="notice err" style={{ marginTop: 10 }}>{msg.text}</div>}
            <form onSubmit={submit} style={{ marginTop: 12 }}>
              <div className="row">
                <div><label>Frequency</label><select value={f.frequency} onChange={(e) => setF({ ...f, frequency: e.target.value })}>{FREQUENCIES.map((fr) => <option key={fr} value={fr}>{FREQ_LABEL[fr]}</option>)}</select></div>
                <div><label>{f.frequency === "weekly" ? "Week commencing" : "Date (optional)"}</label><input type="date" value={f.weekOf} onChange={(e) => setF({ ...f, weekOf: e.target.value })} /></div>
                <div><label>Day</label><select value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select></div>
                <div><label>Class / year (blank = all)</label><input value={f.yearGroup} onChange={(e) => setF({ ...f, yearGroup: e.target.value })} placeholder="Year 4" /></div>
              </div>
              <div className="row">
                <div><label>Meal</label><select value={f.meal} onChange={(e) => setF({ ...f, meal: e.target.value })}>{MEALS.map((m) => <option key={m}>{m}</option>)}</select></div>
                <div><label>Course</label><select value={f.course} onChange={(e) => setF({ ...f, course: e.target.value })}>{COURSES.map((c) => <option key={c}>{c}</option>)}</select></div>
                <div><label>Price (£)</label><input value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} placeholder="2.50" /></div>
              </div>
              <div className="row">
                <div style={{ flex: 2 }}><label>Item name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
              </div>
              <label>Description</label>
              <input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              <label>Allergens (comma-separated)</label>
              <input value={f.allergens} onChange={(e) => setF({ ...f, allergens: e.target.value })} placeholder="gluten, milk" />
              <div className="chips" style={{ marginTop: 10 }}>
                <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={f.vegetarian} onChange={(e) => setF({ ...f, vegetarian: e.target.checked })} /> Vegetarian option</label>
                <label className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={f.vegan} onChange={(e) => setF({ ...f, vegan: e.target.checked })} /> Vegan option</label>
              </div>
              <button type="submit" style={{ marginTop: 14 }}>{editId ? "Save changes" : "Add item"}</button>
            </form>
          </div>
        </div>
      )}

      {selected && (
        <DetailModal
          title={selected.name}
          subtitle={<>{selected.weekOf ? `w/c ${selected.weekOf} · ` : ""}{selected.day} · {selected.meal} · {selected.course} · <SourceBadge src={selected.source} /></>}
          onClose={() => setSelected(null)}
        >
          <div className="row" style={{ marginTop: 10 }}>
            <div className="stat"><div className="n" style={{ fontSize: 20 }}>{gbp(selected.price)}</div><div className="l">Price</div></div>
            <div className="stat"><div className="n" style={{ fontSize: 16 }}>{selected.className || selected.yearGroup || "Whole school"}</div><div className="l">For</div></div>
            <div className="stat"><div className="n" style={{ fontSize: 16 }}>{selected.vegan ? "Vegan" : selected.vegetarian ? "Vegetarian" : "Standard"}</div><div className="l">Diet</div></div>
            <div className="stat"><div className="n" style={{ fontSize: 16 }}>{selected.active ? "Shown" : "Hidden"}</div><div className="l">Status</div></div>
          </div>
          {selected.description ? <p style={{ marginTop: 14 }}>{selected.description}</p> : null}
          <p style={{ marginTop: 10 }}><strong>Allergens:</strong> {selected.allergens || "none listed"}</p>
          {!editableItem(selected) && <div className="notice info">This menu is fed from an integration — it&apos;s read-only here.</div>}
        </DetailModal>
      )}
    </>
  );
}

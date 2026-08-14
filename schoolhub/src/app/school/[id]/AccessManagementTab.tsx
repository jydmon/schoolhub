"use client";

import { useEffect, useState, useCallback } from "react";
import { Kebab, useSort, SortTh } from "@/components/TableKit";

// Item 12 — Access Management (School Administrator). View system + custom roles,
// create/clone, edit page/feature/CRUD permissions, enable/disable, restore
// defaults, assign roles to users, and view the role audit history.

const dt = (v: any) => (v ? new Date(v).toLocaleString() : "");
const CRUD = ["create", "read", "update", "delete"] as const;

async function api(url: string, method = "GET", body?: any) {
  const r = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}

export default function AccessManagementTab({ schoolId }: { schoolId: string }) {
  const [sub, setSub] = useState<"roles" | "assign" | "history">("roles");
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [edit, setEdit] = useState<any | null>(null); // working copy of the selected role
  const [newName, setNewName] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [assignUser, setAssignUser] = useState(""); const [assignRoleKey, setAssignRoleKey] = useState("");
  const [roleQ, setRoleQ] = useState(""); const [roleType, setRoleType] = useState("all");
  const srt = useSort("name");

  const load = useCallback(async () => {
    try { setData(await api(`/api/schools/${schoolId}/roles`)); } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (sub === "history") api(`/api/schools/${schoolId}/roles/history`).then((d) => setHistory(d.history || [])).catch(() => {}); }, [sub, schoolId]);

  const roles: any[] = data?.roles ?? [];
  const catalog = data?.catalog ?? { permissions: [], pages: [], crud: [] };
  const users: any[] = data?.users ?? [];
  const permGroups = Array.from(new Set(catalog.permissions.map((p: any) => p.group)));

  function openEdit(r: any) { setEdit(JSON.parse(JSON.stringify(r))); setMsg(null); }
  function togglePerm(k: string) { setEdit((e: any) => ({ ...e, permissions: e.permissions.includes(k) ? e.permissions.filter((x: string) => x !== k) : [...e.permissions, k] })); }
  function togglePage(k: string) { setEdit((e: any) => ({ ...e, pages: e.pages.includes(k) ? e.pages.filter((x: string) => x !== k) : [...e.pages, k] })); }
  function toggleCrud(res: string, op: string) { setEdit((e: any) => { const cur = e.crud[res] || {}; return { ...e, crud: { ...e.crud, [res]: { ...cur, [op]: !cur[op] } } }; }); }

  async function saveEdit() {
    setMsg(null);
    try { await api(`/api/schools/${schoolId}/roles`, "PATCH", { op: "save", key: edit.key, name: edit.name, permissions: edit.permissions, pages: edit.pages, crud: edit.crud }); setMsg({ k: "ok", t: "Role saved." }); setEdit(null); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function act(op: string, key: string, extra: any = {}) {
    setMsg(null);
    try { await api(`/api/schools/${schoolId}/roles`, "PATCH", { op, key, ...extra }); load(); if (op === "delete" || op === "restore") setEdit(null); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function createRole(cloneFrom?: string) {
    const name = cloneFrom ? `${roles.find((r) => r.key === cloneFrom)?.name} (copy)` : newName.trim();
    if (!name) { setMsg({ k: "err", t: "Enter a role name." }); return; }
    try { const d = await api(`/api/schools/${schoolId}/roles`, "POST", { name, cloneFrom }); setNewName(""); setMsg({ k: "ok", t: "Role created." }); await load(); const r = (await api(`/api/schools/${schoolId}/roles`)).roles.find((x: any) => x.key === d.key); if (r) openEdit(r); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function assign() {
    if (!assignUser || !assignRoleKey) { setMsg({ k: "err", t: "Pick a user and a role." }); return; }
    try { await api(`/api/schools/${schoolId}/roles`, "PATCH", { op: "assign", userId: assignUser, key: assignRoleKey }); setMsg({ k: "ok", t: "Role assigned." }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }

  if (!data) return <div className="panel">Loading roles…</div>;

  return (
    <>
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>Access management</h2>
            <p className="sub" style={{ marginBottom: 0 }}>Roles, permissions and access for everyone at your school. Edit the built-in roles, create your own, and control page, feature and create/read/update/delete access. As School Administrator you always retain full access.</p></div>
        </div>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 10 }}>{msg.t}</div>}
        <div className="tabs" style={{ marginTop: 8 }}>
          {([["roles", "Roles & permissions"], ["assign", "Assign roles"], ["history", "Audit history"]] as [any, string][]).map(([k, l]) => (
            <button key={k} className={sub === k ? "active" : ""} onClick={() => setSub(k)}>{l}</button>
          ))}
        </div>
      </div>

      {sub === "roles" && !edit && (
        <>
          <div className="panel">
            <div className="row" style={{ alignItems: "flex-end" }}>
              <div style={{ flex: 2 }}><label>New custom role</label><input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Finance Officer, Club Coordinator" /></div>
              <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={() => createRole()}>Create role</button></div>
            </div>
          </div>
          <div className="panel">
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
              <input placeholder="Search roles…" value={roleQ} onChange={(e) => setRoleQ(e.target.value)} style={{ maxWidth: 240 }} />
              <select value={roleType} onChange={(e) => setRoleType(e.target.value)} style={{ width: "auto" }}>
                <option value="all">All types</option><option value="builtin">Built-in</option><option value="custom">Custom</option>
              </select>
              {(() => { const shown = roles.filter((r) => (roleType === "all" || (roleType === "builtin" ? r.builtin : !r.builtin)) && (!roleQ.trim() || `${r.name} ${r.baseRole || ""}`.toLowerCase().includes(roleQ.trim().toLowerCase()))).length;
                return <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{shown} of {roles.length}</span>; })()}
            </div>
            <table>
              <thead><tr><SortTh k="name" label="Role" sort={srt} /><SortTh k="type" label="Type" sort={srt} /><th>Permissions</th><SortTh k="status" label="Status" sort={srt} /><th className="right">Actions</th></tr></thead>
              <tbody>
                {srt.sort(roles.filter((r) => (roleType === "all" || (roleType === "builtin" ? r.builtin : !r.builtin)) && (!roleQ.trim() || `${r.name} ${r.baseRole || ""}`.toLowerCase().includes(roleQ.trim().toLowerCase()))),
                  (r, k) => k === "name" ? String(r.name ?? "").toLowerCase() : k === "type" ? (r.builtin ? "0-builtin" : "1-custom") : k === "status" ? (r.enabled ? "0" : "1") : "").map((r) => (
                  <tr key={r.key} style={{ opacity: r.enabled ? 1 : 0.55 }}>
                    <td><strong>{r.name}</strong>{r.baseRole ? <div className="muted" style={{ fontSize: 11 }}>inherits {r.baseRole}</div> : null}</td>
                    <td>{r.builtin ? <span className="badge role">built-in{r.overridden ? " · customised" : ""}</span> : <span className="badge trial">custom</span>}</td>
                    <td className="muted">{r.permissions.length} permission(s) · {r.pages.length} page(s)</td>
                    <td>{r.enabled ? <span className="badge active">enabled</span> : <span className="badge archived">disabled</span>}</td>
                    <td className="right"><Kebab items={[
                      { label: "Edit", onClick: () => openEdit(r) },
                      { label: "Clone", onClick: () => createRole(r.key) },
                      { label: r.enabled ? "Disable" : "Enable", onClick: () => act("enable", r.key, { enabled: !r.enabled }) },
                      r.builtin && r.overridden ? { label: "Restore default", onClick: () => act("restore", r.key) } : null,
                      !r.builtin ? { label: "Delete", onClick: () => act("delete", r.key), danger: true } : null,
                    ]} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {sub === "roles" && edit && (
        <div className="panel">
          <div className="flex-between" style={{ alignItems: "flex-start" }}>
            <div><h2 style={{ margin: 0 }}>Edit — {edit.name}</h2><div className="muted" style={{ fontSize: 12 }}>{edit.builtin ? "Built-in role" : "Custom role"} · key {edit.key}</div></div>
            <button className="secondary small" onClick={() => setEdit(null)}>Back</button>
          </div>
          <label style={{ marginTop: 10 }}>Role name</label>
          <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />

          <h3 style={{ marginBottom: 4 }}>Feature permissions</h3>
          {permGroups.map((g) => (
            <div key={g as string} style={{ marginBottom: 8 }}>
              <div className="muted" style={{ fontSize: 12, fontWeight: 700 }}>{g as string}</div>
              <div className="chips">
                {catalog.permissions.filter((p: any) => p.group === g).map((p: any) => (
                  <label key={p.key} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={edit.permissions.includes(p.key)} onChange={() => togglePerm(p.key)} /> {p.label}</label>
                ))}
              </div>
            </div>
          ))}

          <h3 style={{ marginBottom: 4 }}>Page access</h3>
          <div className="chips">
            {catalog.pages.map((p: any) => (
              <label key={p.key} className="chip" style={{ margin: 0 }}><input type="checkbox" style={{ width: "auto" }} checked={edit.pages.includes(p.key)} onChange={() => togglePage(p.key)} /> {p.label}</label>
            ))}
          </div>

          <h3 style={{ marginBottom: 4 }}>Create / read / update / delete</h3>
          <table>
            <thead><tr><th>Resource</th>{CRUD.map((c) => <th key={c} style={{ textTransform: "capitalize" }}>{c}</th>)}</tr></thead>
            <tbody>
              {catalog.crud.map((res: any) => (
                <tr key={res.key}>
                  <td>{res.label}</td>
                  {CRUD.map((op) => <td key={op}><input type="checkbox" checked={!!(edit.crud[res.key]?.[op])} onChange={() => toggleCrud(res.key, op)} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>

          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button onClick={saveEdit}>Save role</button>
            <button className="secondary" onClick={() => setEdit(null)}>Cancel</button>
            {edit.builtin && edit.overridden && <button className="secondary" onClick={() => act("restore", edit.key)}>Restore platform default</button>}
            {!edit.builtin && <button className="secondary danger" style={{ marginLeft: "auto" }} onClick={() => act("delete", edit.key)}>Delete role</button>}
          </div>
        </div>
      )}

      {sub === "assign" && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>Assign a role</h2>
          <div className="row" style={{ marginTop: 10, alignItems: "flex-end" }}>
            <div style={{ flex: 2 }}><label>User</label><select value={assignUser} onChange={(e) => setAssignUser(e.target.value)}><option value="">Select a user…</option>{users.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.email}</option>)}</select></div>
            <div style={{ flex: 2 }}><label>Role</label><select value={assignRoleKey} onChange={(e) => setAssignRoleKey(e.target.value)}><option value="">Select a role…</option>{roles.filter((r) => r.assignable).map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></div>
            <div style={{ display: "flex", alignItems: "flex-end" }}><button onClick={assign}>Assign</button></div>
          </div>
          <table style={{ marginTop: 14 }}>
            <thead><tr><th>User</th><th>Assigned roles</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><strong>{u.name}</strong><div className="muted" style={{ fontSize: 11 }}>{u.email}</div></td>
                  <td>{u.roles.map((rk: string) => { const r = roles.find((x) => x.key === rk); return (
                    <span key={rk} className="badge role" style={{ marginRight: 6 }}>{r?.name || rk} <button className="linklike" style={{ fontSize: 11, marginLeft: 4 }} onClick={() => act("unassign", rk, { userId: u.id })}>✕</button></span>
                  ); })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === "history" && (
        <div className="panel">
          <h2 style={{ fontSize: 16, margin: 0 }}>Role audit history</h2>
          <table style={{ marginTop: 8 }}>
            <thead><tr><th>When</th><th>Action</th><th>By</th><th>Details</th></tr></thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}><td className="mono muted" style={{ fontSize: 12 }}>{dt(h.at)}</td><td>{h.action.replace(/^ROLE_/, "").replace(/_/g, " ").toLowerCase()}</td><td className="muted">{h.actorEmail || "—"}</td><td className="muted" style={{ fontSize: 12 }}>{h.metadata?.name || h.metadata?.key || h.metadata?.role || ""}</td></tr>
              ))}
              {history.length === 0 && <tr><td colSpan={4} className="muted">No role changes recorded yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

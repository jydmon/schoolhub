"use client";

import { useEffect, useState, useCallback, useRef, createContext, useContext } from "react";
import AppShell, { NavGroup } from "@/components/AppShell";
import { ConfirmDialog, useBeforeUnload } from "@/components/ConfirmDialog";
import { PLATFORM_AREAS, AREA_LABELS } from "@/lib/platform-staff-logic";

// Shared "unsaved changes" flag so forms can warn before navigating away.
const DirtyCtx = createContext<{ setDirty: (v: boolean) => void }>({ setDirty: () => {} });
function useDirty(dirty: boolean) {
  const { setDirty } = useContext(DirtyCtx);
  useEffect(() => { setDirty(dirty); return () => setDirty(false); }, [dirty, setDirty]);
}

/* ---------------------------------------------------------------------------
 * Platform super-admin console. Every area below is wired to an existing API
 * under /api/platform, /api/crm, /api/cms, /api/schools, /api/groups, /api/audit.
 * A platform super-admin (isPlatformAdmin) has access to all areas ("*").
 * ------------------------------------------------------------------------- */

// ---- tiny fetch helpers ----
function useJson<T = any>(url: string): { data: T | null; err: string | null; loading: boolean; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(() => {
    setLoading(true); setErr(null);
    fetch(url)
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`); return j; })
      .then((j) => setData(j))
      .catch((e) => setErr(e.message))
      .finally(() => setLoading(false));
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, err, loading, reload };
}
async function send(url: string, body: any, method = "POST") {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(j.error || `HTTP ${r.status}`);
  return j;
}
function Notice({ msg }: { msg: { k: string; t: string } | null }) {
  if (!msg) return null;
  return <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`}>{msg.t}</div>;
}
function Empty({ cols, text }: { cols: number; text: string }) {
  return <tr><td colSpan={cols} className="muted">{text}</td></tr>;
}
const dt = (v: any) => (v ? new Date(v).toLocaleString() : "—");

// ---- shared content-table controls: filter + sort + bulk selection ----
function matchQ(q: string, ...fields: any[]): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return fields.some((f) => String(f ?? "").toLowerCase().includes(s));
}
function useSel() {
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const ids = Object.keys(sel).filter((k) => sel[k]);
  return {
    ids,
    on: (id: string) => !!sel[id],
    toggle: (id: string) => setSel((p) => ({ ...p, [id]: !p[id] })),
    setMany: (list: string[], v: boolean) => setSel(v ? Object.fromEntries(list.map((i) => [i, true])) : {}),
    clear: () => setSel({}),
  };
}
function useSort<T>(accessors: Record<string, (r: T) => any>, initial = "") {
  const [key, setKey] = useState(initial);
  const [dir, setDir] = useState<1 | -1>(1);
  function click(k: string) { if (key === k) setDir((d) => (d === 1 ? -1 : 1)); else { setKey(k); setDir(1); } }
  function apply(rows: T[]): T[] {
    const a = accessors[key];
    if (!key || !a) return rows;
    return [...rows].sort((x, y) => { const xv = a(x) ?? ""; const yv = a(y) ?? ""; return xv < yv ? -dir : xv > yv ? dir : 0; });
  }
  return { key, dir, click, apply };
}
function SortTh({ label, k, sort, className }: { label: string; k: string; sort: { key: string; dir: 1 | -1; click: (k: string) => void }; className?: string }) {
  const on = sort.key === k;
  return <th className={className} style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }} onClick={() => sort.click(k)}>{label}{on ? (sort.dir === 1 ? " ▲" : " ▼") : ""}</th>;
}
function TableTools({ q, setQ, count, total, children }: { q: string; setQ: (v: string) => void; count: number; total: number; children?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "4px 0 12px" }}>
      <input placeholder="Filter…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
      <span className="muted" style={{ fontSize: 12 }}>{q ? `${count} of ${total}` : `${total} item${total === 1 ? "" : "s"}`}</span>
      <span style={{ flex: 1 }} />
      {children}
    </div>
  );
}

// ---- tab registry ----
const TABS: { key: string; label: string }[] = [
  { key: "tenants", label: "Tenants" },
  { key: "groups", label: "Trusts & Groups" },
  { key: "team", label: "Team & Access" },
  { key: "subs", label: "Subscriptions" },
  { key: "packages", label: "Packages" },
  { key: "revenue", label: "Parent Revenue" },
  { key: "usage", label: "Usage" },
  { key: "reports", label: "Reports" },
  { key: "templates", label: "Templates" },
  { key: "policies", label: "Policies" },
  { key: "crm", label: "CRM" },
  { key: "videos", label: "Help Videos" },
  { key: "support", label: "Support" },
  { key: "email", label: "Email" },
  { key: "integrations", label: "Integrations" },
  { key: "trouble", label: "Troubleshooting" },
  { key: "audit", label: "Audit trail" },
];

const NAV: NavGroup[] = [
  { label: "Overview", items: [
    { key: "tenants", label: "Schools", icon: "🏫" },
    { key: "groups", label: "Trusts & Groups", icon: "🏛️" },
  ] },
  { label: "Content", items: [
    { key: "templates", label: "Templates", icon: "🧩" },
    { key: "policies", label: "Policies", icon: "📋" },
    { key: "videos", label: "Help Videos", icon: "🎬" },
  ] },
  { label: "Integrations", items: [
    { key: "integrations", label: "Integrations", icon: "🔌" },
    { key: "crm", label: "CRM", icon: "📇" },
    { key: "email", label: "Platform comms", icon: "✉️" },
  ] },
  { label: "Insights", items: [
    { key: "subs", label: "Subscriptions", icon: "💳" },
    { key: "packages", label: "Packages", icon: "📦" },
    { key: "revenue", label: "Parent Revenue", icon: "💰" },
    { key: "usage", label: "User analytics", icon: "📊" },
    { key: "reports", label: "Reports", icon: "📈" },
  ] },
  { label: "Support & Settings", items: [
    { key: "support", label: "Help desk", icon: "🛟" },
    { key: "trouble", label: "Troubleshooting", icon: "🩺" },
    { key: "team", label: "Team & access", icon: "🧑‍💼" },
    { key: "audit", label: "Audit trail", icon: "🗂️" },
  ] },
];
const TITLES: Record<string, string> = {
  tenants: "Schools", groups: "Trusts & Groups", templates: "Templates", policies: "Policies",
  videos: "Help Videos", integrations: "Integrations", crm: "CRM", email: "Platform comms",
  subs: "Subscriptions", packages: "Packages", revenue: "Parent Revenue", usage: "User analytics",
  reports: "Reports", support: "Help desk", trouble: "Troubleshooting", team: "Team & Access", audit: "Audit trail",
};

export default function AdminPortal({ email = "" }: { email?: string }) {
  const [tab, setTab] = useState<string>("tenants");
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  useBeforeUnload(dirty);

  function navigate(k: string) {
    if (k === tab) return;
    if (dirty) { setPendingNav(k); return; }
    setTab(k);
  }

  return (
    <DirtyCtx.Provider value={{ setDirty }}>
      <AppShell brandSub="Platform" nav={NAV} active={tab} onNavigate={navigate}
        title={TITLES[tab] || "Platform administration"} email={email} role="Platform Super Admin">
        <SeedRow />
        {tab === "tenants" && <Tenants />}
        {tab === "groups" && <Groups />}
        {tab === "team" && <Team />}
        {tab === "subs" && <Subscriptions />}
        {tab === "packages" && <Packages />}
        {tab === "revenue" && <ParentRevenue />}
        {tab === "usage" && <Usage />}
        {tab === "reports" && <Reports />}
        {tab === "templates" && <Templates />}
        {tab === "policies" && <Policies />}
        {tab === "crm" && <Crm />}
        {tab === "videos" && <Videos />}
        {tab === "support" && <Support />}
        {tab === "email" && <EmailCfg />}
        {tab === "integrations" && <Integrations />}
        {tab === "trouble" && <Troubleshooting />}
        {tab === "audit" && <AuditTab />}
      </AppShell>
      <ConfirmDialog
        open={pendingNav !== null}
        title="Leave this page?"
        message="You have unsaved changes on this page. If you leave now, those changes will be lost."
        confirmLabel="Leave without saving"
        onConfirm={() => { setDirty(false); if (pendingNav) setTab(pendingNav); setPendingNav(null); }}
        onCancel={() => setPendingNav(null)}
      />
    </DirtyCtx.Provider>
  );
}

/* ============================ TENANTS ============================ */
type School = { id: string; name: string; slug: string; status: string; group?: { name: string } | null; subscription?: { status: string; plan: { name: string; key: string } } | null; _count: { memberships: number; students: number; campuses: number } };
type Group = { id: string; name: string; _count: { schools: number } };

function Tenants() {
  const [schools, setSchools] = useState<School[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [form, setForm] = useState({ schoolName: "", slug: "", adminName: "", adminEmail: "", adminPassword: "", planKey: "", groupId: "" });
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; run: () => void }>(null);
  // Packages available on the create-tenant form come from the Packages list.
  const plansQ = useJson<any>("/api/plans");
  const planList: any[] = (plansQ.data?.plans ?? []).filter((p: any) => p.isActive !== false);
  const defaultPlanKey = () => planList.find((p) => p.key === "trial")?.key ?? planList[0]?.key ?? "";
  const dirty = !!(form.schoolName || form.slug || form.adminName || form.adminEmail || form.adminPassword);
  useDirty(dirty);
  // Default (or repair) the selected package once packages have loaded.
  useEffect(() => {
    if (planList.length && !planList.some((p) => p.key === form.planKey)) {
      setForm((prev) => ({ ...prev, planKey: defaultPlanKey() }));
    }
  }, [plansQ.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const load = useCallback(async () => {
    const [s, g] = await Promise.all([fetch("/api/schools").then((r) => r.json()), fetch("/api/groups").then((r) => r.json())]);
    setSchools(s.schools ?? []); setGroups(g.groups ?? []); setSel({});
  }, []);
  useEffect(() => { load(); }, [load]);
  async function onboard(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!form.planKey) { setMsg({ k: "err", t: "Select a package. If none appear, create one in Packages first." }); return; }
    try { await send("/api/schools", { ...form, groupId: form.groupId || null }); setMsg({ k: "ok", t: `Created "${form.schoolName}" on the "${planList.find((p) => p.key === form.planKey)?.name ?? form.planKey}" package.` }); setForm({ schoolName: "", slug: "", adminName: "", adminEmail: "", adminPassword: "", planKey: defaultPlanKey(), groupId: "" }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message || "Failed to onboard school" }); }
  }
  async function setStatus(id: string, status: string) { await send(`/api/schools/${id}`, { status }, "PATCH"); load(); }
  const selectedIds = schools.filter((s) => sel[s.id]).map((s) => s.id);
  const allChecked = schools.length > 0 && selectedIds.length === schools.length;
  function toggleAll() { const v = !allChecked; const next: Record<string, boolean> = {}; schools.forEach((s) => (next[s.id] = v)); setSel(next); }
  async function bulk(status: string) { for (const id of selectedIds) await send(`/api/schools/${id}`, { status }, "PATCH"); load(); }
  function askSuspend(s: School) { setConfirm({ title: `Suspend "${s.name}"?`, message: "This immediately blocks all access for everyone at this school until you reactivate it.", label: "Suspend school", run: () => { setStatus(s.id, "suspended"); setConfirm(null); } }); }
  function askBulkSuspend() { setConfirm({ title: `Suspend ${selectedIds.length} school${selectedIds.length > 1 ? "s" : ""}?`, message: "This immediately blocks all access for everyone at the selected schools until you reactivate them.", label: "Suspend selected", run: () => { bulk("suspended"); setConfirm(null); } }); }
  const active = schools.filter((s) => s.status === "active").length;
  const suspended = schools.filter((s) => s.status === "suspended").length;
  const students = schools.reduce((n, s) => n + (s._count?.students ?? 0), 0);
  return (
    <>
      <ConfirmDialog open={!!confirm} title={confirm?.title || ""} message={confirm?.message || ""} confirmLabel={confirm?.label || "Confirm"} onConfirm={() => confirm?.run()} onCancel={() => setConfirm(null)} />
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="n">{schools.length}</div><div className="l">Tenants</div></div>
        <div className="stat"><div className="n">{active}</div><div className="l">Active</div></div>
        <div className="stat"><div className="n">{suspended}</div><div className="l">Suspended</div></div>
        <div className="stat"><div className="n">{students}</div><div className="l">Students</div></div>
      </div>
      <div className="panel">
        <h2>Schools</h2>
        <p className="sub">Every school is an isolated tenant. Select rows to act on several at once. Suspend to block all access instantly.</p>
        {selectedIds.length > 0 && (
          <div className="bulkbar">
            <span>{selectedIds.length} selected</span>
            <button className="secondary small" onClick={() => bulk("active")}>Reactivate</button>
            <button className="danger small" onClick={askBulkSuspend}>Suspend</button>
            <button className="secondary small" onClick={() => setSel({})}>Clear</button>
          </div>
        )}
        <table>
          <thead><tr><th className="checkbox-cell"><input type="checkbox" className="rowcheck" checked={allChecked} onChange={toggleAll} aria-label="Select all" /></th><th>School</th><th>Trust</th><th>Plan</th><th>Users</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id}>
                <td className="checkbox-cell"><input type="checkbox" className="rowcheck" checked={!!sel[s.id]} onChange={(e) => setSel({ ...sel, [s.id]: e.target.checked })} aria-label={`Select ${s.name}`} /></td>
                <td><strong>{s.name}</strong><div className="mono muted">/{s.slug}</div></td>
                <td>{s.group?.name ?? <span className="muted">—</span>}</td>
                <td>{s.subscription?.plan?.name ?? <span className="muted">—</span>}</td>
                <td>{s._count?.memberships ?? 0}</td>
                <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                <td className="right">{s.status === "suspended" ? <button className="secondary small" onClick={() => setStatus(s.id, "active")}>Reactivate</button> : <button className="danger small" onClick={() => askSuspend(s)}>Suspend</button>}</td>
              </tr>
            ))}
            {schools.length === 0 && <Empty cols={7} text="No tenants yet — onboard one below." />}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Onboard a school</h2>
        <p className="sub">Creates the tenant, its configuration, a subscription and the first School Administrator.</p>
        <Notice msg={msg} />
        <form onSubmit={onboard}>
          <div className="row">
            <div><label>School name</label><input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} required /></div>
            <div><label>Slug (subdomain)</label><input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required /></div>
          </div>
          <div className="row">
            <div><label>Package</label><select value={form.planKey} onChange={(e) => setForm({ ...form, planKey: e.target.value })} required>{planList.length === 0 && <option value="">— no packages yet, create one in Packages —</option>}{planList.map((p) => <option key={p.key} value={p.key}>{p.name}{p.pricePerSchool ? ` — £${(p.pricePerSchool / 100).toFixed(0)}/yr` : ""}</option>)}</select></div>
            <div><label>Trust / group (optional)</label><select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}><option value="">— none —</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select></div>
          </div>
          <div className="row">
            <div><label>Administrator name</label><input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required /></div>
            <div><label>Administrator email</label><input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required /></div>
          </div>
          <label>Administrator temporary password</label>
          <input type="text" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} minLength={8} required />
          <button type="submit" style={{ marginTop: 16 }}>Create tenant</button>
        </form>
      </div>
    </>
  );
}

/* ============================ GROUPS ============================ */
function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");
  const load = useCallback(async () => { const g = await fetch("/api/groups").then((r) => r.json()); setGroups(g.groups ?? []); }, []);
  useEffect(() => { load(); }, [load]);
  async function create(e: React.FormEvent) { e.preventDefault(); await send("/api/groups", { name }); setName(""); load(); }
  return (
    <div className="panel">
      <h2>Academy trusts &amp; school groups</h2>
      <p className="sub">Group multiple schools under a single overseeing organisation.</p>
      <table><thead><tr><th>Name</th><th>Schools</th></tr></thead>
        <tbody>{groups.map((g) => <tr key={g.id}><td>{g.name}</td><td>{g._count?.schools ?? 0}</td></tr>)}{groups.length === 0 && <Empty cols={2} text="No groups yet." />}</tbody>
      </table>
      <form onSubmit={create} style={{ marginTop: 16 }}>
        <div className="row"><div style={{ flex: 3 }}><label>New trust / group name</label><input value={name} onChange={(e) => setName(e.target.value)} required /></div><div style={{ display: "flex", alignItems: "flex-end" }}><button type="submit">Add</button></div></div>
      </form>
    </div>
  );
}

/* ============================ TEAM & ACCESS ============================ */
function Team() {
  const { data, err, reload } = useJson<any>("/api/platform/staff");
  const roles = useJson<any>("/api/platform/staff/roles");
  const [f, setF] = useState({ userId: "", email: "", name: "", roleKey: "" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  // Custom-role builder
  const [rf, setRf] = useState<{ name: string; areas: Record<string, boolean> }>({ name: "", areas: {} });
  const [rmsg, setRmsg] = useState<{ k: string; t: string } | null>(null);
  const [delRole, setDelRole] = useState<any | null>(null);
  const staff: any[] = data?.staff ?? [];
  const roleList: any[] = roles.data?.roles ?? [];
  const roleDirty = rf.name.trim().length > 0 || Object.values(rf.areas).some(Boolean);
  useDirty(roleDirty);
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/platform/staff", { ...f, roleKey: f.roleKey || roleList[0]?.key }); setMsg({ k: "ok", t: "Staff member saved." }); setF({ userId: "", email: "", name: "", roleKey: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function status(id: string, s: string) { try { await send(`/api/platform/staff/${id}`, { status: s }, "PATCH"); reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function createRole(e: React.FormEvent) {
    e.preventDefault(); setRmsg(null);
    const areas = Object.keys(rf.areas).filter((a) => rf.areas[a]);
    try { await send("/api/platform/staff/roles", { name: rf.name, areas }); setRmsg({ k: "ok", t: `Role “${rf.name}” saved.` }); setRf({ name: "", areas: {} }); roles.reload(); }
    catch (e: any) { setRmsg({ k: "err", t: e.message }); }
  }
  async function removeRole(key: string) {
    setRmsg(null);
    try { await send(`/api/platform/staff/roles?key=${encodeURIComponent(key)}`, {}, "DELETE"); setRmsg({ k: "ok", t: "Role deleted." }); roles.reload(); }
    catch (e: any) { setRmsg({ k: "err", t: e.message }); }
    finally { setDelRole(null); }
  }
  return (
    <>
      <ConfirmDialog open={delRole !== null} title="Delete this role?" message={`“${delRole?.name}” will be removed. Staff must be reassigned first.`} confirmLabel="Delete role" danger onConfirm={() => removeRole(delRole.key)} onCancel={() => setDelRole(null)} />
      <div className="panel">
        <h2>SIPlat team &amp; access</h2>
        <p className="sub">Platform staff and which super-admin areas each role can open. You (the owner) always have full access.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table>
          <thead><tr><th>Member</th><th>Role</th><th>Areas</th><th>Status</th><th>Last active</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {staff.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name || s.email}</strong><div className="mono muted">{s.email}</div></td>
                <td>{s.roleName || s.roleKey}</td>
                <td className="muted">{Array.isArray(s.areas) ? (s.areas.includes("*") ? "All areas" : s.areas.join(", ")) : "—"}</td>
                <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                <td className="mono muted">{dt(s.lastActiveAt)}</td>
                <td className="right">{s.status === "suspended" ? <button className="secondary small" onClick={() => status(s.id, "active")}>Reactivate</button> : <button className="danger small" onClick={() => status(s.id, "suspended")}>Suspend</button>}</td>
              </tr>
            ))}
            {staff.length === 0 && <Empty cols={6} text="No additional staff yet — the owner has full access." />}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Team roles</h2>
        <p className="sub">Built-in and custom roles. A role grants access to a chosen set of super-admin areas — assign staff to a role to give them exactly those areas and nothing more.</p>
        {rmsg && <Notice msg={rmsg} />}
        <table>
          <thead><tr><th>Role</th><th>Areas</th><th>Type</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {roleList.map((r) => (
              <tr key={r.key}>
                <td><strong>{r.name}</strong><div className="mono muted">{r.key}</div></td>
                <td className="muted">{Array.isArray(r.areas) ? (r.areas.includes("*") ? "All areas" : r.areas.map((a: string) => AREA_LABELS[a] || a).join(", ")) : "—"}</td>
                <td>{r.isSystem ? <span className="badge role">built-in</span> : <span className="badge active">custom</span>}</td>
                <td className="right">{r.isSystem ? <span className="muted">—</span> : <button className="danger small" onClick={() => setDelRole(r)}>Delete</button>}</td>
              </tr>
            ))}
            {roleList.length === 0 && <Empty cols={4} text="No roles yet." />}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Create a team role</h2>
        <p className="sub">Give the role a name (e.g. “Support”, “CRM”, “CMS”, “System admin”) and tick the areas its staff should be able to open.</p>
        <form onSubmit={createRole}>
          <div className="row">
            <div><label>Role name</label><input value={rf.name} onChange={(e) => setRf({ ...rf, name: e.target.value })} placeholder="e.g. Support role" required /></div>
            <div />
          </div>
          <label style={{ marginTop: 8 }}>Areas this role can access</label>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginTop: 6 }}>
            {(PLATFORM_AREAS as readonly string[]).map((a) => (
              <label key={a} className="consent" style={{ display: "flex", alignItems: "center", gap: 8, margin: 0 }}>
                <input type="checkbox" checked={!!rf.areas[a]} onChange={(e) => setRf({ ...rf, areas: { ...rf.areas, [a]: e.target.checked } })} />
                {AREA_LABELS[a] || a}
              </label>
            ))}
          </div>
          <button type="submit" style={{ marginTop: 14 }}>Create role</button>
        </form>
      </div>

      <div className="panel">
        <h2>Add / update a staff member</h2>
        <p className="sub">Grant an existing user platform-staff access with a role. Roles: {roleList.map((r) => r.name).join(", ") || "loading…"}</p>
        <Notice msg={msg} />
        <form onSubmit={add}>
          <div className="row">
            <div><label>User ID</label><input value={f.userId} onChange={(e) => setF({ ...f, userId: e.target.value })} required /></div>
            <div><label>Email</label><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          </div>
          <div className="row">
            <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
            <div><label>Role</label><select value={f.roleKey} onChange={(e) => setF({ ...f, roleKey: e.target.value })}>{roleList.map((r) => <option key={r.key} value={r.key}>{r.name}</option>)}</select></div>
          </div>
          <button type="submit" style={{ marginTop: 12 }}>Save staff member</button>
        </form>
      </div>
    </>
  );
}

/* ============================ SUBSCRIPTIONS ============================ */
function firstArray(o: any): any[] { if (!o) return []; if (Array.isArray(o)) return o; for (const k of ["rows", "subscriptions", "items", "list"]) if (Array.isArray(o[k])) return o[k]; const merged: any[] = []; for (const v of Object.values(o)) if (Array.isArray(v)) merged.push(...v); return merged; }
function Subscriptions() {
  const { data, err, reload } = useJson<any>("/api/platform/subscriptions");
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const rows = firstArray(data);
  async function act(row: any, action: string, mode?: string) {
    setMsg(null);
    try { await send(`/api/platform/subscriptions?id=${encodeURIComponent(row.id)}`, { type: row.type, action, mode }); setMsg({ k: "ok", t: "Updated." }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <div className="panel">
      <h2>Subscriptions</h2>
      <p className="sub">School and parent subscriptions, renewal reminders, and manual-approval overrides for held renewals.</p>
      {err && <Notice msg={{ k: "err", t: err }} />}
      <Notice msg={msg} />
      <table>
        <thead><tr><th>Subscriber</th><th>Type</th><th>Plan</th><th>Status</th><th>Renewal</th><th>Approval</th><th className="right">Actions</th></tr></thead>
        <tbody>
          {rows.map((s: any) => (
            <tr key={`${s.type}-${s.id}`}>
              <td>{s.who}</td>
              <td><span className="badge role">{s.type}</span></td>
              <td>{s.plan}</td>
              <td><span className={`badge ${s.status}`}>{s.status}</span></td>
              <td className="muted">{s.renewalDate ? new Date(s.renewalDate).toLocaleDateString() : "—"}{typeof s.daysUntil === "number" ? ` (${s.daysUntil}d)` : ""}</td>
              <td className="muted">{s.approvalMode || "auto"}{s.approvalStatus ? ` · ${s.approvalStatus}` : ""}</td>
              <td className="right">
                {s.needsApproval && <><button className="small" onClick={() => act(s, "approve")}>Approve</button> <button className="danger small" onClick={() => act(s, "reject")}>Reject</button> </>}
                <button className="secondary small" onClick={() => act(s, "set_mode", s.approvalMode === "manual" ? "auto" : "manual")}>{s.approvalMode === "manual" ? "Set auto" : "Set manual"}</button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && <Empty cols={7} text="No subscriptions yet." />}
        </tbody>
      </table>
    </div>
  );
}

/* ============================ PARENT REVENUE ============================ */
function ParentRevenue() {
  const { data, err } = useJson<any>("/api/platform/parent-subscriptions");
  const perSchool: any[] = data?.perSchool ?? [];
  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="n">{data?.active ?? 0}</div><div className="l">Active parents</div></div>
        <div className="stat"><div className="n">{data?.trialing ?? 0}</div><div className="l">Trialing</div></div>
        <div className="stat"><div className="n">{data?.mrrFormatted ?? "—"}</div><div className="l">MRR</div></div>
        <div className="stat"><div className="n">{data?.arrFormatted ?? "—"}</div><div className="l">ARR</div></div>
      </div>
      <div className="panel">
        <h2>Parent premium revenue by school</h2>
        <p className="sub">Recurring revenue from parent premium subscriptions. No card data is ever stored — only opaque Stripe references.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table>
          <thead><tr><th>School</th><th>Active</th><th>MRR</th></tr></thead>
          <tbody>{perSchool.map((r: any) => <tr key={r.schoolId}><td>{r.schoolName}</td><td>{r.active}</td><td>{r.mrr}</td></tr>)}{perSchool.length === 0 && <Empty cols={3} text="No parent subscriptions yet." />}</tbody>
        </table>
      </div>
    </>
  );
}

/* ============================ USAGE ============================ */
function Usage() {
  const [view, setView] = useState<"system" | "users" | "roles">("system");
  const { data, err } = useJson<any>(`/api/platform/usage?view=${view}&days=30`);
  const sys = data?.system;
  const users: any[] = data?.users ?? [];
  const roles: any[] = data?.roles ?? [];
  return (
    <div className="panel">
      <h2>Usage analytics <span className="sub" style={{ fontWeight: 400 }}>· last 30 days</span></h2>
      <div className="tabs" style={{ marginBottom: 12 }}>
        {(["system", "users", "roles"] as const).map((v) => <button key={v} className={view === v ? "active" : ""} onClick={() => setView(v)}>{v}</button>)}
      </div>
      {err && <Notice msg={{ k: "err", t: err }} />}
      {view === "system" && sys && (
        <>
          <div className="stat-grid">
            <div className="stat"><div className="n">{sys.volume ?? 0}</div><div className="l">Events</div></div>
            <div className="stat"><div className="n">{sys.logins ?? 0}</div><div className="l">Logins</div></div>
            <div className="stat"><div className="n">{sys.activeUsers ?? 0}</div><div className="l">Active users</div></div>
          </div>
          <table style={{ marginTop: 16 }}><thead><tr><th>Area</th><th>Events</th></tr></thead>
            <tbody>{Object.entries(sys.byArea ?? {}).map(([a, n]: any) => <tr key={a}><td>{a}</td><td>{n as any}</td></tr>)}{Object.keys(sys.byArea ?? {}).length === 0 && <Empty cols={2} text="No activity recorded yet." />}</tbody>
          </table>
        </>
      )}
      {view === "users" && (
        <table><thead><tr><th>User</th><th>Role</th><th>Events</th><th>Last active</th></tr></thead>
          <tbody>{users.map((u: any, i: number) => <tr key={u.userId || u.email || i}><td>{u.name || u.email || u.userId}</td><td>{u.role || "—"}</td><td>{u.events ?? u.count ?? "—"}</td><td className="mono muted">{dt(u.lastAt || u.lastActiveAt)}</td></tr>)}{users.length === 0 && <Empty cols={4} text="No user activity yet." />}</tbody>
        </table>
      )}
      {view === "roles" && (
        <table><thead><tr><th>Role</th><th>Active</th><th>Events</th></tr></thead>
          <tbody>{roles.map((r: any, i: number) => <tr key={r.role || i}><td>{r.role}</td><td>{r.active ?? "—"}</td><td>{r.events ?? r.count ?? "—"}</td></tr>)}{roles.length === 0 && <Empty cols={3} text="No role activity yet." />}</tbody>
        </table>
      )}
    </div>
  );
}

/* ============================ REPORTS ============================ */
function Reports() {
  const { data, err, reload } = useJson<any>("/api/platform/reports");
  const [f, setF] = useState({ type: "usage", scope: "platform", format: "json" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const reports: any[] = data?.reports ?? [];
  async function run(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/platform/reports", f); setMsg({ k: "ok", t: "Report generated." }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <>
      <div className="panel">
        <h2>Generate a report</h2>
        <p className="sub">Usage, subscription, engagement, adoption and event-tracking reports across the platform.</p>
        <Notice msg={msg} />
        <form onSubmit={run}>
          <div className="row">
            <div><label>Type</label><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{["usage", "subscription", "engagement", "event_tracking", "adoption", "parent_child"].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label>Scope</label><select value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value })}>{["platform", "tenant", "parent"].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
            <div><label>Format</label><select value={f.format} onChange={(e) => setF({ ...f, format: e.target.value })}>{["json", "csv"].map((t) => <option key={t} value={t}>{t}</option>)}</select></div>
          </div>
          <button type="submit" style={{ marginTop: 12 }}>Generate</button>
        </form>
      </div>
      <div className="panel">
        <h2>Recent reports</h2>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table><thead><tr><th>Type</th><th>Scope</th><th>Created</th></tr></thead>
          <tbody>{reports.map((r: any) => <tr key={r.id}><td><span className="badge role">{r.type}</span></td><td className="muted">{r.scope || "—"}</td><td className="mono muted">{dt(r.createdAt)}</td></tr>)}{reports.length === 0 && <Empty cols={3} text="No reports generated yet." />}</tbody>
        </table>
      </div>
    </>
  );
}

/* ============================ TEMPLATES ============================ */
const BLANK_TPL = { kind: "email_campaign", name: "", category: "", subject: "", body: "", sharedWithTenants: true };
function Templates() {
  const { data, err, reload } = useJson<any>("/api/platform/templates");
  const [f, setF] = useState<any>({ ...BLANK_TPL });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [view, setView] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ mode: "one" | "bulk"; row?: any } | null>(null);
  const sel = useSel();
  const sort = useSort<any>({ name: (t) => (t.name || "").toLowerCase(), kind: (t) => t.kind, category: (t) => (t.category || "").toLowerCase(), shared: (t) => (t.sharedWithTenants ? 1 : 0) }, "name");
  const all: any[] = data?.templates ?? [];
  const rows = sort.apply(all.filter((t) => matchQ(q, t.name, t.kind, t.category, t.subject)));
  const dirty = !!editId || f.name.trim().length > 0 || f.body.trim().length > 0;
  useDirty(dirty);
  const allOn = rows.length > 0 && rows.every((t) => sel.on(t.id));
  function reset() { setF({ ...BLANK_TPL }); setEditId(null); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const body = { kind: f.kind, name: f.name, category: f.category || undefined, subject: f.subject || undefined, body: f.body || undefined, sharedWithTenants: !!f.sharedWithTenants };
    try {
      if (editId) { await send(`/api/platform/templates/${editId}`, body, "PATCH"); setMsg({ k: "ok", t: "Template updated." }); }
      else { await send("/api/platform/templates", body); setMsg({ k: "ok", t: "Template created." }); }
      reset(); reload();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  function edit(t: any) { setEditId(t.id); setF({ kind: t.kind || "email_campaign", name: t.name || "", category: t.category || "", subject: t.subject || "", body: t.body || "", sharedWithTenants: !!t.sharedWithTenants }); if (typeof window !== "undefined") window.scrollTo({ top: 9e5, behavior: "smooth" }); }
  async function duplicate(t: any) {
    setMsg(null);
    try { await send("/api/platform/templates", { kind: t.kind, name: `${t.name} (copy)`, category: t.category || undefined, subject: t.subject || undefined, body: t.body || undefined, sharedWithTenants: !!t.sharedWithTenants }); setMsg({ k: "ok", t: "Template duplicated." }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function doDelete() {
    if (!confirm) return;
    const ids = confirm.mode === "bulk" ? sel.ids : [confirm.row.id];
    setMsg(null);
    let ok = 0;
    for (const id of ids) { try { await send(`/api/platform/templates/${id}`, {}, "DELETE"); ok++; } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
    setConfirm(null); sel.clear(); reload();
    if (ok) setMsg({ k: "ok", t: `${ok} template${ok === 1 ? "" : "s"} deleted.` });
  }
  return (
    <>
      {view && <DocModal title={view.name} meta={`${view.kind}${view.subject ? " · " + view.subject : ""}`} onClose={() => setView(null)}>{view.body || "(no content)"}</DocModal>}
      <ConfirmDialog open={confirm !== null} title={confirm?.mode === "bulk" ? "Delete selected templates?" : "Delete this template?"} message={confirm?.mode === "bulk" ? `${sel.ids.length} template(s) will be permanently deleted.` : `“${confirm?.row?.name}” will be permanently deleted.`} confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm(null)} />
      <div className="panel">
        <h2>Platform template library</h2>
        <p className="sub">Reusable email / message templates. Mark as shared to make them available to every tenant admin.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <TableTools q={q} setQ={setQ} count={rows.length} total={all.length}>
          {sel.ids.length > 0 && <button className="danger small" onClick={() => setConfirm({ mode: "bulk" })}>Delete selected ({sel.ids.length})</button>}
        </TableTools>
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(rows.map((t) => t.id), e.target.checked)} /></th>
            <SortTh label="Name" k="name" sort={sort} />
            <SortTh label="Kind" k="kind" sort={sort} />
            <SortTh label="Category" k="category" sort={sort} />
            <SortTh label="Shared" k="shared" sort={sort} />
            <th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((t: any) => (
              <tr key={t.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(t.id)} onChange={() => sel.toggle(t.id)} /></td>
                <td><strong>{t.name}</strong></td>
                <td className="muted">{t.kind}</td>
                <td className="muted">{t.category || "—"}</td>
                <td>{t.sharedWithTenants ? <span className="badge active">shared</span> : <span className="muted">private</span>}</td>
                <td className="right nowrap">
                  <button className="secondary small" onClick={() => setView(t)}>View</button>{" "}
                  <button className="secondary small" onClick={() => edit(t)}>Edit</button>{" "}
                  <button className="secondary small" onClick={() => duplicate(t)}>Duplicate</button>{" "}
                  <button className="danger small" onClick={() => setConfirm({ mode: "one", row: t })}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <Empty cols={6} text={all.length ? "No templates match your filter." : "No templates yet — use “Load default content”."} />}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>{editId ? "Edit template" : "New template"}</h2>
        <Notice msg={msg} />
        <form onSubmit={submit}>
          <div className="row">
            <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
            <div><label>Kind</label><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{["email_campaign", "message_board", "email_notification"].map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
          </div>
          <div className="row">
            <div><label>Category</label><input value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} /></div>
            <div><label>Subject</label><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} /></div>
          </div>
          <label>Body</label>
          <textarea rows={4} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <label className="consent" style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={f.sharedWithTenants} onChange={(e) => setF({ ...f, sharedWithTenants: e.target.checked })} /> Share with all tenants</label>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button type="submit">{editId ? "Update template" : "Create template"}</button>
            {editId && <button type="button" className="secondary" onClick={reset}>Cancel edit</button>}
          </div>
        </form>
      </div>
    </>
  );
}

/* ============================ POLICIES ============================ */
const BLANK_POL = { title: "", category: "data_protection", audience: "all", version: "", summary: "", body: "", fileUrl: "", requireAck: false, published: true };
function Policies() {
  const { data, err, reload } = useJson<any>("/api/platform/policies");
  const [f, setF] = useState<any>({ ...BLANK_POL });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [view, setView] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ mode: "one" | "bulk"; row?: any } | null>(null);
  const sel = useSel();
  const sort = useSort<any>({ title: (p) => (p.title || "").toLowerCase(), category: (p) => p.category || "", audience: (p) => p.audience || "", version: (p) => p.version || "", status: (p) => (p.published ? 1 : 0) }, "title");
  const all: any[] = data?.policies ?? [];
  const rows = sort.apply(all.filter((p) => matchQ(q, p.title, p.category, p.audience, p.summary)));
  const dirty = !!editId || f.title.trim().length > 0 || f.body.trim().length > 0;
  useDirty(dirty);
  const allOn = rows.length > 0 && rows.every((p) => sel.on(p.id));
  function reset() { setF({ ...BLANK_POL }); setEditId(null); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const body: any = { ...f }; if (!body.fileUrl) delete body.fileUrl;
    try {
      if (editId) { await send(`/api/platform/policies/${editId}`, body, "PATCH"); setMsg({ k: "ok", t: "Policy updated." }); }
      else { await send("/api/platform/policies", body); setMsg({ k: "ok", t: "Policy saved." }); }
      reset(); reload();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  function edit(p: any) { setEditId(p.id); setF({ title: p.title || "", category: p.category || "general", audience: p.audience || "all", version: p.version || "", summary: p.summary || "", body: p.body || "", fileUrl: p.fileUrl || "", requireAck: !!p.requireAck, published: !!p.published }); if (typeof window !== "undefined") window.scrollTo({ top: 9e5, behavior: "smooth" }); }
  async function duplicate(p: any) {
    setMsg(null);
    try { await send("/api/platform/policies", { title: `${p.title} (copy)`, category: p.category || undefined, audience: p.audience || undefined, version: p.version || undefined, summary: p.summary || undefined, body: p.body || undefined, ...(p.fileUrl ? { fileUrl: p.fileUrl } : {}), requireAck: !!p.requireAck, published: false }); setMsg({ k: "ok", t: "Policy duplicated (as draft)." }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function togglePublish(p: any) {
    setMsg(null);
    try { await send(`/api/platform/policies/${p.id}`, { published: !p.published }, "PATCH"); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function doDelete() {
    if (!confirm) return;
    const ids = confirm.mode === "bulk" ? sel.ids : [confirm.row.id];
    setMsg(null);
    let ok = 0;
    for (const id of ids) { try { await send(`/api/platform/policies/${id}`, {}, "DELETE"); ok++; } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
    setConfirm(null); sel.clear(); reload();
    if (ok) setMsg({ k: "ok", t: `${ok} polic${ok === 1 ? "y" : "ies"} deleted.` });
  }
  return (
    <>
      {view && <DocModal title={view.title} meta={`${view.category || "general"} · ${view.audience || "all"} · v${view.version || "1.0"}`} onClose={() => setView(null)}>
        {view.summary ? <p style={{ fontWeight: 600 }}>{view.summary}</p> : null}
        {view.body || (view.fileUrl ? "" : "(no content)")}
        {view.fileUrl ? <p style={{ marginTop: 12 }}><a href={view.fileUrl} target="_blank" rel="noreferrer">Open attached document</a></p> : null}
      </DocModal>}
      <ConfirmDialog open={confirm !== null} title={confirm?.mode === "bulk" ? "Delete selected policies?" : "Delete this policy?"} message={confirm?.mode === "bulk" ? `${sel.ids.length} policy(ies) will be permanently deleted.` : `“${confirm?.row?.title}” will be permanently deleted.`} confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm(null)} />
      <div className="panel">
        <h2>Platform policies</h2>
        <p className="sub">Data-protection, safeguarding and general policies pushed to all tenants. Toggle Publish to move a policy between draft and published.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <TableTools q={q} setQ={setQ} count={rows.length} total={all.length}>
          {sel.ids.length > 0 && <button className="danger small" onClick={() => setConfirm({ mode: "bulk" })}>Delete selected ({sel.ids.length})</button>}
        </TableTools>
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(rows.map((p) => p.id), e.target.checked)} /></th>
            <SortTh label="Title" k="title" sort={sort} />
            <SortTh label="Category" k="category" sort={sort} />
            <SortTh label="Audience" k="audience" sort={sort} />
            <SortTh label="Version" k="version" sort={sort} />
            <SortTh label="Status" k="status" sort={sort} />
            <th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((p: any) => (
              <tr key={p.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(p.id)} onChange={() => sel.toggle(p.id)} /></td>
                <td><strong>{p.title}</strong></td>
                <td className="muted">{p.category || "—"}</td>
                <td className="muted">{p.audience || "all"}</td>
                <td className="muted">{p.version || "—"}</td>
                <td>{p.published ? <span className="badge published">published</span> : <span className="badge draft">draft</span>}</td>
                <td className="right nowrap">
                  <button className="secondary small" onClick={() => setView(p)}>View</button>{" "}
                  <button className="secondary small" onClick={() => edit(p)}>Edit</button>{" "}
                  <button className="secondary small" onClick={() => togglePublish(p)}>{p.published ? "Unpublish" : "Publish"}</button>{" "}
                  <button className="secondary small" onClick={() => duplicate(p)}>Duplicate</button>{" "}
                  <button className="danger small" onClick={() => setConfirm({ mode: "one", row: p })}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <Empty cols={7} text={all.length ? "No policies match your filter." : "No policies yet — use “Load default content”."} />}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>{editId ? "Edit policy" : "New policy"}</h2>
        <Notice msg={msg} />
        <form onSubmit={submit}>
          <div className="row">
            <div><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
            <div><label>Version</label><input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="1.0" /></div>
          </div>
          <div className="row">
            <div><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["safeguarding", "data_protection", "behaviour", "transport", "general"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label>Audience</label><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{["all", "parents", "teachers", "staff"].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          </div>
          <label>Summary</label>
          <textarea rows={2} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} />
          <label>Full policy text</label>
          <textarea rows={6} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
          <label>Or link to an uploaded document (URL)</label>
          <input type="url" value={f.fileUrl} onChange={(e) => setF({ ...f, fileUrl: e.target.value })} placeholder="https://…" />
          <label className="consent" style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published (untick to save as draft)</label>
          <label className="consent" style={{ display: "block", marginTop: 6 }}><input type="checkbox" checked={f.requireAck} onChange={(e) => setF({ ...f, requireAck: e.target.checked })} /> Require acknowledgement</label>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button type="submit">{editId ? "Update policy" : "Save policy"}</button>
            {editId && <button type="button" className="secondary" onClick={reset}>Cancel edit</button>}
          </div>
        </form>
      </div>
    </>
  );
}

/* ============================ CRM ============================ */
const AUDIENCE_KEYS = ["subscriber", "parent", "driver", "tenant_admin", "teacher", "transport_manager", "lead"];

// Lightweight rich-text editor (contentEditable) producing HTML for campaign bodies.
function RichText({ value, onChange, placeholder }: { value: string; onChange: (html: string) => void; placeholder?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value || ""; }, [value]);
  function cmd(command: string, arg?: string) { document.execCommand(command, false, arg); ref.current?.focus(); onChange(ref.current?.innerHTML || ""); }
  function link() { const url = window.prompt("Link URL (https://…)"); if (url) cmd("createLink", url); }
  const btn = (label: any, fn: () => void, key: string) => <button key={key} type="button" className="rte-btn" onMouseDown={(e) => e.preventDefault()} onClick={fn}>{label}</button>;
  return (
    <div className="rte">
      <div className="rte-tb">
        {btn(<b>B</b>, () => cmd("bold"), "b")}
        {btn(<i>I</i>, () => cmd("italic"), "i")}
        {btn(<u>U</u>, () => cmd("underline"), "u")}
        {btn("H", () => cmd("formatBlock", "H3"), "h")}
        {btn("• List", () => cmd("insertUnorderedList"), "ul")}
        {btn("1. List", () => cmd("insertOrderedList"), "ol")}
        {btn("Link", link, "a")}
        {btn("Clear", () => cmd("removeFormat"), "x")}
      </div>
      <div ref={ref} className="rte-area" contentEditable suppressContentEditableWarning
        onInput={() => onChange(ref.current?.innerHTML || "")} data-ph={placeholder || "Write your email… use {{name}} to personalise."} />
    </div>
  );
}

function StatTiles({ s }: { s: any }) {
  const tiles: [string, any][] = [
    ["Recipients", s?.total ?? 0], ["Sent", s?.sent ?? 0], ["Opened", `${s?.opened ?? 0} (${s?.openRate ?? 0}%)`],
    ["Clicked", `${s?.clicked ?? 0} (${s?.clickRate ?? 0}%)`], ["Failed", s?.failed ?? 0], ["Unsub", s?.unsub ?? 0],
  ];
  return <div className="stat-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))" }}>{tiles.map(([l, v]) => <div className="stat" key={l}><div className="n" style={{ fontSize: 20 }}>{v}</div><div className="l">{l}</div></div>)}</div>;
}

function CampaignReport({ id, onClose }: { id: string; onClose: () => void }) {
  const { data, err } = useJson<any>(`/api/crm/campaigns/${id}`);
  const stats = data?.stats;
  const recipients: any[] = data?.recipients ?? [];
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 820 }} onClick={(e) => e.stopPropagation()}>
        <div className="flex-between"><h2 style={{ margin: 0 }}>{data?.campaign?.name || "Campaign report"}</h2><button className="secondary small" onClick={onClose}>Close</button></div>
        <p className="sub">{data?.campaign?.subject}</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <StatTiles s={stats} />
        <h3 style={{ marginTop: 16, fontSize: 15 }}>Recipients</h3>
        <div style={{ maxHeight: 320, overflow: "auto" }}>
          <table><thead><tr><th>Email</th><th>Status</th><th>Sent</th><th>Opened</th><th>Clicked</th></tr></thead>
            <tbody>
              {recipients.map((r) => <tr key={r.id}><td className="mono">{r.email}</td><td><span className={`badge ${r.status === "clicked" || r.status === "opened" ? "active" : r.status === "failed" ? "suspended" : "role"}`}>{r.status}</span></td><td className="mono muted">{r.sentAt ? new Date(r.sentAt).toLocaleString() : "—"}</td><td className="mono muted">{r.openedAt ? new Date(r.openedAt).toLocaleString() : "—"}</td><td className="mono muted">{r.clickedAt ? new Date(r.clickedAt).toLocaleString() : "—"}</td></tr>)}
              {recipients.length === 0 && <Empty cols={5} text="No recipients yet — send the campaign to populate this." />}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Crm() {
  const contacts = useJson<any>("/api/crm/contacts");
  const campaigns = useJson<any>("/api/crm/campaigns");
  const [c, setC] = useState({ email: "", name: "", audience: "subscriber" });
  const [camp, setCamp] = useState<{ name: string; subject: string; body: string; audiences: Record<string, boolean> }>({ name: "", subject: "", body: "", audiences: { subscriber: true } });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; danger?: boolean; run: () => void }>(null);
  const [report, setReport] = useState<string | null>(null);
  const list: any[] = contacts.data?.contacts ?? [];
  const campList: any[] = campaigns.data?.campaigns ?? [];
  const dirty = !!(camp.name || camp.subject || camp.body);
  useDirty(dirty);

  async function addContact(e: React.FormEvent) { e.preventDefault(); setMsg(null); try { await send("/api/crm/contacts", { ...c, consent: true }); setMsg({ k: "ok", t: "Contact saved." }); setC({ email: "", name: "", audience: "subscriber" }); contacts.reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function sync() { setMsg(null); try { const r = await send("/api/crm/audiences", { roles: ["Parent", "Teacher", "Driver"] }); setMsg({ k: "ok", t: `Synced ${r.synced ?? 0} contacts.` }); contacts.reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function createCampaign(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const audiences = Object.keys(camp.audiences).filter((a) => camp.audiences[a]);
    if (!audiences.length) { setMsg({ k: "err", t: "Choose at least one audience." }); return; }
    try {
      const r = await send("/api/crm/campaigns", { name: camp.name, subject: camp.subject, body: camp.body, audience: { audiences } });
      setMsg({ k: "ok", t: `Campaign created — ~${r.estimatedRecipients ?? 0} recipient(s). Use Send when ready.` });
      setCamp({ name: "", subject: "", body: "", audiences: { subscriber: true } });
      campaigns.reload();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function action(id: string, act: string, extra?: any, okText?: string) {
    setMsg(null);
    try { const r = await send(`/api/crm/campaigns/${id}/action`, { action: act, ...extra }); setMsg({ k: "ok", t: okText || (r.sent !== undefined ? `Sent to ${r.sent}, ${r.failed} failed (of ${r.total}).` : "Done.") }); campaigns.reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  function askSend(k: any) { setConfirm({ title: `Send “${k.name}”?`, message: "This emails every resolved recipient now and starts open/click tracking. This can't be undone.", label: "Send campaign", danger: true, run: () => { action(k.id, "send"); setConfirm(null); } }); }
  function test(k: any) { const email = window.prompt("Send a test copy to which email?"); if (email) action(k.id, "test", { testEmail: email }, `Test sent to ${email}.`); }

  return (
    <>
      {report && <CampaignReport id={report} onClose={() => setReport(null)} />}
      <ConfirmDialog open={!!confirm} title={confirm?.title || ""} message={confirm?.message || ""} confirmLabel={confirm?.label || "Confirm"} danger={confirm?.danger} onConfirm={() => confirm?.run()} onCancel={() => setConfirm(null)} />
      <div className="panel">
        <h2>CRM — contacts</h2>
        <p className="sub">Marketing contacts across all audiences. Sync platform users in to reach them with campaigns.</p>
        <Notice msg={msg} />
        <div style={{ marginBottom: 12 }}><button className="secondary small" onClick={sync}>Sync platform users → contacts</button></div>
        <table><thead><tr><th>Contact</th><th>Audience</th><th>Status</th></tr></thead>
          <tbody>{list.slice(0, 100).map((k: any) => <tr key={k.id || k.email}><td><strong>{k.name || k.email}</strong><div className="mono muted">{k.email}</div></td><td className="muted">{k.audience || "—"}</td><td>{k.status || k.consent ? <span className="badge active">{k.status || "opted-in"}</span> : <span className="muted">—</span>}</td></tr>)}{list.length === 0 && <Empty cols={3} text="No contacts yet — add one or sync users." />}</tbody>
        </table>
        <form onSubmit={addContact} style={{ marginTop: 12 }}>
          <div className="row">
            <div><label>Email</label><input type="email" value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} required /></div>
            <div><label>Name</label><input value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></div>
            <div><label>Audience</label><select value={c.audience} onChange={(e) => setC({ ...c, audience: e.target.value })}>{AUDIENCE_KEYS.map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          </div>
          <button type="submit" style={{ marginTop: 8 }}>Add contact</button>
        </form>
      </div>

      <div className="panel">
        <h2>CRM — campaigns</h2>
        <p className="sub">Create a rich-text email, choose the audience, send it, and track opens &amp; clicks. Open the report on any sent campaign for per-recipient detail.</p>
        <table><thead><tr><th>Name</th><th>Status</th><th>Sent</th><th>Opened</th><th>Clicked</th><th>Created</th><th className="right">Actions</th></tr></thead>
          <tbody>{campList.map((k: any) => (
            <tr key={k.id}>
              <td><strong>{k.name}</strong><div className="muted" style={{ fontSize: 12 }}>{k.subject}</div></td>
              <td><span className={`badge ${k.status === "sent" ? "active" : k.status === "failed" ? "suspended" : "role"}`}>{k.status}</span></td>
              <td>{k.sentCount ?? 0}</td>
              <td>{k.openCount ?? 0}</td>
              <td>{k.clickCount ?? 0}</td>
              <td className="mono muted">{dt(k.createdAt)}</td>
              <td className="right nowrap">
                {["draft", "scheduled"].includes(k.status) && <><button className="small" onClick={() => askSend(k)}>Send</button>{" "}</>}
                <button className="secondary small" onClick={() => test(k)}>Test</button>{" "}
                <button className="secondary small" onClick={() => setReport(k.id)}>Report</button>{" "}
                <button className="secondary small" onClick={() => action(k.id, "duplicate", undefined, "Duplicated as draft.")}>Duplicate</button>
                {["draft", "scheduled"].includes(k.status) && <>{" "}<button className="danger small" onClick={() => action(k.id, "cancel", undefined, "Cancelled.")}>Cancel</button></>}
              </td>
            </tr>
          ))}{campList.length === 0 && <Empty cols={7} text="No campaigns yet — create one below." />}</tbody>
        </table>
      </div>

      <div className="panel">
        <h2>New campaign</h2>
        <form onSubmit={createCampaign}>
          <div className="row">
            <div><label>Campaign name</label><input value={camp.name} onChange={(e) => setCamp({ ...camp, name: e.target.value })} required /></div>
            <div><label>Subject</label><input value={camp.subject} onChange={(e) => setCamp({ ...camp, subject: e.target.value })} required /></div>
          </div>
          <label style={{ marginTop: 8 }}>Audience</label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
            {AUDIENCE_KEYS.map((a) => (
              <label key={a} className="consent" style={{ display: "flex", alignItems: "center", gap: 6, margin: 0 }}>
                <input type="checkbox" checked={!!camp.audiences[a]} onChange={(e) => setCamp({ ...camp, audiences: { ...camp.audiences, [a]: e.target.checked } })} /> {a}
              </label>
            ))}
          </div>
          <label style={{ marginTop: 10 }}>Email body</label>
          <RichText value={camp.body} onChange={(html) => setCamp((prev) => ({ ...prev, body: html }))} />
          <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Personalise with {"{{name}}"} and include an unsubscribe link with {"{{unsubscribe}}"}. Links are automatically click-tracked and an open pixel is added on send.</p>
          <button type="submit" style={{ marginTop: 12 }}>Create campaign (draft)</button>
        </form>
      </div>
    </>
  );
}

/* ============================ HELP VIDEOS (CMS) ============================ */
const BLANK_VID = { title: "", url: "", category: "getting_started", audience: "all", description: "", published: true };
function Videos() {
  const { data, err, reload } = useJson<any>("/api/cms/videos?admin=1");
  const [f, setF] = useState<any>({ ...BLANK_VID });
  const [editId, setEditId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [view, setView] = useState<any | null>(null);
  const [q, setQ] = useState("");
  const [confirm, setConfirm] = useState<{ mode: "one" | "bulk"; row?: any } | null>(null);
  const sel = useSel();
  const sort = useSort<any>({ title: (v) => (v.title || "").toLowerCase(), category: (v) => v.category || "", audience: (v) => v.audience || "", status: (v) => (v.published ? 1 : 0) }, "title");
  const all: any[] = data?.videos ?? [];
  const rows = sort.apply(all.filter((v) => matchQ(q, v.title, v.category, v.audience, v.description)));
  const dirty = !!editId || f.title.trim().length > 0 || f.url.trim().length > 0;
  useDirty(dirty);
  const allOn = rows.length > 0 && rows.every((v) => sel.on(v.id));
  function reset() { setF({ ...BLANK_VID }); setEditId(null); }
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const body = { title: f.title, url: f.url, category: f.category, audience: f.audience, description: f.description || undefined, published: !!f.published };
    try {
      if (editId) { await send(`/api/cms/videos/${editId}`, body, "PATCH"); setMsg({ k: "ok", t: "Video updated." }); }
      else { await send("/api/cms/videos", body); setMsg({ k: "ok", t: "Video added." }); }
      reset(); reload();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  function edit(v: any) { setEditId(v.id); setF({ title: v.title || "", url: v.url || "", category: v.category || "getting_started", audience: v.audience || "all", description: v.description || "", published: !!v.published }); if (typeof window !== "undefined") window.scrollTo({ top: 9e5, behavior: "smooth" }); }
  async function duplicate(v: any) {
    setMsg(null);
    try { await send("/api/cms/videos", { title: `${v.title} (copy)`, url: v.url, category: v.category || "getting_started", audience: v.audience || "all", description: v.description || undefined, published: false }); setMsg({ k: "ok", t: "Video duplicated (as draft)." }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function togglePublish(v: any) {
    setMsg(null);
    try { await send(`/api/cms/videos/${v.id}`, { published: !v.published }, "PATCH"); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function doDelete() {
    if (!confirm) return;
    const ids = confirm.mode === "bulk" ? sel.ids : [confirm.row.id];
    setMsg(null);
    let ok = 0;
    for (const id of ids) { try { await send(`/api/cms/videos/${id}`, {}, "DELETE"); ok++; } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
    setConfirm(null); sel.clear(); reload();
    if (ok) setMsg({ k: "ok", t: `${ok} video${ok === 1 ? "" : "s"} deleted.` });
  }
  return (
    <>
      {view && <DocModal title={view.title} meta={`${view.category || "general"} · ${view.audience || "all"}`} onClose={() => setView(null)}>
        {view.description || "(no description)"}
        {view.url ? <p style={{ marginTop: 12 }}><a href={view.url} target="_blank" rel="noreferrer">Open video</a></p> : null}
      </DocModal>}
      <ConfirmDialog open={confirm !== null} title={confirm?.mode === "bulk" ? "Delete selected videos?" : "Delete this video?"} message={confirm?.mode === "bulk" ? `${sel.ids.length} video(s) will be permanently deleted.` : `“${confirm?.row?.title}” will be permanently deleted.`} confirmLabel="Delete" danger onConfirm={doDelete} onCancel={() => setConfirm(null)} />
      <div className="panel">
        <h2>Help Centre videos</h2>
        <p className="sub">How-to videos shown across the platform Help Centre. Toggle Publish to move a video between draft and published.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <TableTools q={q} setQ={setQ} count={rows.length} total={all.length}>
          {sel.ids.length > 0 && <button className="danger small" onClick={() => setConfirm({ mode: "bulk" })}>Delete selected ({sel.ids.length})</button>}
        </TableTools>
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" checked={allOn} onChange={(e) => sel.setMany(rows.map((v) => v.id), e.target.checked)} /></th>
            <SortTh label="Title" k="title" sort={sort} />
            <SortTh label="Category" k="category" sort={sort} />
            <SortTh label="Audience" k="audience" sort={sort} />
            <SortTh label="Status" k="status" sort={sort} />
            <th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((v: any) => (
              <tr key={v.id}>
                <td className="checkbox-cell"><input type="checkbox" checked={sel.on(v.id)} onChange={() => sel.toggle(v.id)} /></td>
                <td><strong>{v.title}</strong></td>
                <td className="muted">{v.category || "—"}</td>
                <td className="muted">{v.audience || "all"}</td>
                <td>{v.published ? <span className="badge published">published</span> : <span className="badge draft">draft</span>}</td>
                <td className="right nowrap">
                  <button className="secondary small" onClick={() => setView(v)}>View</button>{" "}
                  <button className="secondary small" onClick={() => edit(v)}>Edit</button>{" "}
                  <button className="secondary small" onClick={() => togglePublish(v)}>{v.published ? "Unpublish" : "Publish"}</button>{" "}
                  <button className="secondary small" onClick={() => duplicate(v)}>Duplicate</button>{" "}
                  <button className="danger small" onClick={() => setConfirm({ mode: "one", row: v })}>Delete</button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <Empty cols={6} text={all.length ? "No videos match your filter." : "No videos yet — use “Load default content”."} />}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>{editId ? "Edit video" : "Add a video"}</h2>
        <Notice msg={msg} />
        <form onSubmit={submit}>
          <div className="row">
            <div><label>Title</label><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required /></div>
            <div><label>Video URL</label><input type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} required /></div>
          </div>
          <div className="row">
            <div><label>Category</label><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{["getting_started", "parents", "staff", "transport", "integrations", "admin"].map((c) => <option key={c} value={c}>{c}</option>)}</select></div>
            <div><label>Audience</label><select value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}>{["all", "parent", "staff", "admin", "driver"].map((a) => <option key={a} value={a}>{a}</option>)}</select></div>
          </div>
          <label>Description</label>
          <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <label className="consent" style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} /> Published (untick to save as draft)</label>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button type="submit">{editId ? "Update video" : "Add video"}</button>
            {editId && <button type="button" className="secondary" onClick={reset}>Cancel edit</button>}
          </div>
        </form>
      </div>
    </>
  );
}

/* ============================ SUPPORT ============================ */
function Support() {
  const { data, err, reload } = useJson<any>("/api/platform/support-chats");
  const schoolsQ = useJson<any>("/api/schools");
  const [f, setF] = useState({ schoolId: "", subject: "", message: "" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const chats: any[] = data?.chats ?? [];
  const schools: any[] = schoolsQ.data?.schools ?? [];
  async function open(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/platform/support-chats", f); setMsg({ k: "ok", t: "Support chat opened." }); setF({ schoolId: "", subject: "", message: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <>
      <div className="panel">
        <h2>Support helpdesk</h2>
        <p className="sub">Conversations between SIPlat support and each school's tenant admin.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table><thead><tr><th>Subject</th><th>School</th><th>Messages</th><th>Last activity</th></tr></thead>
          <tbody>{chats.map((c: any) => <tr key={c.id}><td><strong>{c.subject}</strong></td><td className="muted">{c.school?.name || c.schoolId}</td><td>{c.messages?.length ?? 0}</td><td className="mono muted">{dt(c.lastMessageAt)}</td></tr>)}{chats.length === 0 && <Empty cols={4} text="No support chats yet." />}</tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Open a support chat</h2>
        <Notice msg={msg} />
        <form onSubmit={open}>
          <div className="row">
            <div><label>School</label><select value={f.schoolId} onChange={(e) => setF({ ...f, schoolId: e.target.value })} required><option value="">— select —</option>{schools.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
            <div><label>Subject</label><input value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} required /></div>
          </div>
          <label>First message</label>
          <textarea rows={3} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
          <button type="submit" style={{ marginTop: 12 }}>Open chat</button>
        </form>
      </div>
    </>
  );
}

/* ============================ EMAIL CONFIG ============================ */
function EmailCfg() {
  const { data, err, reload } = useJson<any>("/api/platform/email-config");
  const [f, setF] = useState<any>({ provider: "console", fromName: "", fromEmail: "", host: "", port: "", username: "", secret: "" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  useEffect(() => { if (data) setF((prev: any) => ({ ...prev, provider: data.provider ?? "console", fromName: data.fromName ?? "", fromEmail: data.fromEmail ?? "", host: data.host ?? "", port: data.port ?? "", username: data.username ?? "" })); }, [data]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const body: any = { provider: f.provider, fromName: f.fromName || undefined, fromEmail: f.fromEmail || undefined, host: f.host || undefined, username: f.username || undefined };
    if (f.port) body.port = Number(f.port);
    if (f.secret) body.secret = f.secret;
    try { await send("/api/platform/email-config", body, "PUT"); setMsg({ k: "ok", t: "Email settings saved." }); setF({ ...f, secret: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <div className="panel">
      <h2>Email configuration</h2>
      <p className="sub">How the platform sends email. The secret is encrypted at rest and never shown again. {data?.secretSet ? "A secret is currently set." : ""}</p>
      {err && <Notice msg={{ k: "err", t: err }} />}
      <Notice msg={msg} />
      <form onSubmit={save}>
        <div className="row">
          <div><label>Provider</label><select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}>{["console", "smtp", "postmark", "ses", "resend"].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
          <div><label>From name</label><input value={f.fromName} onChange={(e) => setF({ ...f, fromName: e.target.value })} /></div>
        </div>
        <div className="row">
          <div><label>From email</label><input type="email" value={f.fromEmail} onChange={(e) => setF({ ...f, fromEmail: e.target.value })} /></div>
          <div><label>SMTP host (if smtp)</label><input value={f.host} onChange={(e) => setF({ ...f, host: e.target.value })} /></div>
        </div>
        <div className="row">
          <div><label>Port</label><input type="number" value={f.port} onChange={(e) => setF({ ...f, port: e.target.value })} /></div>
          <div><label>Username</label><input value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} /></div>
        </div>
        <label>API key / password {data?.secretSet ? "(leave blank to keep current)" : ""}</label>
        <input type="password" value={f.secret} onChange={(e) => setF({ ...f, secret: e.target.value })} />
        <button type="submit" style={{ marginTop: 12 }}>Save email settings</button>
      </form>
    </div>
  );
}

/* ============================ AUDIT ============================ */
type Audit = { id: string; action: string; actorEmail: string | null; school?: { name: string } | null; createdAt: string; metadata: string };
function AuditTab() {
  const [entries, setEntries] = useState<Audit[]>([]);
  useEffect(() => { fetch("/api/audit").then((r) => r.json()).then((d) => setEntries(d.entries ?? [])); }, []);
  return (
    <div className="panel">
      <h2>Platform audit trail</h2>
      <p className="sub">The 300 most recent events across all tenants.</p>
      <table><thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Tenant</th></tr></thead>
        <tbody>{entries.map((e) => <tr key={e.id}><td className="mono muted">{dt(e.createdAt)}</td><td><span className="badge role">{e.action}</span></td><td>{e.actorEmail ?? <span className="muted">system</span>}</td><td>{e.school?.name ?? <span className="muted">platform</span>}</td></tr>)}{entries.length === 0 && <Empty cols={4} text="No audit entries." />}</tbody>
      </table>
    </div>
  );
}

/* ============================ STARTER CONTENT + PACKAGES ============================ */
function SeedRow() {
  const plans = useJson<any>("/api/plans");
  const pol = useJson<any>("/api/platform/policies");
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [justLoaded, setJustLoaded] = useState(false);
  // Consider default content already present once packages AND policies exist.
  const hasContent = (plans.data?.plans?.length ?? 0) > 0 && (pol.data?.policies?.length ?? 0) > 0;
  const loaded = justLoaded || hasContent;
  async function load() {
    setBusy(true); setMsg(null);
    try {
      const r = await send("/api/platform/seed-defaults", {});
      setMsg({ k: "ok", t: `Starter content ready — ${r.policies} policies, ${r.videos} videos, ${r.templates} templates, ${r.plans} packages. Open the tabs to view.` });
      setJustLoaded(true); plans.reload(); pol.reload();
    }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
    finally { setBusy(false); }
  }
  return (
    <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div><strong>Starter content</strong><div className="muted" style={{ fontSize: 13 }}>{loaded ? "Default packages, policies, help videos and templates are loaded. Manage them from the Content tabs." : "Load default packages, policies, help videos and templates to get started. This runs once."}</div></div>
      <div style={{ textAlign: "right" }}>
        <button disabled={busy || loaded} onClick={load}>{loaded ? "Default content loaded ✓" : busy ? "Loading…" : "Load default content"}</button>
        {msg && <div className={`notice ${msg.k === "ok" ? "ok" : "err"}`} style={{ marginTop: 8, maxWidth: 540 }}>{msg.t}</div>}
      </div>
    </div>
  );
}

function Packages() {
  const { data, err, reload } = useJson<any>("/api/plans");
  const [f, setF] = useState({ key: "", name: "", perStudentGBP: "", perSchoolGBP: "", perVehicleGBP: "", aiQueryLimit: "0", features: "", isActive: true });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const plans: any[] = data?.plans ?? [];
  const gbp = (pence: number) => !pence ? "—" : `£${(pence / 100).toFixed(2)}`;
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try {
      await send("/api/plans", {
        key: f.key.trim().toLowerCase(), name: f.name,
        pricePerStudent: Math.round(parseFloat(f.perStudentGBP || "0") * 100),
        pricePerSchool: Math.round(parseFloat(f.perSchoolGBP || "0") * 100),
        pricePerVehicle: Math.round(parseFloat(f.perVehicleGBP || "0") * 100),
        aiQueryLimit: parseInt(f.aiQueryLimit || "0", 10),
        features: f.features, isActive: f.isActive,
      });
      setMsg({ k: "ok", t: `Package "${f.name}" saved.` });
      setF({ key: "", name: "", perStudentGBP: "", perSchoolGBP: "", perVehicleGBP: "", aiQueryLimit: "0", features: "", isActive: true });
      reload();
    } catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function toggle(key: string, isActive: boolean) { try { await send(`/api/plans?key=${encodeURIComponent(key)}`, { isActive }, "PATCH"); reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  function edit(p: any) { setF({ key: p.key, name: p.name, perStudentGBP: p.pricePerStudent ? (p.pricePerStudent / 100).toString() : "", perSchoolGBP: p.pricePerSchool ? (p.pricePerSchool / 100).toString() : "", perVehicleGBP: p.pricePerVehicle ? (p.pricePerVehicle / 100).toString() : "", aiQueryLimit: String(p.aiQueryLimit ?? 0), features: p.features || "", isActive: p.isActive }); if (typeof window !== "undefined") window.scrollTo({ top: 9999, behavior: "smooth" }); }
  return (
    <>
      <div className="panel">
        <h2>Subscription packages</h2>
        <p className="sub">The plans schools can subscribe to. Prices shown per year. Edit a package to change its price or features.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table>
          <thead><tr><th>Package</th><th>Per pupil</th><th>Per school</th><th>Per vehicle</th><th>AI limit</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {plans.map((p: any) => (
              <tr key={p.key}>
                <td><strong>{p.name}</strong><div className="mono muted">{p.key}</div></td>
                <td>{gbp(p.pricePerStudent)}</td><td>{gbp(p.pricePerSchool)}</td><td>{gbp(p.pricePerVehicle)}</td>
                <td className="muted">{p.aiQueryLimit === -1 ? "Unlimited" : p.aiQueryLimit}</td>
                <td>{p.isActive ? <span className="badge active">active</span> : <span className="badge archived">inactive</span>}</td>
                <td className="right"><button className="secondary small" onClick={() => edit(p)}>Edit</button> <button className="secondary small" onClick={() => toggle(p.key, !p.isActive)}>{p.isActive ? "Deactivate" : "Activate"}</button></td>
              </tr>
            ))}
            {plans.length === 0 && <Empty cols={7} text="No packages yet — create one below or use “Load default content”." />}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Create / edit a package</h2>
        <p className="sub">Use a short lowercase key (e.g. premium). Saving an existing key updates it. Prices in £; AI limit −1 = unlimited.</p>
        <Notice msg={msg} />
        <form onSubmit={save}>
          <div className="row">
            <div><label>Key</label><input value={f.key} onChange={(e) => setF({ ...f, key: e.target.value })} placeholder="premium" required /></div>
            <div><label>Name</label><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Premium" required /></div>
          </div>
          <div className="row">
            <div><label>£ per pupil / year</label><input type="number" step="0.01" value={f.perStudentGBP} onChange={(e) => setF({ ...f, perStudentGBP: e.target.value })} /></div>
            <div><label>£ per school / year</label><input type="number" step="0.01" value={f.perSchoolGBP} onChange={(e) => setF({ ...f, perSchoolGBP: e.target.value })} /></div>
            <div><label>£ per vehicle / year</label><input type="number" step="0.01" value={f.perVehicleGBP} onChange={(e) => setF({ ...f, perVehicleGBP: e.target.value })} /></div>
          </div>
          <div className="row">
            <div><label>AI query limit / month</label><input type="number" value={f.aiQueryLimit} onChange={(e) => setF({ ...f, aiQueryLimit: e.target.value })} /></div>
            <div><label>Features (comma-separated)</label><input value={f.features} onChange={(e) => setF({ ...f, features: e.target.value })} placeholder="core,messaging,transport" /></div>
          </div>
          <label className="consent" style={{ marginTop: 10 }}><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active (available for new subscriptions)</label>
          <button type="submit" style={{ marginTop: 12 }}>Save package</button>
        </form>
      </div>
    </>
  );
}

/* ============================ SHARED: document viewer ============================ */
function DocModal({ title, meta, children, onClose }: { title: string; meta?: string; children: any; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(16,24,40,.5)", zIndex: 60, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "6vh 16px", overflowY: "auto" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 720, width: "100%", padding: 26, boxShadow: "var(--shadow-lg)" }}>
        <div className="flex-between" style={{ marginBottom: 4 }}><h2 style={{ margin: 0 }}>{title}</h2><button className="secondary small" onClick={onClose}>Close</button></div>
        {meta && <div className="mono muted" style={{ marginBottom: 14 }}>{meta}</div>}
        <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{children}</div>
      </div>
    </div>
  );
}

/* ============================ INTEGRATIONS (catalogue) ============================ */
function Integrations() {
  const { data, err } = useJson<any>("/api/platform/integrations");
  const [q, setQ] = useState("");
  const connectors: any[] = data?.connectors ?? [];
  const catLabels: any = data?.categoryLabels ?? {};
  const statusLabels: any = data?.statusLabels ?? {};
  const filtered = connectors.filter((c) => !q || `${c.name} ${c.provider} ${c.description} ${c.category}`.toLowerCase().includes(q.toLowerCase()));
  const byCat: Record<string, any[]> = {};
  filtered.forEach((c) => { (byCat[c.category] = byCat[c.category] || []).push(c); });
  const statusClass = (s: string) => s === "available" ? "active" : s === "beta" ? "trial" : s === "unavailable" ? "suspended" : "archived";
  return (
    <div className="panel">
      <div className="flex-between"><h2>Integration catalogue</h2><span className="muted">{connectors.length} connectors</span></div>
      <p className="sub">Everything your schools can connect — MIS, LMS, payments, safeguarding, GPS/telematics, maps and more. Schools configure their own connections in each school&apos;s Integration Hub.</p>
      {err && <Notice msg={{ k: "err", t: err }} />}
      <input placeholder="Search connectors…" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 18 }} />
      {Object.keys(byCat).sort().map((cat) => (
        <div key={cat} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 12.5, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--muted)", margin: "0 0 10px" }}>{catLabels[cat] || cat} <span style={{ opacity: .6 }}>· {byCat[cat].length}</span></h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(250px,1fr))", gap: 12 }}>
            {byCat[cat].map((c) => (
              <div key={c.key} style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 15, background: "#fff", boxShadow: "var(--shadow-sm)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 5 }}><span style={{ fontSize: 22 }}>{c.icon}</span><strong>{c.name}</strong></div>
                <div className="muted" style={{ fontSize: 12.5, minHeight: 36, lineHeight: 1.45 }}>{c.description}</div>
                <div style={{ marginTop: 9, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <span className={`badge ${statusClass(c.status)}`}>{statusLabels[c.status] || c.status}</span>
                  <span className="badge role">{c.connectionType}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {connectors.length === 0 && !err && <p className="muted">Loading…</p>}
    </div>
  );
}

/* ============================ TROUBLESHOOTING ============================ */
function Troubleshooting() {
  const health = useJson<any>("/api/health");
  const email = useJson<any>("/api/platform/email-config");
  const plans = useJson<any>("/api/plans");
  const policies = useJson<any>("/api/platform/policies");
  const videos = useJson<any>("/api/cms/videos?admin=1");
  const checks = [
    { label: "Database connection", ok: health.data?.status === "ok", detail: health.data?.db === "up" ? "Connected" : (health.err || "Checking…") },
    { label: "Email provider configured", ok: !!email.data && email.data.provider !== "console", detail: email.data ? (email.data.provider === "console" ? "Console mode — set a real provider in the Email tab" : `Provider: ${email.data.provider}`) : "Checking…" },
    { label: "Subscription packages", ok: (plans.data?.plans?.length ?? 0) > 0, detail: `${plans.data?.plans?.length ?? 0} packages` },
    { label: "Default policies loaded", ok: (policies.data?.policies?.length ?? 0) > 0, detail: `${policies.data?.policies?.length ?? 0} policies` },
    { label: "Help videos loaded", ok: (videos.data?.videos?.length ?? 0) > 0, detail: `${videos.data?.videos?.length ?? 0} videos` },
  ];
  const guide = [
    { t: "A school's data isn't syncing", s: "Open the school → Integration Hub → check the connection's last run and error log. Re-enter credentials if the provider reports an authentication error, and confirm the scheduled sync is running (see “scheduled jobs” below)." },
    { t: "Emails aren't arriving", s: "Go to the Email tab and set a real provider (SMTP / Postmark / SES / Resend) with a verified sender address. In console mode, emails are only logged, never sent — password-reset and notification emails won't reach users until this is set." },
    { t: "A user can't log in", s: "Check the user isn't suspended and their tenant isn't suspended (Tenants tab). Ask them to use “Forgot password?” on the sign-in page to reset. If MFA is enabled, confirm they're using a current authenticator code." },
    { t: "Scheduled jobs (report release / integration sync) aren't running", s: "These fire from an external scheduler calling /api/cron/release-reports and /api/cron/integration-sync with an x-cron-secret header. Confirm the scheduler is active and the secret matches the CRON_SECRET environment variable." },
    { t: "A custom domain shows a certificate or 'not secure' error", s: "Confirm the domain's DNS points to the app host and the HTTPS certificate has been issued. Allow time for DNS changes to propagate before retrying." },
    { t: "Starter content (policies, packages, videos) is missing", s: "Use the “Load default content” button at the top of this console — it's safe to run anytime and won't overwrite anything you've edited." },
  ];
  return (
    <>
      <div className="panel">
        <h2>System status &amp; diagnostics</h2>
        <p className="sub">Live checks of the core platform services.</p>
        <table>
          <thead><tr><th>Check</th><th>Status</th><th>Detail</th></tr></thead>
          <tbody>
            {checks.map((c) => (
              <tr key={c.label}><td><strong>{c.label}</strong></td>
                <td>{c.ok ? <span className="badge active">OK</span> : <span className="badge suspended">Attention</span>}</td>
                <td className="muted">{c.detail}</td></tr>
            ))}
          </tbody>
        </table>
        {health.data?.time && <p className="mono muted" style={{ marginTop: 10 }}>Last checked: {new Date(health.data.time).toLocaleString()}</p>}
      </div>
      <div className="panel">
        <h2>Troubleshooting guide</h2>
        <p className="sub">Common issues and how to resolve them before contacting support.</p>
        {guide.map((g) => (
          <details key={g.t} style={{ borderTop: "1px solid var(--line)", padding: "12px 0" }}>
            <summary style={{ cursor: "pointer", fontWeight: 650 }}>{g.t}</summary>
            <p className="muted" style={{ marginTop: 8, lineHeight: 1.6 }}>{g.s}</p>
          </details>
        ))}
      </div>
    </>
  );
}

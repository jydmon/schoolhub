"use client";

import { useEffect, useState, useCallback } from "react";

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

export default function AdminPortal() {
  const [tab, setTab] = useState<string>("tenants");
  return (
    <>
      <SeedRow />
      <div className="tabs" style={{ flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? "active" : ""} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
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
    </>
  );
}

/* ============================ TENANTS ============================ */
type School = { id: string; name: string; slug: string; status: string; group?: { name: string } | null; subscription?: { status: string; plan: { name: string; key: string } } | null; _count: { memberships: number; students: number; campuses: number } };
type Group = { id: string; name: string; _count: { schools: number } };

function Tenants() {
  const [schools, setSchools] = useState<School[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [form, setForm] = useState({ schoolName: "", slug: "", adminName: "", adminEmail: "", adminPassword: "", planKey: "trial", groupId: "" });
  const load = useCallback(async () => {
    const [s, g] = await Promise.all([fetch("/api/schools").then((r) => r.json()), fetch("/api/groups").then((r) => r.json())]);
    setSchools(s.schools ?? []); setGroups(g.groups ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function onboard(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/schools", { ...form, groupId: form.groupId || null }); setMsg({ k: "ok", t: `Created "${form.schoolName}" and its administrator.` }); setForm({ schoolName: "", slug: "", adminName: "", adminEmail: "", adminPassword: "", planKey: "trial", groupId: "" }); load(); }
    catch (e: any) { setMsg({ k: "err", t: e.message || "Failed to onboard school" }); }
  }
  async function setStatus(id: string, status: string) { await send(`/api/schools/${id}`, { status }, "PATCH"); load(); }
  const active = schools.filter((s) => s.status === "active").length;
  const suspended = schools.filter((s) => s.status === "suspended").length;
  const students = schools.reduce((n, s) => n + (s._count?.students ?? 0), 0);
  return (
    <>
      <div className="stat-grid" style={{ marginBottom: 20 }}>
        <div className="stat"><div className="n">{schools.length}</div><div className="l">Tenants</div></div>
        <div className="stat"><div className="n">{active}</div><div className="l">Active</div></div>
        <div className="stat"><div className="n">{suspended}</div><div className="l">Suspended</div></div>
        <div className="stat"><div className="n">{students}</div><div className="l">Students</div></div>
      </div>
      <div className="panel">
        <h2>Schools</h2>
        <p className="sub">Every school is an isolated tenant. Suspend to block all access instantly.</p>
        <table>
          <thead><tr><th>School</th><th>Trust</th><th>Plan</th><th>Users</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id}>
                <td><strong>{s.name}</strong><div className="mono muted">/{s.slug}</div></td>
                <td>{s.group?.name ?? <span className="muted">—</span>}</td>
                <td>{s.subscription?.plan?.name ?? <span className="muted">—</span>}</td>
                <td>{s._count?.memberships ?? 0}</td>
                <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                <td className="right">{s.status === "suspended" ? <button className="secondary small" onClick={() => setStatus(s.id, "active")}>Reactivate</button> : <button className="danger small" onClick={() => setStatus(s.id, "suspended")}>Suspend</button>}</td>
              </tr>
            ))}
            {schools.length === 0 && <Empty cols={6} text="No tenants yet — onboard one below." />}
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
            <div><label>Plan</label><select value={form.planKey} onChange={(e) => setForm({ ...form, planKey: e.target.value })}>{["trial", "basic", "standard", "premium"].map((p) => <option key={p} value={p}>{p}</option>)}</select></div>
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
  const staff: any[] = data?.staff ?? [];
  const roleList: any[] = roles.data?.roles ?? [];
  async function add(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/platform/staff", { ...f, roleKey: f.roleKey || roleList[0]?.key }); setMsg({ k: "ok", t: "Staff member saved." }); setF({ userId: "", email: "", name: "", roleKey: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  async function status(id: string, s: string) { try { await send(`/api/platform/staff/${id}`, { status: s }, "PATCH"); reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  return (
    <>
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
function Templates() {
  const { data, err, reload } = useJson<any>("/api/platform/templates");
  const [f, setF] = useState({ kind: "email_campaign", name: "", category: "", subject: "", body: "", sharedWithTenants: true });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [view, setView] = useState<any | null>(null);
  const templates: any[] = data?.templates ?? [];
  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/platform/templates", f); setMsg({ k: "ok", t: "Template created." }); setF({ ...f, name: "", subject: "", body: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <>
      {view && <DocModal title={view.name} meta={`${view.kind}${view.subject ? " · " + view.subject : ""}`} onClose={() => setView(null)}>{view.body || "(no content)"}</DocModal>}
      <div className="panel">
        <h2>Platform template library</h2>
        <p className="sub">Reusable email / message templates. Mark as shared to make them available to every tenant admin. Click View to read the full template.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table><thead><tr><th>Name</th><th>Kind</th><th>Category</th><th>Shared</th><th className="right"></th></tr></thead>
          <tbody>{templates.map((t: any) => <tr key={t.id}><td><strong>{t.name}</strong></td><td className="muted">{t.kind}</td><td className="muted">{t.category || "—"}</td><td>{t.sharedWithTenants ? <span className="badge active">shared</span> : <span className="muted">private</span>}</td><td className="right"><button className="secondary small" onClick={() => setView(t)}>View</button></td></tr>)}{templates.length === 0 && <Empty cols={5} text="No templates yet — use “Load default content”." />}</tbody>
        </table>
      </div>
      <div className="panel">
        <h2>New template</h2>
        <Notice msg={msg} />
        <form onSubmit={create}>
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
          <button type="submit" style={{ marginTop: 12 }}>Create template</button>
        </form>
      </div>
    </>
  );
}

/* ============================ POLICIES ============================ */
function Policies() {
  const { data, err, reload } = useJson<any>("/api/platform/policies");
  const [f, setF] = useState({ title: "", category: "data_protection", audience: "all", version: "", summary: "", body: "", fileUrl: "", requireAck: false, published: true });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [view, setView] = useState<any | null>(null);
  const policies: any[] = data?.policies ?? [];
  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const body: any = { ...f }; if (!body.fileUrl) delete body.fileUrl;
    try { await send("/api/platform/policies", body); setMsg({ k: "ok", t: "Policy published." }); setF({ ...f, title: "", version: "", summary: "", body: "", fileUrl: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <>
      {view && <DocModal title={view.title} meta={`${view.category || "general"} · ${view.audience || "all"} · v${view.version || "1.0"}`} onClose={() => setView(null)}>
        {view.summary ? <p style={{ fontWeight: 600 }}>{view.summary}</p> : null}
        {view.body || (view.fileUrl ? "" : "(no content)")}
        {view.fileUrl ? <p style={{ marginTop: 12 }}><a href={view.fileUrl} target="_blank" rel="noreferrer">Open attached document</a></p> : null}
      </DocModal>}
      <div className="panel">
        <h2>Platform policies</h2>
        <p className="sub">Data-protection, safeguarding and general policies pushed to all tenants. Click View to read the full policy.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table><thead><tr><th>Title</th><th>Category</th><th>Audience</th><th>Version</th><th>Status</th><th className="right"></th></tr></thead>
          <tbody>{policies.map((p: any) => <tr key={p.id}><td><strong>{p.title}</strong></td><td className="muted">{p.category || "—"}</td><td className="muted">{p.audience || "all"}</td><td className="muted">{p.version || "—"}</td><td>{p.published ? <span className="badge published">published</span> : <span className="badge draft">draft</span>}</td><td className="right"><button className="secondary small" onClick={() => setView(p)}>View</button></td></tr>)}{policies.length === 0 && <Empty cols={6} text="No policies yet — use “Load default content”." />}</tbody>
        </table>
      </div>
      <div className="panel">
        <h2>New policy</h2>
        <Notice msg={msg} />
        <form onSubmit={create}>
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
          <label className="consent" style={{ display: "block", marginTop: 8 }}><input type="checkbox" checked={f.requireAck} onChange={(e) => setF({ ...f, requireAck: e.target.checked })} /> Require acknowledgement</label>
          <button type="submit" style={{ marginTop: 12 }}>Publish policy</button>
        </form>
      </div>
    </>
  );
}

/* ============================ CRM ============================ */
const AUDIENCE_KEYS = ["subscriber", "parent", "driver", "tenant_admin", "teacher", "transport_manager", "lead"];
function Crm() {
  const contacts = useJson<any>("/api/crm/contacts");
  const campaigns = useJson<any>("/api/crm/campaigns");
  const [c, setC] = useState({ email: "", name: "", audience: "subscriber" });
  const [camp, setCamp] = useState({ name: "", subject: "", body: "" });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const list: any[] = contacts.data?.contacts ?? [];
  const counts: any = contacts.data?.counts ?? {};
  const campList: any[] = campaigns.data?.campaigns ?? [];
  async function addContact(e: React.FormEvent) { e.preventDefault(); setMsg(null); try { await send("/api/crm/contacts", { ...c, consent: true }); setMsg({ k: "ok", t: "Contact saved." }); setC({ email: "", name: "", audience: "subscriber" }); contacts.reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function sync() { setMsg(null); try { const r = await send("/api/crm/audiences", { roles: ["Parent", "Teacher", "Driver"] }); setMsg({ k: "ok", t: `Synced ${r.synced ?? 0} contacts.` }); contacts.reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  async function createCampaign(e: React.FormEvent) { e.preventDefault(); setMsg(null); try { await send("/api/crm/campaigns", camp); setMsg({ k: "ok", t: "Campaign created." }); setCamp({ name: "", subject: "", body: "" }); campaigns.reload(); } catch (e: any) { setMsg({ k: "err", t: e.message }); } }
  return (
    <>
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
        <table><thead><tr><th>Name</th><th>Subject</th><th>Status</th><th>Created</th></tr></thead>
          <tbody>{campList.map((k: any) => <tr key={k.id}><td><strong>{k.name}</strong></td><td className="muted">{k.subject}</td><td>{k.status ? <span className="badge role">{k.status}</span> : "—"}</td><td className="mono muted">{dt(k.createdAt)}</td></tr>)}{campList.length === 0 && <Empty cols={4} text="No campaigns yet." />}</tbody>
        </table>
        <form onSubmit={createCampaign} style={{ marginTop: 12 }}>
          <div className="row">
            <div><label>Campaign name</label><input value={camp.name} onChange={(e) => setCamp({ ...camp, name: e.target.value })} required /></div>
            <div><label>Subject</label><input value={camp.subject} onChange={(e) => setCamp({ ...camp, subject: e.target.value })} required /></div>
          </div>
          <label>Body</label>
          <textarea rows={3} value={camp.body} onChange={(e) => setCamp({ ...camp, body: e.target.value })} />
          <button type="submit" style={{ marginTop: 8 }}>Create campaign</button>
        </form>
      </div>
    </>
  );
}

/* ============================ HELP VIDEOS (CMS) ============================ */
function Videos() {
  const { data, err, reload } = useJson<any>("/api/cms/videos?admin=1");
  const [f, setF] = useState({ title: "", url: "", category: "getting_started", audience: "all", description: "", published: true });
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const videos: any[] = data?.videos ?? [];
  async function create(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    try { await send("/api/cms/videos", f); setMsg({ k: "ok", t: "Video added." }); setF({ ...f, title: "", url: "", description: "" }); reload(); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
  }
  return (
    <>
      <div className="panel">
        <h2>Help Centre videos</h2>
        <p className="sub">How-to videos shown across the platform Help Centre.</p>
        {err && <Notice msg={{ k: "err", t: err }} />}
        <table><thead><tr><th>Title</th><th>Category</th><th>Audience</th><th>Status</th></tr></thead>
          <tbody>{videos.map((v: any) => <tr key={v.id}><td><strong>{v.title}</strong></td><td className="muted">{v.category || "—"}</td><td className="muted">{v.audience || "all"}</td><td>{v.published ? <span className="badge active">published</span> : <span className="muted">draft</span>}</td></tr>)}{videos.length === 0 && <Empty cols={4} text="No videos yet." />}</tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Add a video</h2>
        <Notice msg={msg} />
        <form onSubmit={create}>
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
          <button type="submit" style={{ marginTop: 12 }}>Add video</button>
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
  const [msg, setMsg] = useState<{ k: string; t: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setBusy(true); setMsg(null);
    try { const r = await send("/api/platform/seed-defaults", {}); setMsg({ k: "ok", t: `Starter content ready — ${r.policies} policies, ${r.videos} videos, ${r.templates} templates, ${r.plans} packages. Open the tabs to view.` }); }
    catch (e: any) { setMsg({ k: "err", t: e.message }); }
    finally { setBusy(false); }
  }
  return (
    <div className="panel" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
      <div><strong>Starter content</strong><div className="muted" style={{ fontSize: 13 }}>Load default packages, policies, help videos and templates. Safe to run anytime — existing items are kept.</div></div>
      <div style={{ textAlign: "right" }}>
        <button disabled={busy} onClick={load}>{busy ? "Loading…" : "Load default content"}</button>
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

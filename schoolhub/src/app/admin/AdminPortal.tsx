"use client";

import { useEffect, useState, useCallback } from "react";

type School = {
  id: string;
  name: string;
  slug: string;
  status: string;
  group?: { name: string } | null;
  subscription?: { status: string; plan: { name: string; key: string } } | null;
  _count: { memberships: number; students: number; campuses: number };
};
type Group = { id: string; name: string; _count: { schools: number } };
type Audit = {
  id: string;
  action: string;
  actorEmail: string | null;
  school?: { name: string } | null;
  createdAt: string;
  metadata: string;
};

const PLANS = ["trial", "basic", "standard", "premium"];

export default function AdminPortal() {
  const [tab, setTab] = useState<"tenants" | "groups" | "audit">("tenants");
  return (
    <>
      <div className="tabs">
        <button className={tab === "tenants" ? "active" : ""} onClick={() => setTab("tenants")}>
          Tenants
        </button>
        <button className={tab === "groups" ? "active" : ""} onClick={() => setTab("groups")}>
          Trusts &amp; Groups
        </button>
        <button className={tab === "audit" ? "active" : ""} onClick={() => setTab("audit")}>
          Audit trail
        </button>
      </div>
      {tab === "tenants" && <Tenants />}
      {tab === "groups" && <Groups />}
      {tab === "audit" && <AuditTab />}
    </>
  );
}

function Tenants() {
  const [schools, setSchools] = useState<School[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState({
    schoolName: "",
    slug: "",
    adminName: "",
    adminEmail: "",
    adminPassword: "",
    planKey: "trial",
    groupId: "",
  });

  const load = useCallback(async () => {
    const [s, g] = await Promise.all([
      fetch("/api/schools").then((r) => r.json()),
      fetch("/api/groups").then((r) => r.json()),
    ]);
    setSchools(s.schools ?? []);
    setGroups(g.groups ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function onboard(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/schools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, groupId: form.groupId || null }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setMsg({ kind: "err", text: data.error || "Failed to onboard school" });
      return;
    }
    setMsg({ kind: "ok", text: `Created "${form.schoolName}" and its administrator.` });
    setForm({ schoolName: "", slug: "", adminName: "", adminEmail: "", adminPassword: "", planKey: "trial", groupId: "" });
    load();
  }

  async function setStatus(id: string, status: string) {
    await fetch(`/api/schools/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  const active = schools.filter((s) => s.status === "active").length;
  const suspended = schools.filter((s) => s.status === "suspended").length;
  const students = schools.reduce((n, s) => n + s._count.students, 0);

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
          <thead>
            <tr><th>School</th><th>Trust</th><th>Plan</th><th>Users</th><th>Status</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {schools.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <div className="mono muted">/{s.slug}</div>
                </td>
                <td>{s.group?.name ?? <span className="muted">—</span>}</td>
                <td>{s.subscription?.plan.name ?? <span className="muted">—</span>}</td>
                <td>{s._count.memberships}</td>
                <td><span className={`badge ${s.status}`}>{s.status}</span></td>
                <td className="right">
                  {s.status === "suspended" ? (
                    <button className="secondary small" onClick={() => setStatus(s.id, "active")}>Reactivate</button>
                  ) : (
                    <button className="danger small" onClick={() => setStatus(s.id, "suspended")}>Suspend</button>
                  )}
                </td>
              </tr>
            ))}
            {schools.length === 0 && (
              <tr><td colSpan={6} className="muted">No tenants yet — onboard one below.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel">
        <h2>Onboard a school</h2>
        <p className="sub">Creates the tenant, its configuration, a subscription and the first School Administrator.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={onboard}>
          <div className="row">
            <div>
              <label>School name</label>
              <input value={form.schoolName} onChange={(e) => setForm({ ...form, schoolName: e.target.value, slug: form.slug || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") })} required />
            </div>
            <div>
              <label>Slug (subdomain)</label>
              <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
            </div>
          </div>
          <div className="row">
            <div>
              <label>Plan</label>
              <select value={form.planKey} onChange={(e) => setForm({ ...form, planKey: e.target.value })}>
                {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label>Trust / group (optional)</label>
              <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}>
                <option value="">— none —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div>
              <label>Administrator name</label>
              <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} required />
            </div>
            <div>
              <label>Administrator email</label>
              <input type="email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} required />
            </div>
          </div>
          <label>Administrator temporary password</label>
          <input type="text" value={form.adminPassword} onChange={(e) => setForm({ ...form, adminPassword: e.target.value })} minLength={8} required />
          <button type="submit" style={{ marginTop: 16 }}>Create tenant</button>
        </form>
      </div>
    </>
  );
}

function Groups() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState("");

  const load = useCallback(async () => {
    const g = await fetch("/api/groups").then((r) => r.json());
    setGroups(g.groups ?? []);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    setName("");
    load();
  }

  return (
    <div className="panel">
      <h2>Academy trusts &amp; school groups</h2>
      <p className="sub">Group multiple schools under a single overseeing organisation.</p>
      <table>
        <thead><tr><th>Name</th><th>Schools</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}><td>{g.name}</td><td>{g._count.schools}</td></tr>
          ))}
          {groups.length === 0 && <tr><td colSpan={2} className="muted">No groups yet.</td></tr>}
        </tbody>
      </table>
      <form onSubmit={create} style={{ marginTop: 16 }}>
        <div className="row">
          <div style={{ flex: 3 }}>
            <label>New trust / group name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="submit">Add</button>
          </div>
        </div>
      </form>
    </div>
  );
}

function AuditTab() {
  const [entries, setEntries] = useState<Audit[]>([]);
  useEffect(() => {
    fetch("/api/audit").then((r) => r.json()).then((d) => setEntries(d.entries ?? []));
  }, []);
  return (
    <div className="panel">
      <h2>Platform audit trail</h2>
      <p className="sub">The 300 most recent events across all tenants.</p>
      <table>
        <thead><tr><th>Time</th><th>Action</th><th>Actor</th><th>Tenant</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="mono muted">{new Date(e.createdAt).toLocaleString()}</td>
              <td><span className="badge role">{e.action}</span></td>
              <td>{e.actorEmail ?? <span className="muted">system</span>}</td>
              <td>{e.school?.name ?? <span className="muted">platform</span>}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={4} className="muted">No audit entries.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

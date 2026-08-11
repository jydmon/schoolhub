"use client";

import { useEffect, useState, useCallback } from "react";
import { StudentsTab, GuardiansTab, StaffTab, ImportTab } from "./PeopleTabs";
import IntegrationsTab from "./IntegrationsTab";
import IntegrationHubTab from "./IntegrationHubTab";
import CalendarTab from "./CalendarTab";
import KnowledgeTab from "./KnowledgeTab";
import AssistantTab from "./AssistantTab";
import TransportTab from "./TransportTab";
import TripsTab from "./TripsTab";
import BehaviourTab from "./BehaviourTab";
import CommsTab from "./CommsTab";
import ReportsTab from "./ReportsTab";
import OpsTab from "./OpsTab";

const ALL_MODULES = ["dashboard", "calendar", "transport", "trips", "comms", "ai"];
const ASSIGNABLE_ROLES = [
  "SchoolAdministrator",
  "SchoolLeader",
  "Teacher",
  "TransportManager",
  "Driver",
  "Parent",
  "SupportStaff",
];

type Props = {
  schoolId: string;
  roles: string[];
  initial: { school: any };
};

export default function SchoolPortal({ schoolId, roles, initial }: Props) {
  const canManage = roles.includes("SchoolAdministrator");
  type Tab = "ops" | "students" | "guardians" | "staff" | "calendar" | "transport" | "trips" | "behaviour" | "comms" | "reports" | "knowledge" | "assistant" | "import" | "integrations" | "hub" | "config" | "users" | "audit" | "security";
  const [tab, setTab] = useState<Tab>(canManage ? "ops" : "security");

  const manageTabs: [Tab, string][] = [
    ["ops", "Operations"],
    ["students", "Students"],
    ["guardians", "Guardians"],
    ["staff", "Staff"],
    ["calendar", "Calendar"],
    ["transport", "Transport"],
    ["trips", "Trips"],
    ["behaviour", "Behaviour"],
    ["comms", "Comms"],
    ["reports", "Reports"],
    ["knowledge", "Knowledge"],
    ["assistant", "Assistant"],
    ["import", "Import"],
    ["integrations", "Integrations"],
    ["hub", "Integration Hub"],
    ["config", "Configuration"],
    ["users", "Users & roles"],
    ["audit", "Audit"],
  ];

  return (
    <>
      <div className="tabs">
        {canManage && manageTabs.map(([t, label]) => (
          <button key={t} className={tab === t ? "active" : ""} onClick={() => setTab(t)}>{label}</button>
        ))}
        <button className={tab === "security" ? "active" : ""} onClick={() => setTab("security")}>My security</button>
      </div>
      {tab === "ops" && canManage && <OpsTab schoolId={schoolId} />}
      {tab === "students" && canManage && <StudentsTab schoolId={schoolId} />}
      {tab === "guardians" && canManage && <GuardiansTab schoolId={schoolId} />}
      {tab === "staff" && canManage && <StaffTab schoolId={schoolId} />}
      {tab === "calendar" && canManage && <CalendarTab schoolId={schoolId} />}
      {tab === "transport" && canManage && <TransportTab schoolId={schoolId} />}
      {tab === "trips" && canManage && <TripsTab schoolId={schoolId} />}
      {tab === "behaviour" && canManage && <BehaviourTab schoolId={schoolId} />}
      {tab === "comms" && canManage && <CommsTab schoolId={schoolId} />}
      {tab === "reports" && canManage && <ReportsTab schoolId={schoolId} />}
      {tab === "knowledge" && canManage && <KnowledgeTab schoolId={schoolId} />}
      {tab === "assistant" && canManage && <AssistantTab schoolId={schoolId} />}
      {tab === "import" && canManage && <ImportTab schoolId={schoolId} />}
      {tab === "integrations" && canManage && <IntegrationsTab schoolId={schoolId} />}
      {tab === "hub" && canManage && <IntegrationHubTab schoolId={schoolId} />}
      {tab === "config" && canManage && <ConfigTab schoolId={schoolId} initial={initial.school} />}
      {tab === "users" && canManage && <UsersTab schoolId={schoolId} />}
      {tab === "audit" && canManage && <AuditTab schoolId={schoolId} />}
      {tab === "security" && <SecurityTab />}
    </>
  );
}

function ConfigTab({ schoolId, initial }: { schoolId: string; initial: any }) {
  const cfg = initial.config ?? {};
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState({
    name: initial.name ?? "",
    colorPrimary: initial.colorPrimary ?? "#2563eb",
    colorAccent: initial.colorAccent ?? "#0ea5e9",
    addressLine1: initial.addressLine1 ?? "",
    city: initial.city ?? "",
    postcode: initial.postcode ?? "",
    contactName: initial.contactName ?? "",
    contactEmail: initial.contactEmail ?? "",
    contactPhone: initial.contactPhone ?? "",
    timezone: cfg.timezone ?? "Europe/London",
    academicYear: cfg.academicYear ?? "",
    dataRetentionDays: cfg.dataRetentionDays ?? 365,
  });
  const [modules, setModules] = useState<string[]>(
    (cfg.enabledModules ?? "").split(",").filter(Boolean)
  );

  function toggle(m: string) {
    setModules((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/config`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        dataRetentionDays: Number(form.dataRetentionDays),
        enabledModules: modules,
      }),
    });
    const data = await res.json();
    setMsg(res.ok && !data.error
      ? { kind: "ok", text: "Configuration saved." }
      : { kind: "err", text: data.error || "Save failed" });
  }

  return (
    <div className="panel">
      <h2>School configuration</h2>
      <p className="sub">Branding, contact details, academic settings and enabled modules.</p>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
      <form onSubmit={save}>
        <label>School name</label>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div className="row">
          <div>
            <label>Primary colour</label>
            <input type="color" value={form.colorPrimary} onChange={(e) => setForm({ ...form, colorPrimary: e.target.value })} />
          </div>
          <div>
            <label>Accent colour</label>
            <input type="color" value={form.colorAccent} onChange={(e) => setForm({ ...form, colorAccent: e.target.value })} />
          </div>
        </div>
        <div className="row">
          <div><label>Address</label><input value={form.addressLine1} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} /></div>
          <div><label>City</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} /></div>
          <div><label>Postcode</label><input value={form.postcode} onChange={(e) => setForm({ ...form, postcode: e.target.value })} /></div>
        </div>
        <div className="row">
          <div><label>Contact name</label><input value={form.contactName} onChange={(e) => setForm({ ...form, contactName: e.target.value })} /></div>
          <div><label>Contact email</label><input value={form.contactEmail} onChange={(e) => setForm({ ...form, contactEmail: e.target.value })} /></div>
          <div><label>Contact phone</label><input value={form.contactPhone} onChange={(e) => setForm({ ...form, contactPhone: e.target.value })} /></div>
        </div>
        <div className="row">
          <div><label>Time zone</label><input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} /></div>
          <div><label>Academic year</label><input placeholder="2025/2026" value={form.academicYear} onChange={(e) => setForm({ ...form, academicYear: e.target.value })} /></div>
          <div><label>Data retention (days)</label><input type="number" value={form.dataRetentionDays} onChange={(e) => setForm({ ...form, dataRetentionDays: e.target.value as any })} /></div>
        </div>
        <label>Enabled modules</label>
        <div className="chips">
          {ALL_MODULES.map((m) => (
            <label key={m} className="chip" style={{ margin: 0 }}>
              <input type="checkbox" style={{ width: "auto" }} checked={modules.includes(m)} onChange={() => toggle(m)} />
              {m}
            </label>
          ))}
        </div>
        <button type="submit" style={{ marginTop: 18 }}>Save configuration</button>
      </form>
    </div>
  );
}

function UsersTab({ schoolId }: { schoolId: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", role: "Teacher", password: "" });

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/users`).then((r) => r.json());
    setUsers(d.users ?? []);
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, password: form.password || undefined }),
    });
    const data = await res.json();
    if (!res.ok || data.error) {
      setMsg({ kind: "err", text: data.error || "Failed to add user" });
      return;
    }
    setMsg({ kind: "ok", text: form.password ? "User created." : "User invited (verification link sent)." });
    setForm({ fullName: "", email: "", role: "Teacher", password: "" });
    load();
  }

  return (
    <>
      <div className="panel">
        <h2>Users &amp; roles</h2>
        <p className="sub">People with access to this school. Roles determine what they can see and do.</p>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>MFA</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.membershipId}>
                <td>{u.user.fullName}</td>
                <td className="mono">{u.user.email}</td>
                <td><span className="badge role">{u.roleLabel}</span></td>
                <td>{u.user.status}</td>
                <td>{u.user.mfaEnabled ? "✓" : "—"}</td>
              </tr>
            ))}
            {users.length === 0 && <tr><td colSpan={5} className="muted">No users yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Add a user</h2>
        <p className="sub">Leave the password blank to send an email invite instead.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={add}>
          <div className="row">
            <div><label>Full name</label><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
            <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
          </div>
          <div className="row">
            <div>
              <label>Role</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div><label>Temporary password (optional)</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
          </div>
          <button type="submit" style={{ marginTop: 16 }}>Add user</button>
        </form>
      </div>
    </>
  );
}

function AuditTab({ schoolId }: { schoolId: string }) {
  const [entries, setEntries] = useState<any[]>([]);
  useEffect(() => {
    fetch(`/api/schools/${schoolId}/audit`).then((r) => r.json()).then((d) => setEntries(d.entries ?? []));
  }, [schoolId]);
  return (
    <div className="panel">
      <h2>Audit trail</h2>
      <p className="sub">Recent activity within this school.</p>
      <table>
        <thead><tr><th>Time</th><th>Action</th><th>Actor</th></tr></thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id}>
              <td className="mono muted">{new Date(e.createdAt).toLocaleString()}</td>
              <td><span className="badge role">{e.action}</span></td>
              <td>{e.actorEmail ?? "system"}</td>
            </tr>
          ))}
          {entries.length === 0 && <tr><td colSpan={3} className="muted">No entries.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function SecurityTab() {
  const [me, setMe] = useState<any>(null);
  const [setup, setSetup] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);

  const load = useCallback(async () => {
    const d = await fetch("/api/auth/me").then((r) => r.json());
    setMe(d);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function begin() {
    const d = await fetch("/api/auth/mfa", { method: "POST" }).then((r) => r.json());
    setSetup(d);
    setMsg(null);
  }
  async function enable(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/auth/mfa", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: code }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Invalid code" }); return; }
    setMsg({ kind: "ok", text: "MFA enabled." });
    setSetup(null); setCode(""); load();
  }
  async function disable() {
    await fetch("/api/auth/mfa", { method: "DELETE" });
    setMsg({ kind: "ok", text: "MFA disabled." });
    load();
  }
  async function verifyEmail() {
    await fetch("/api/auth/verify-email");
    setMsg({ kind: "info", text: "Verification email sent (check the server console in dev)." });
  }

  return (
    <div className="panel">
      <h2>My security</h2>
      <p className="sub">Multi-factor authentication and email verification for your own account.</p>
      {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}

      <div className="flex-between" style={{ borderBottom: "1px solid var(--line)", paddingBottom: 14, marginBottom: 14 }}>
        <div>
          <strong>Email verification</strong>
          <div className="muted">{me?.email} · {me ? "loaded" : "…"}</div>
        </div>
        <button className="secondary" onClick={verifyEmail}>Send verification email</button>
      </div>

      <div>
        <strong>Multi-factor authentication (TOTP)</strong>
        {me?.isPlatformAdmin && (
          <div className="notice info" style={{ marginTop: 8 }}>Privileged accounts should keep MFA enabled.</div>
        )}
        {!setup && (
          <div style={{ marginTop: 10 }}>
            <button onClick={begin}>Set up authenticator app</button>{" "}
            <button className="danger secondary" onClick={disable}>Disable MFA</button>
          </div>
        )}
        {setup && (
          <form onSubmit={enable} style={{ marginTop: 10 }}>
            <p className="muted" style={{ fontSize: 13 }}>
              Add this secret to your authenticator app, then enter the 6-digit code to confirm.
            </p>
            <div className="chip mono" style={{ display: "inline-flex" }}>{setup.secret}</div>
            <div className="mono muted" style={{ fontSize: 11, marginTop: 6, wordBreak: "break-all" }}>{setup.otpauthUrl}</div>
            <label>Authenticator code</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6-digit code" />
            <button type="submit" style={{ marginTop: 12 }}>Confirm &amp; enable</button>
          </form>
        )}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", marginTop: 14, paddingTop: 14 }}>
        <strong>Sessions &amp; devices</strong>
        <p className="muted" style={{ fontSize: 13, margin: "4px 0 8px" }}>Sign out of all other devices (invalidates every existing session).</p>
        <button className="secondary" onClick={async () => { await fetch("/api/auth/sessions", { method: "POST" }); setMsg({ kind: "ok", text: "Signed out of all other sessions." }); }}>Sign out everywhere</button>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useCallback } from "react";
import AccountProfile from "@/components/AccountProfile";
import HelpSupport from "@/components/HelpSupport";
import Messaging from "@/components/Messaging";
import { useSort, SortTh } from "./EntityKit";
import { StudentsTab, GuardiansTab, StaffTab, ImportTab } from "./PeopleTabs";
import GuardianRelationshipsTab from "./GuardianRelationshipsTab";
import IntegrationsTab from "./IntegrationsTab";
import IntegrationHubTab from "./IntegrationHubTab";
import CalendarTab from "./CalendarTab";
import TimetableTab from "./TimetableTab";
import KnowledgeTab from "./KnowledgeTab";
import AssistantTab from "./AssistantTab";
import TransportTab from "./TransportTab";
import TripsTab from "./TripsTab";
import BehaviourTab from "./BehaviourTab";
import CommsTab from "./CommsTab";
import MealsTab from "./MealsTab";
import ClubsTab from "./ClubsTab";
import AccessManagementTab from "./AccessManagementTab";
import AttendanceTab from "./AttendanceTab";
import NotificationsTab from "./NotificationsTab";
import HistoryTab from "./HistoryTab";
import ReportsTab from "./ReportsTab";
import AdminReportsTab from "./AdminReportsTab";
import OpsTab from "./OpsTab";
import AppShell, { NavGroup } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";

const SCHOOL_NAV: NavGroup[] = [
  { label: "Overview", items: [{ key: "ops", label: "Operations", icon: "📊" }] },
  { label: "People", items: [
    { key: "students", label: "Students", icon: "🎓" },
    { key: "guardians", label: "Guardians", icon: "👪" },
    { key: "relationships", label: "Guardian access", icon: "🛡️" },
    { key: "staff", label: "Staff", icon: "🧑‍🏫" },
    { key: "users", label: "Users & roles", icon: "🔑" },
  ] },
  { label: "Learning & care", items: [
    { key: "calendar", label: "Calendar", icon: "📅" },
    { key: "timetable", label: "Timetable", icon: "🗓️" },
    { key: "attendance", label: "Attendance", icon: "✅" },
    { key: "behaviour", label: "Behaviour", icon: "⭐" },
    { key: "reports", label: "Pupils reports", icon: "📄" },
    { key: "knowledge", label: "Knowledge", icon: "📚" },
    { key: "meals", label: "Meals & menus", icon: "🍽️" },
    { key: "clubs", label: "Clubs & activities", icon: "⚽" },
  ] },
  { label: "Transport", items: [
    { key: "transport", label: "Transport", icon: "🚌" },
    { key: "trips", label: "Trips", icon: "🧳" },
  ] },
  { label: "Communication", items: [
    { key: "comms", label: "Comms", icon: "✉️" },
    { key: "dm", label: "Messages", icon: "💬" },
    { key: "assistant", label: "Ask AI Assistant", icon: "🤖" },
  ] },
  { label: "Data & integrations", items: [
    { key: "import", label: "Manual import", icon: "📥" },
    { key: "integrations", label: "Integrations", icon: "🔌" },
    { key: "hub", label: "Integration Hub", icon: "🧩" },
  ] },
  { label: "Settings", items: [
    { key: "config", label: "School configuration", icon: "⚙️" },
    { key: "access", label: "Access management", icon: "🧩" },
    { key: "insights", label: "Reports & search", icon: "📈" },
    { key: "audit", label: "History", icon: "🗂️" },
    { key: "notifications", label: "Notifications", icon: "🔔" },
    { key: "profile", label: "My profile", icon: "🙂" },
    { key: "security", label: "My security", icon: "🔐" },
    { key: "help", label: "Help & support", icon: "🆘" },
  ] },
];
const SCHOOL_TITLES: Record<string, string> = {
  ops: "Operations", students: "Students", guardians: "Guardians", staff: "Staff", users: "Users & roles",
  calendar: "Calendar", timetable: "Timetable", attendance: "Attendance", behaviour: "Behaviour", reports: "Pupils reports", knowledge: "Knowledge", meals: "Meals & menus", clubs: "Clubs & activities",
  transport: "Transport", trips: "Trips", comms: "Comms", assistant: "Ask AI Assistant",
  import: "Manual import", integrations: "Integrations", hub: "Integration Hub",
  config: "School configuration", access: "Access management", insights: "Reports & search", audit: "History", notifications: "Notifications", profile: "My profile", security: "My security",
};

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
  email?: string;
  schoolCount?: number;
};

export default function SchoolPortal({ schoolId, roles, initial, email = "", schoolCount = 1 }: Props) {
  const canManage = roles.includes("SchoolAdministrator");
  const [focusStudentId, setFocusStudentId] = useState<string | null>(null);
  // Remember this as the user's current school so future logins land here.
  useEffect(() => { try { document.cookie = `siplat_last_school=${schoolId}; path=/; max-age=${60 * 60 * 24 * 180}; SameSite=Lax`; } catch { /* ignore */ } }, [schoolId]);
  type Tab = "ops" | "students" | "guardians" | "staff" | "calendar" | "timetable" | "attendance" | "transport" | "trips" | "behaviour" | "comms" | "reports" | "knowledge" | "meals" | "clubs" | "assistant" | "import" | "integrations" | "hub" | "config" | "access" | "users" | "audit" | "notifications" | "profile" | "security" | "insights" | "help" | "dm";
  const [tab, setTab] = useState<Tab>(canManage ? "ops" : "security");

  const manageTabs: [Tab, string][] = [
    ["ops", "Operations"],
    ["students", "Students"],
    ["guardians", "Guardians"],
    ["staff", "Staff"],
    ["calendar", "Calendar"],
    ["timetable", "Timetable"],
    ["attendance", "Attendance"],
    ["transport", "Transport"],
    ["trips", "Trips"],
    ["behaviour", "Behaviour"],
    ["comms", "Comms"],
    ["reports", "Pupils reports"],
    ["knowledge", "Knowledge"],
    ["meals", "Meals & menus"],
    ["clubs", "Clubs & activities"],
    ["assistant", "Ask AI Assistant"],
    ["import", "Import"],
    ["integrations", "Integrations"],
    ["hub", "Integration Hub"],
    ["config", "Configuration"],
    ["access", "Access management"],
    ["users", "Users & roles"],
    ["insights", "Reports & search"],
    ["audit", "History"],
    ["notifications", "Notifications"],
    ["profile", "My profile"],
    ["help", "Help & support"],
    ["dm", "Messages"],
  ];

  const nav: NavGroup[] = canManage ? SCHOOL_NAV : [{ label: "Account", items: [{ key: "notifications", label: "Notifications", icon: "🔔" }, { key: "profile", label: "My profile", icon: "🙂" }, { key: "security", label: "My security", icon: "🔐" }, { key: "help", label: "Help & support", icon: "🆘" }] }];
  return (
    <AppShell brandSub={initial.school?.name || "School"} nav={nav} active={tab}
      onNavigate={(k) => setTab(k as Tab)} title={SCHOOL_TITLES[tab] || (initial.school?.name || "School")}
      email={email} role={canManage ? "School Administrator" : "Member"}>
      {schoolCount > 1 && <div style={{ marginBottom: 10 }}><a className="linklike" href="/school?choose=1" style={{ fontSize: 13 }}>← Switch school</a></div>}
      {tab === "ops" && canManage && <OpsTab schoolId={schoolId} subscription={initial.school?.subscription} />}
      {tab === "students" && canManage && <StudentsTab schoolId={schoolId} focusId={focusStudentId} onFocusHandled={() => setFocusStudentId(null)} />}
      {tab === "guardians" && canManage && <GuardiansTab schoolId={schoolId} />}
      {tab === "relationships" && canManage && <GuardianRelationshipsTab schoolId={schoolId} />}
      {tab === "staff" && canManage && <StaffTab schoolId={schoolId} />}
      {tab === "calendar" && canManage && <CalendarTab schoolId={schoolId} onOpenStudent={(id) => { setFocusStudentId(id); setTab("students"); }} />}
      {tab === "timetable" && canManage && <TimetableTab schoolId={schoolId} />}
      {tab === "attendance" && canManage && <AttendanceTab schoolId={schoolId} />}
      {tab === "transport" && canManage && <TransportTab schoolId={schoolId} />}
      {tab === "trips" && canManage && <TripsTab schoolId={schoolId} />}
      {tab === "behaviour" && canManage && <BehaviourTab schoolId={schoolId} />}
      {tab === "comms" && canManage && <CommsTab schoolId={schoolId} />}
      {tab === "reports" && canManage && <ReportsTab schoolId={schoolId} />}
      {tab === "knowledge" && canManage && <KnowledgeTab schoolId={schoolId} />}
      {tab === "meals" && canManage && <MealsTab schoolId={schoolId} />}
      {tab === "clubs" && canManage && <ClubsTab schoolId={schoolId} />}
      {tab === "assistant" && canManage && <AssistantTab schoolId={schoolId} />}
      {tab === "import" && canManage && <ImportTab schoolId={schoolId} />}
      {tab === "integrations" && canManage && <IntegrationsTab schoolId={schoolId} />}
      {tab === "hub" && canManage && <IntegrationHubTab schoolId={schoolId} />}
      {tab === "config" && canManage && <ConfigTab schoolId={schoolId} initial={initial.school} />}
      {tab === "access" && canManage && <AccessManagementTab schoolId={schoolId} />}
      {tab === "users" && canManage && <UsersTab schoolId={schoolId} />}
      {tab === "insights" && canManage && <AdminReportsTab schoolId={schoolId} onNavigate={(t) => setTab(t as Tab)} />}
      {tab === "audit" && canManage && <HistoryTab schoolId={schoolId} />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "profile" && <AccountProfile />}
      {tab === "security" && <SecurityTab />}
      {tab === "help" && <HelpSupport />}
      {tab === "dm" && canManage && <Messaging />}
    </AppShell>
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
    headTeacher: initial.headTeacher ?? "",
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
          <div><label>Head teacher / principal</label><input value={form.headTeacher} onChange={(e) => setForm({ ...form, headTeacher: e.target.value })} /></div>
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

const ROLE_LABEL_MAP: Record<string, string> = {
  SchoolAdministrator: "School Administrator", SchoolLeader: "School Leader", Teacher: "Teacher",
  TransportManager: "Transport Manager", Driver: "Driver", Parent: "Parent / Guardian", SupportStaff: "Support Staff",
};
function UsersTab({ schoolId }: { schoolId: string }) {
  const [users, setUsers] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const [form, setForm] = useState({ fullName: "", email: "", role: "Teacher", password: "" });
  const [showAdd, setShowAdd] = useState(false);
  const [q, setQ] = useState("");
  const [fRole, setFRole] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [confirm, setConfirm] = useState<null | { title: string; message: string; label: string; danger?: boolean; run: () => void }>(null);
  const sort = useSort("name");

  const load = useCallback(async () => {
    const d = await fetch(`/api/schools/${schoolId}/users`).then((r) => r.json());
    setUsers(d.users ?? []); setSel({});
  }, [schoolId]);
  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    const s = q.trim().toLowerCase();
    if (s && ![u.user.fullName, u.user.email, u.roleLabel, u.user.status].some((f) => String(f ?? "").toLowerCase().includes(s))) return false;
    if (fRole && u.role !== fRole) return false;
    if (fStatus && u.user.status !== fStatus) return false;
    return true;
  });
  const rows = sort.sort(filtered, (u, k) => k === "name" ? u.user.fullName : k === "email" ? u.user.email : k === "role" ? u.roleLabel : k === "status" ? u.user.status : k === "mfa" ? (u.user.mfaEnabled ? 1 : 0) : "");
  const statuses = Array.from(new Set(users.map((u) => u.user.status).filter(Boolean)));
  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const selRows = users.filter((u) => sel[u.membershipId]);
  const allOn = rows.length > 0 && rows.every((u) => sel[u.membershipId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, password: form.password || undefined }),
    });
    const data = await res.json();
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Failed to add user" }); return; }
    setMsg({ kind: "ok", text: form.password ? "User created." : "User invited (verification link sent)." });
    setForm({ fullName: "", email: "", role: "Teacher", password: "" });
    setShowAdd(false);
    load();
  }
  async function act(userId: string, action: string): Promise<boolean> {
    const res = await fetch(`/api/schools/${schoolId}/users/${userId}/action`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Action failed" }); return false; }
    if (action === "reset_password") setMsg({ kind: "ok", text: "Password reset link generated (emailed in production)." });
    return true;
  }
  async function runAction(userId: string, action: string, okText: string) {
    setOpenMenu(null); setMsg(null);
    if (await act(userId, action)) { if (action !== "reset_password") setMsg({ kind: "ok", text: okText }); load(); }
  }
  async function bulk(action: string, okText: string) {
    setMsg(null);
    let n = 0;
    for (const u of selRows) { if (await act(u.user.id, action)) n++; }
    setSel({}); load();
    setMsg({ kind: "ok", text: `${okText} — ${n} user${n === 1 ? "" : "s"}.` });
  }
  async function changeRole(membershipId: string, role: string) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/memberships/${membershipId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Could not change role" }); return; }
    setEditing(null); setMsg({ kind: "ok", text: data.mergedDuplicate ? "Role updated (removed a duplicate role the user already held)." : "Role updated." }); load();
  }
  async function removeRole(membershipId: string) {
    setMsg(null);
    const res = await fetch(`/api/schools/${schoolId}/memberships/${membershipId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) { setMsg({ kind: "err", text: data.error || "Could not remove role" }); return; }
    setMsg({ kind: "ok", text: "Role removed." }); load();
  }
  function askRemoveRole(u: any) {
    setOpenMenu(null);
    setConfirm({ title: `Remove the ${u.roleLabel} role from ${u.user.fullName}?`, message: "This removes only this role at this school. If it's their only role they'll lose access here until re-invited, and they'll be signed out.", label: "Remove role", danger: true, run: () => { removeRole(u.membershipId); setConfirm(null); } });
  }
  function duplicate(u: any) { setOpenMenu(null); setForm({ fullName: "", email: "", role: u.role, password: "" }); setShowAdd(true); setMsg({ kind: "ok", text: `New user form pre-filled with the ${u.roleLabel} role — add their name and email.` }); }
  function openAdd() { setForm({ fullName: "", email: "", role: "Teacher", password: "" }); setShowAdd(true); setMsg(null); }
  function askDeactivate(u: any) { setOpenMenu(null); setConfirm({ title: `Deactivate ${u.user.fullName}?`, message: "They will be signed out and blocked from signing in until reactivated.", label: "Deactivate", danger: true, run: () => { runAction(u.user.id, "disable", "User deactivated."); setConfirm(null); } }); }
  function askSuspend(u: any) { setOpenMenu(null); setConfirm({ title: `Suspend ${u.user.fullName}?`, message: "Access is blocked and live sessions end immediately. You can reactivate later.", label: "Suspend", danger: true, run: () => { runAction(u.user.id, "suspend", "User suspended."); setConfirm(null); } }); }
  function askRevoke(u: any) { setOpenMenu(null); setConfirm({ title: `Revoke access for ${u.user.fullName}?`, message: "This ends all their live sessions at this school immediately. They keep their account but lose access until re-invited.", label: "Revoke access", danger: true, run: () => { runAction(u.user.id, "revoke", "Access revoked."); setConfirm(null); } }); }
  function askBulk(action: string, verb: string, okText: string) { setConfirm({ title: `${verb} ${selIds.length} user${selIds.length === 1 ? "" : "s"}?`, message: "This applies immediately to everyone selected and ends their live sessions.", label: verb, danger: true, run: () => { bulk(action, okText); setConfirm(null); } }); }

  return (
    <>
      <ConfirmDialog open={!!confirm} title={confirm?.title || ""} message={confirm?.message || ""} confirmLabel={confirm?.label || "Confirm"} danger={confirm?.danger} onConfirm={() => confirm?.run()} onCancel={() => setConfirm(null)} />
      <div className="panel">
        <div className="flex-between" style={{ alignItems: "flex-start" }}>
          <div><h2 style={{ margin: 0 }}>Users &amp; roles</h2>
            <p className="sub" style={{ marginBottom: 0 }}>People with access to this school. Roles determine what they can see and do. Sort by any column, filter, select rows for bulk actions, or use the ⋯ menu on a row.</p></div>
          <button onClick={openAdd}>Add user</button>
        </div>
        {msg && <div className={`notice ${msg.kind}`} style={{ marginTop: 10 }}>{msg.text}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "12px 0" }}>
          <input placeholder="Search name, email…" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 240 }} />
          <select value={fRole} onChange={(e) => setFRole(e.target.value)} style={{ width: "auto" }}><option value="">All roles</option>{ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL_MAP[r] || r}</option>)}</select>
          <select value={fStatus} onChange={(e) => setFStatus(e.target.value)} style={{ width: "auto" }}><option value="">All statuses</option>{statuses.map((s) => <option key={s} value={s}>{s}</option>)}</select>
          {(q || fRole || fStatus) && <button className="secondary small" onClick={() => { setQ(""); setFRole(""); setFStatus(""); }}>Clear</button>}
          <span className="muted" style={{ fontSize: 12, marginLeft: "auto" }}>{rows.length === users.length ? `${users.length} user${users.length === 1 ? "" : "s"}` : `${rows.length} of ${users.length}`}</span>
        </div>
        {selIds.length > 0 && (
          <div className="bulkbar">
            <span>{selIds.length} selected</span>
            <button className="secondary small" onClick={() => bulk("reactivate", "Reactivated")}>Reactivate</button>
            <button className="danger small" onClick={() => askBulk("suspend", "Suspend", "Suspended")}>Suspend</button>
            <button className="danger small" onClick={() => askBulk("disable", "Deactivate", "Deactivated")}>Deactivate</button>
            <button className="danger small" onClick={() => askBulk("revoke", "Revoke access for", "Access revoked")}>Revoke</button>
            <button className="secondary small" onClick={() => setSel({})}>Clear</button>
          </div>
        )}
        <table>
          <thead><tr>
            <th className="checkbox-cell"><input type="checkbox" className="rowcheck" checked={allOn} onChange={(e) => setSel(e.target.checked ? Object.fromEntries(rows.map((u) => [u.membershipId, true])) : {})} aria-label="Select all" /></th>
            <SortTh k="name" label="Name" sort={sort} /><SortTh k="email" label="Email" sort={sort} /><SortTh k="role" label="Role" sort={sort} /><SortTh k="status" label="Status" sort={sort} /><SortTh k="mfa" label="MFA" sort={sort} /><th className="right">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.membershipId}>
                <td className="checkbox-cell"><input type="checkbox" className="rowcheck" checked={!!sel[u.membershipId]} onChange={(e) => setSel({ ...sel, [u.membershipId]: e.target.checked })} aria-label={`Select ${u.user.fullName}`} /></td>
                <td>{u.user.fullName}</td>
                <td className="mono">{u.user.email}</td>
                <td>
                  {editing === u.membershipId ? (
                    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                      <select value={editRole} onChange={(e) => setEditRole(e.target.value)}>{ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL_MAP[r] || r}</option>)}</select>
                      <button className="small" onClick={() => changeRole(u.membershipId, editRole)}>Save</button>
                      <button className="secondary small" onClick={() => setEditing(null)}>Cancel</button>
                    </span>
                  ) : (
                    <span className="badge role">{u.roleLabel}</span>
                  )}
                </td>
                <td><span className={`badge ${u.user.status}`}>{u.user.status}</span></td>
                <td>{u.user.mfaEnabled ? "✓" : "—"}</td>
                <td className="right">
                  <span className="kebab-wrap">
                    <button className="kebab-btn" aria-label="Actions" onClick={() => setOpenMenu(openMenu === u.membershipId ? null : u.membershipId)}>⋯</button>
                    {openMenu === u.membershipId && (
                      <>
                        <div className="kebab-backdrop" onClick={() => setOpenMenu(null)} />
                        <div className="kebab-menu">
                          <button onClick={() => { setEditing(u.membershipId); setEditRole(u.role); setOpenMenu(null); }}>Edit role</button>
                          <button onClick={() => askRemoveRole(u)}>Remove this role</button>
                          <button onClick={() => duplicate(u)}>Duplicate</button>
                          <button onClick={() => runAction(u.user.id, "reset_password", "")}>Reset password</button>
                          {u.user.status !== "active" && <button onClick={() => runAction(u.user.id, "reactivate", "User reactivated.")}>Reactivate</button>}
                          <button onClick={() => askSuspend(u)}>Suspend</button>
                          <button onClick={() => askDeactivate(u)}>Deactivate</button>
                          <button className="danger" onClick={() => askRevoke(u)}>Revoke access</button>
                        </div>
                      </>
                    )}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="muted">{users.length ? "No users match your filter." : "No users yet."}</td></tr>}
          </tbody>
        </table>
      </div>
      {showAdd && (
        <div className="modal-overlay" onClick={() => setShowAdd(false)}>
          <div className="modal" style={{ maxWidth: 560, width: "94%" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex-between" style={{ alignItems: "flex-start" }}><h2 style={{ margin: 0 }}>Add a user</h2><button className="secondary small" onClick={() => setShowAdd(false)}>Close</button></div>
            <p className="sub">Leave the password blank to send an email invite instead.</p>
            <form onSubmit={add}>
              <div className="row">
                <div><label>Full name</label><input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required /></div>
                <div><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
              </div>
              <div className="row">
                <div>
                  <label>Role</label>
                  <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                    {ASSIGNABLE_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL_MAP[r] || r}</option>)}
                  </select>
                </div>
                <div><label>Temporary password (optional)</label><input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              </div>
              <button type="submit" style={{ marginTop: 16 }}>Add user</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}


function ProfileTab({ email }: { email?: string }) {
  const [p, setP] = useState<any>(null);
  const [f, setF] = useState<any>({ fullName: "", phone: "", photoUrl: "" });
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  const load = useCallback(async () => {
    const d = await fetch("/api/me/profile").then((r) => r.json());
    setP(d.profile); if (d.profile) setF({ fullName: d.profile.fullName || "", phone: d.profile.phone || "", photoUrl: d.profile.photoUrl || "" });
  }, []);
  useEffect(() => { load(); }, [load]);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    const res = await fetch("/api/me/profile", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || d.error) { setMsg({ kind: "err", text: d.error || "Failed" }); return; }
    setMsg({ kind: "ok", text: "Profile saved." }); load();
  }
  if (!p) return <div className="panel">Loading…</div>;
  const name = f.fullName || p.fullName || email || "";
  const inits = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w: string) => w[0]?.toUpperCase()).join("") || "?";
  return (
    <>
      <div className="panel">
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          {f.photoUrl ? <img src={f.photoUrl} alt={name} width={64} height={64} style={{ width: 64, height: 64, borderRadius: "50%", objectFit: "cover" }} />
            : <span style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#0ea5e9)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700 }}>{inits}</span>}
          <div>
            <h2 style={{ marginBottom: 2 }}>{name}</h2>
            <div className="muted">{p.email}{p.roles?.length ? ` · ${p.roles.join(", ")}` : ""}</div>
            {p.schools?.length ? <div className="muted" style={{ fontSize: 12 }}>{p.schools.join(", ")}</div> : null}
          </div>
        </div>
      </div>
      <div className="panel">
        <h2>My profile</h2>
        <p className="sub">Your personal details. This is separate from the school&apos;s information (see School configuration). Email and role are managed by your school and can&apos;t be changed here.</p>
        {msg && <div className={`notice ${msg.kind}`}>{msg.text}</div>}
        <form onSubmit={save}>
          <div className="row">
            <div><label>Full name</label><input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} required /></div>
            <div><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
          </div>
          <label>Email (read-only)</label>
          <input value={p.email} disabled />
          <label>Profile image URL</label>
          <input value={f.photoUrl} onChange={(e) => setF({ ...f, photoUrl: e.target.value })} placeholder="https://…" />
          <div style={{ marginTop: 8 }}><span className="muted" style={{ fontSize: 12 }}>Two-factor authentication: {p.mfaEnabled ? "on" : "off"} — manage under My security.</span></div>
          <button type="submit" style={{ marginTop: 12 }}>Save profile</button>
        </form>
      </div>
    </>
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
